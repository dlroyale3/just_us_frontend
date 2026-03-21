# Just Us API Reference (v0.4)

Last updated: 2026-03-09

This document describes the business API implemented in the current codebase.

## 1. Scope

Implemented HTTP endpoints:

- `POST /auth/google`
- `POST /auth/refresh`
- `DELETE /auth/logout`
- `GET /me`
- `POST /accept_invite`
- `POST /scheduled_messages`
- `GET /scheduled_messages/sent`
- `GET /scheduled_messages/received`
- `PUT /scheduled_messages/:id`
- `DELETE /scheduled_messages/:id`
- `GET /live_messages`
- `POST /live_messages`
- `PATCH /live_messages/read`
- `GET /up`

Implemented WebSocket endpoint:

- `GET /cable` (ActionCable upgrade)

Out of scope:

- Rails internal framework endpoints under `/rails/*`

Not implemented yet:

- Media attachments in live chat messages

## 2. Base URLs

- Production: `https://justus.chat`
- Development: `http://localhost:3000`

WebSocket URL examples:

- Development: `ws://localhost:3000/cable?token=<access_token>`
- Production: `wss://justus.chat/cable?token=<access_token>`

## 3. Conventions

### 3.1 Content type

JSON requests should send:

- `Content-Type: application/json`

### 3.2 Authorization header

Protected HTTP routes use:

- `Authorization: Bearer <token>`

### 3.3 Error shape

Errors are rendered with this shape:

```json
{
  "error": "error_code",
  "message": "human readable message"
}
```

## 4. Authentication Model

Authentication flow:

- Google ID token verification at login
- Access token for protected API routes
- Refresh token for obtaining new access tokens

Token details:

- Access token TTL: `15` minutes
- Refresh token TTL: `30` days
- JWT algorithm: `HS256`
- JWT secret: `Rails.application.credentials.secret_key_base`

JWT payload example:

```json
{
  "user_id": 123,
  "type": "access",
  "exp": 1760000000
}
```

Supported `type` values:

- `access`
- `refresh`

## 5. Data Model (API-relevant)

### 5.1 User

- `id`
- `name`
- `email`
- `picture`
- `invite_code`
- `refresh_token`
- `last_read_message_id`
- `last_seen_at`
- `created_at`
- `updated_at`

Constraints:

- unique index on `email`
- unique index on `invite_code`
- non-null for `email`, `name`, `picture`, `invite_code`

### 5.2 Couple

- `id`
- `user1_id`
- `user2_id`
- `created_at`
- `updated_at`

Constraints:

- `user1_id` and `user2_id` are unique and non-null
- foreign keys to users with `on_delete: :cascade`

### 5.3 ScheduledMessage

- `id`
- `couple_id`
- `sender_id`
- `content`
- `unlock_date`
- `is_read`
- `created_at`
- `updated_at`

Constraints and validations:

- required: `couple_id`, `sender_id`, `content`, `unlock_date`
- create validation: `unlock_date` cannot be in the past
- update validation: edit is blocked if original `unlock_date` was before today
- destroy callback: delete is blocked if `unlock_date <= Date.current`

### 5.4 LiveMessage

- `id`
- `couple_id`
- `sender_id`
- `content`
- `created_at`
- `updated_at`

Constraints and validations:

- required: `couple_id`, `sender_id`, `content`
- foreign key from `couple_id` to `couples` with `on_delete: :cascade`
- foreign key from `sender_id` to `users` with `on_delete: :cascade`
- index for chat pagination: `[:couple_id, :id]`

## 6. Endpoint Reference

### 6.1 POST /auth/google

Verifies Google credential and returns user with access/refresh tokens.

Request:

```http
POST /auth/google
Content-Type: application/json
```

Body:

```json
{
  "credential": "<google_oidc_token>"
}
```

Success (`200 OK`):

```json
{
  "message": "User added succesfully. Successfully generated Access and Refresh Tokens",
  "user": {
    "id": 1,
    "name": "Jane Doe",
    "email": "jane@example.com",
    "picture": "https://...",
    "invite_code": "A4X9BQ",
    "refresh_token": "<jwt_refresh_token>",
    "created_at": "2026-03-08T10:00:00.000Z",
    "updated_at": "2026-03-08T10:00:00.000Z"
  },
  "access_token": "<jwt_access_token>",
  "refresh_token": "<jwt_refresh_token>"
}
```

Notes:

- Existing user message starts with `User already exists.`
- New user message starts with `User added succesfully.` (spelling matches implementation)
- refresh token is persisted to DB

Errors:

- `500`: `server_configuration_error`
- `401`: `failed_authentication`

### 6.2 POST /auth/refresh

Validates refresh token and issues a new access token.

Request:

```http
POST /auth/refresh
Authorization: Bearer <refresh_token>
```

Success (`200 OK`):

```json
{
  "message": "Successfully created new Access Token",
  "user": {
    "id": 1,
    "name": "Jane Doe",
    "email": "jane@example.com",
    "picture": "https://...",
    "invite_code": "A4X9BQ",
    "refresh_token": "<jwt_refresh_token>",
    "created_at": "2026-03-08T10:00:00.000Z",
    "updated_at": "2026-03-08T10:05:00.000Z"
  },
  "access_token": "<new_access_token>"
}
```

Errors:

- `401`: `no_token`
- `401`: `invalid_token_type` (when token is not `refresh`)
- `401`: `token_revoked` (token does not match DB value)
- `401`: `expired_refresh_token`
- `401`: `user_not_found`
- `401`: `failed_authentication`
- `500`: `server_configuration_error`

### 6.3 DELETE /auth/logout

Revokes current user session by nulling stored refresh token.

Request:

```http
DELETE /auth/logout
Authorization: Bearer <access_token>
```

Success (`200 OK`):

```json
{
  "message": "Successfully logged out."
}
```

Errors:

- `401`: access guard errors (`no_token`, `invalid_token_type`, `expired_access_token`, `invalid_token`, `user_not_found`)
- `500`: `failed_logout`

### 6.4 GET /me

Returns authenticated user plus pairing state.

Request:

```http
GET /me
Authorization: Bearer <access_token>
```

Success (`200 OK`):

```json
{
  "user": { "id": 1, "name": "Jane Doe", "email": "jane@example.com" },
  "has_partner": true,
  "partner": { "id": 2, "name": "John Doe", "email": "john@example.com" }
}
```

If not paired:

- `has_partner: false`
- `partner: null`

Errors:

- `401`: access guard errors
- `500`: `server_error`

### 6.5 POST /accept_invite

Pairs current user with another user by invite code.

Request:

```http
POST /accept_invite
Authorization: Bearer <access_token>
Content-Type: application/json
```

Body:

```json
{
  "invite_code": "A4X9BQ"
}
```

Success (`200 OK`):

```json
{
  "message": "Successfully paired with John Doe!",
  "partner": {
    "id": 2,
    "name": "John Doe",
    "email": "john@example.com",
    "picture": "https://...",
    "invite_code": "A4X9BQ"
  }
}
```

Validation rules:

- invite code required
- invite code must match existing user
- cannot pair with self
- current user must not already be paired
- target user must not already be paired

Errors:

- `500`: `missing_invite_code`
- `401`: `invalid_invite_code`
- `401`: `invalid_action`
- `401`: `already_paired`
- `401`: `partner_already_paired`
- `500`: `failed_pairing`
- `401`: access guard errors

### 6.6 POST /scheduled_messages

Creates a scheduled message in current user's couple vault.

Request:

```http
POST /scheduled_messages
Authorization: Bearer <access_token>
Content-Type: application/json
```

Body:

```json
{
  "content": "Happy anniversary, open this tomorrow",
  "unlock_date": "2026-03-10"
}
```

Success (`200 OK`):

```json
{
  "message": "Time capsule successfully buried!",
  "data": {
    "id": 1,
    "couple_id": 2,
    "sender_id": 3,
    "content": "Happy anniversary, open this tomorrow",
    "unlock_date": "2026-03-10",
    "is_read": false,
    "created_at": "2026-03-09T12:00:00.000Z",
    "updated_at": "2026-03-09T12:00:00.000Z"
  }
}
```

Errors:

- `401`: `not_paired`
- `500`: `message_creation_failed` (validation or persistence failures)
- `401`: access guard errors

### 6.7 GET /scheduled_messages/sent

Returns current user's sent scheduled messages for current couple.

Request:

```http
GET /scheduled_messages/sent
Authorization: Bearer <access_token>
```

Success (`200 OK`):

```json
{
  "messages": [
    {
      "id": 7,
      "content": "...",
      "unlock_date": "2026-03-12"
    }
  ]
}
```

Ordering:

- `unlock_date DESC`, then `created_at DESC`

Errors:

- `401`: `not_paired`
- `401`: access guard errors

### 6.8 GET /scheduled_messages/received

Returns unlocked partner messages from current couple.

Request:

```http
GET /scheduled_messages/received
Authorization: Bearer <access_token>
```

Optional query param:

- `filter=today` returns only messages with `unlock_date == Date.current`

Success (`200 OK`):

```json
{
  "messages": [
    {
      "id": 8,
      "sender_id": 11,
      "content": "...",
      "unlock_date": "2026-03-09"
    }
  ]
}
```

Rules:

- only same-couple messages
- excludes current user's own messages
- only unlocked messages (`unlock_date <= Date.current`)

Errors:

- `401`: `not_paired`
- `401`: access guard errors

### 6.9 PUT /scheduled_messages/:id

Updates an existing scheduled message.

Request:

```http
PUT /scheduled_messages/:id
Authorization: Bearer <access_token>
Content-Type: application/json
```

Body:

```json
{
  "content": "Updated text",
  "unlock_date": "2026-03-15"
}
```

Success (`200 OK`):

```json
{
  "message": "Capsule updated successfully!",
  "data": {
    "id": 1,
    "content": "Updated text",
    "unlock_date": "2026-03-15"
  }
}
```

Errors:

- `500`: `message_not_found`
- `401`: `forbidden` (message not in your couple)
- `401`: `forbidden` (not message sender)
- `500`: `message_update_failed`
- `401`: `not_paired`
- `401`: access guard errors

Implementation note:

- model update guard blocks edits when previous unlock date is before current date

### 6.10 DELETE /scheduled_messages/:id

Deletes an existing scheduled message.

Request:

```http
DELETE /scheduled_messages/:id
Authorization: Bearer <access_token>
```

Success (`200 OK`):

```json
{
  "message": "Capsule permanently destroyed."
}
```

Errors:

- `500`: `message_not_found`
- `401`: `forbidden` (message not in your couple)
- `401`: `forbidden` (not message sender)
- `500`: `message_deletion_failed`
- `401`: `not_paired`
- `401`: access guard errors

Implementation note:

- destroy is blocked when `unlock_date <= Date.current`

### 6.11 GET /live_messages

Returns paginated live chat history for current user's couple.

Request:

```http
GET /live_messages
Authorization: Bearer <access_token>
```

Optional query param:

- `before_id=<integer>` for cursor-based pagination (`id < before_id`)

Success (`200 OK`):

```json
{
  "messages": [
    {
      "id": 101,
      "couple_id": 2,
      "sender_id": 7,
      "content": "Hi",
      "created_at": "2026-03-09T15:00:00.000Z",
      "updated_at": "2026-03-09T15:00:00.000Z"
    }
  ],
  "pagination": {
    "returned": 1,
    "next_before_id": 101
  },
  "partner_state": {
    "user_id": 8,
    "last_read_message_id": 95,
    "last_seen_at": "2026-03-09T14:58:00.000Z"
  }
}
```

Rules:

- user must be paired
- only current couple messages are returned
- ordered by `id DESC` internally and reversed in response (chronological)
- page size is fixed to `50`

Errors:

- `400`: `invalid_before_id`
- `401`: `not_paired`
- `401`: access guard errors

### 6.12 POST /live_messages

Creates a live message and broadcasts it in real time over ActionCable.

Request:

```http
POST /live_messages
Authorization: Bearer <access_token>
Content-Type: application/json
```

Body:

```json
{
  "content": "Typing from REST, delivered on WebSocket"
}
```

Success (`201 Created`):

```json
{
  "message": "Live message sent successfully.",
  "data": {
    "id": 102,
    "couple_id": 2,
    "sender_id": 7,
    "content": "Typing from REST, delivered on WebSocket",
    "created_at": "2026-03-09T15:01:00.000Z",
    "updated_at": "2026-03-09T15:01:00.000Z"
  }
}
```

Errors:

- `422`: `live_message_creation_failed`
- `401`: `not_paired`
- `401`: access guard errors

### 6.13 PATCH /live_messages/read

Updates read watermark for current user and broadcasts read receipt.

Request:

```http
PATCH /live_messages/read
Authorization: Bearer <access_token>
Content-Type: application/json
```

Body:

```json
{
  "message_id": 102
}
```

Success (`200 OK`):

```json
{
  "message": "Read receipt updated.",
  "last_read_message_id": 102
}
```

Rules:

- `message_id` must be a positive integer
- message must belong to current user's couple
- watermark is monotonic (`max(current_watermark, message_id)`)

Errors:

- `400`: `invalid_message_id`
- `404`: `live_message_not_found`
- `422`: `read_receipt_update_failed`
- `401`: `not_paired`
- `401`: access guard errors

### 6.14 GET /up

Rails health-check endpoint.

Request:

```http
GET /up
```

Responses:

- `200` when app boot/health is OK
- `500` when boot/health fails

## 7. WebSocket Protocol (ActionCable)

Endpoint:

- `/cable`

Authentication:

- Query param `token` is required: `/cable?token=<access_token>`
- Token must be valid JWT access token (`type == access`)

Subscription:

- Client subscribes to `CoupleChannel`
- Server streams from `couple_<couple_id>_channel`

Server-sent event payloads currently used:

- New message:

```json
{
  "event": "new_message",
  "message": {
    "id": 102,
    "couple_id": 2,
    "sender_id": 7,
    "content": "...",
    "created_at": "...",
    "updated_at": "..."
  }
}
```

- Presence online:

```json
{
  "event": "presence",
  "status": "online",
  "user_id": 7
}
```

- Presence offline:

```json
{
  "event": "presence",
  "status": "offline",
  "user_id": 7,
  "last_seen_at": "2026-03-09T15:04:00.000Z"
}
```

- Typing:

```json
{
  "event": "typing",
  "user_id": 7,
  "is_typing": true
}
```

- Read receipt:

```json
{
  "event": "read_receipt",
  "user_id": 7,
  "last_read_id": 102
}
```

Client-to-server channel action currently used:

- `typing` with payload `{ "is_typing": true|false }`

## 8. Access Guard Behavior (HTTP)

`ApplicationController#authorize_request` enforces:

- required bearer token
- token type must be `access`
- token must decode successfully
- user in token payload must exist

Guard error codes:

- `no_token`
- `invalid_token_type`
- `expired_access_token`
- `invalid_token`
- `user_not_found`
- `server_error` (unexpected error)

## 9. CORS and ActionCable Origins

HTTP CORS allowed origins:

- `http://127.0.0.1:5501`
- `http://localhost:5501`

HTTP methods:

- `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `OPTIONS`, `HEAD`

ActionCable allowed origins:

- Development:
  - `http://127.0.0.1:5501`
  - `http://localhost:5501`
  - `http://localhost:3000`
- Production:
  - `https://justus.chat`
  - `https://www.justus.chat`

## 10. cURL Quickstart

Google login:

```bash
curl -X POST "http://localhost:3000/auth/google" \
  -H "Content-Type: application/json" \
  -d '{"credential":"<google_oidc_token>"}'
```

Get profile:

```bash
curl -X GET "http://localhost:3000/me" \
  -H "Authorization: Bearer <access_token>"
```

Create live message:

```bash
curl -X POST "http://localhost:3000/live_messages" \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d '{"content":"hello from REST"}'
```

Get older messages using cursor:

```bash
curl -X GET "http://localhost:3000/live_messages?before_id=102" \
  -H "Authorization: Bearer <access_token>"
```

Mark as read:

```bash
curl -X PATCH "http://localhost:3000/live_messages/read" \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d '{"message_id":102}'
```

## 11. Versioning Notes

Current API has no URL version prefix.

Recommended next step before breaking changes:

- introduce `/v1` namespace

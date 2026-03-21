import { getRefreshToken, saveAccessToken } from "../utils/authStorage";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000";
let unauthorizedHandler = null;
let serverDownHandler = null;
let accessTokenRefreshPromise = null;

export class ApiError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = "ApiError";
    this.status = options.status;
    this.errorCode = options.errorCode;
    this.data = options.data;
  }
}

export function setUnauthorizedHandler(handler) {
  unauthorizedHandler = handler;
}

export function setServerDownHandler(handler) {
  serverDownHandler = handler;
}

function isServerUnavailableStatus(status) {
  return status === 500 || status === 502 || status === 503 || status === 504;
}

function messageLooksLikeConnectivityIssue(message) {
  if (typeof message !== "string") {
    return false;
  }

  return /network error|failed to fetch|load failed/i.test(message);
}

export function isConnectivityError(error) {
  if (error instanceof ApiError) {
    return isServerUnavailableStatus(error.status);
  }

  if (!error || typeof error !== "object") {
    return false;
  }

  const typedError = error;
  return messageLooksLikeConnectivityIssue(typedError.message);
}

export function isTerminalRefreshAuthError(error) {
  return error instanceof ApiError && (error.status === 401 || error.status === 403);
}

function notifyServerDown() {
  if (typeof serverDownHandler === "function") {
    serverDownHandler();
  }
}

async function requestJson(path, options = {}) {
  const headers = {
    Accept: "application/json"
  };

  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }

  let response;

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method: options.method ?? "GET",
      credentials: "include",
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined
    });
  } catch (error) {
    if (!options.skipServerDownHandler) {
      notifyServerDown();
    }
    throw error;
  }

  const rawBody = await response.text();
  const payload = rawBody ? safeJsonParse(rawBody) : null;

  if (!response.ok) {
    const apiError = new ApiError(payload?.message ?? `Request failed (${response.status})`, {
      status: response.status,
      errorCode: payload?.error,
      data: payload
    });

    const shouldTrySilentRefresh =
      response.status === 401 &&
      Boolean(options.token) &&
      !options.skipTokenRefresh &&
      !options.isRefreshRequest;

    if (shouldTrySilentRefresh) {
      try {
        const nextAccessToken = await silentlyRefreshAccessToken();

        return requestJson(path, {
          ...options,
          token: nextAccessToken,
          skipTokenRefresh: true
        });
      } catch (refreshError) {
        if (isTerminalRefreshAuthError(refreshError)) {
          if (!options.skipUnauthorizedHandler && typeof unauthorizedHandler === "function") {
            unauthorizedHandler(refreshError);
          }

          throw refreshError;
        }

        throw refreshError;
      }
    }

    if (isServerUnavailableStatus(response.status) && !options.skipServerDownHandler) {
      notifyServerDown();
    }

    if (
      response.status === 401 &&
      !options.skipUnauthorizedHandler &&
      typeof unauthorizedHandler === "function"
    ) {
      unauthorizedHandler(apiError);
    }

    throw apiError;
  }

  return payload;
}

async function silentlyRefreshAccessToken() {
  if (accessTokenRefreshPromise) {
    return accessTokenRefreshPromise;
  }

  const refreshToken = getRefreshToken();

  if (!refreshToken) {
    throw new ApiError("Your session expired. Please sign in again.", {
      status: 401,
      errorCode: "missing_refresh_token"
    });
  }

  accessTokenRefreshPromise = requestJson("/auth/refresh", {
    method: "POST",
    token: refreshToken,
    skipUnauthorizedHandler: true,
    isRefreshRequest: true,
    skipTokenRefresh: true
  })
    .then((payload) => {
      const nextAccessToken = payload?.access_token;

      if (!nextAccessToken || typeof nextAccessToken !== "string") {
        throw new ApiError("Your session expired. Please sign in again.", {
          status: 401,
          errorCode: "invalid_refresh_payload"
        });
      }

      saveAccessToken(nextAccessToken);
      return nextAccessToken;
    })
    .finally(() => {
      accessTokenRefreshPromise = null;
    });

  return accessTokenRefreshPromise;
}

function safeJsonParse(value) {
  try {
    return JSON.parse(value);
  } catch {
    return { message: value };
  }
}

function withQuery(path, queryParams = {}) {
  const urlSearchParams = new URLSearchParams();

  Object.entries(queryParams).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") {
      return;
    }

    urlSearchParams.set(key, String(value));
  });

  const serializedQuery = urlSearchParams.toString();
  return serializedQuery ? `${path}?${serializedQuery}` : path;
}

export function getFriendlyApiError(error, fallbackMessage) {
  if (error instanceof ApiError && error.message) {
    return error.message;
  }

  return fallbackMessage;
}

export function signInWithGoogle(token) {
  return requestJson("/auth/google", {
    method: "POST",
    body: { token }
  });
}

export function refreshAccessToken(refreshToken, options = {}) {
  return requestJson("/auth/refresh", {
    method: "POST",
    token: refreshToken,
    skipUnauthorizedHandler: options.skipUnauthorizedHandler,
    isRefreshRequest: true,
    skipTokenRefresh: true
  });
}

export function getCurrentUser(accessToken, options = {}) {
  return requestJson("/me", {
    method: "GET",
    token: accessToken,
    skipUnauthorizedHandler: options.skipUnauthorizedHandler,
    skipServerDownHandler: options.skipServerDownHandler
  });
}

export function getInvitePreview(inviteCode) {
  return requestJson(`/invites/${encodeURIComponent(inviteCode)}`, {
    method: "GET",
    skipUnauthorizedHandler: true
  });
}

export function acceptInvite(accessToken, inviteCode, options = {}) {
  return requestJson("/accept_invite", {
    method: "POST",
    token: accessToken,
    body: { invite_code: inviteCode },
    skipUnauthorizedHandler: options.skipUnauthorizedHandler
  });
}

export function logoutSession(accessToken) {
  return requestJson("/auth/logout", {
    method: "DELETE",
    token: accessToken,
    skipUnauthorizedHandler: true
  });
}

export function getReceivedScheduledMessages(accessToken, options = {}) {
  const safePage = Number.isFinite(Number(options.page))
    ? Math.max(1, Math.floor(Number(options.page)))
    : undefined;
  const normalizedSearch =
    typeof options.searchQuery === "string" ? options.searchQuery.trim() : "";
  const normalizedDate =
    typeof options.date === "string" ? options.date.trim() : "";

  return requestJson(
    withQuery("/scheduled_messages/received", {
      filter: options.filter,
      page: safePage,
      date: normalizedDate,
      search_query: normalizedSearch,
      query: normalizedSearch
    }),
    {
      method: "GET",
      token: accessToken,
      skipUnauthorizedHandler: options.skipUnauthorizedHandler
    }
  );
}

export function createScheduledMessage(accessToken, options = {}) {
  const normalizedContent =
    typeof options.content === "string" ? options.content.trim() : "";
  const normalizedUnlockDate =
    typeof options.unlockDate === "string" ? options.unlockDate.trim() : "";

  return requestJson("/scheduled_messages", {
    method: "POST",
    token: accessToken,
    body: {
      content: normalizedContent,
      unlock_date: normalizedUnlockDate
    },
    skipUnauthorizedHandler: options.skipUnauthorizedHandler
  });
}

export function getSentScheduledMessages(accessToken, options = {}) {
  const safePage = Number.isFinite(Number(options.page))
    ? Math.max(1, Math.floor(Number(options.page)))
    : undefined;
  const normalizedSearch =
    typeof options.searchQuery === "string" ? options.searchQuery.trim() : "";
  const normalizedDate =
    typeof options.date === "string" ? options.date.trim() : "";

  return requestJson(
    withQuery("/scheduled_messages/sent", {
      page: safePage,
      date: normalizedDate,
      search_query: normalizedSearch,
      query: normalizedSearch
    }),
    {
      method: "GET",
      token: accessToken,
      skipUnauthorizedHandler: options.skipUnauthorizedHandler
    }
  );
}

export function getSentScheduledMessageDates(accessToken, options = {}) {
  const normalizedMonth =
    typeof options.month === "string" ? options.month.trim() : "";

  return requestJson(
    withQuery("/scheduled_messages/sent_dates", {
      month: normalizedMonth
    }),
    {
      method: "GET",
      token: accessToken,
      skipUnauthorizedHandler: options.skipUnauthorizedHandler
    }
  );
}

export function updateScheduledMessage(accessToken, messageId, options = {}) {
  const normalizedId = encodeURIComponent(String(messageId));
  const normalizedContent =
    typeof options.content === "string" ? options.content.trim() : "";
  const normalizedUnlockDate =
    typeof options.unlockDate === "string" ? options.unlockDate.trim() : "";

  return requestJson(`/scheduled_messages/${normalizedId}`, {
    method: "PUT",
    token: accessToken,
    body: {
      content: normalizedContent,
      unlock_date: normalizedUnlockDate
    },
    skipUnauthorizedHandler: options.skipUnauthorizedHandler
  });
}

export function deleteScheduledMessage(accessToken, messageId, options = {}) {
  const normalizedId = encodeURIComponent(String(messageId));

  return requestJson(`/scheduled_messages/${normalizedId}`, {
    method: "DELETE",
    token: accessToken,
    skipUnauthorizedHandler: options.skipUnauthorizedHandler
  });
}

export function getReceivedScheduledMessageDates(accessToken, options = {}) {
  const normalizedMonth =
    typeof options.month === "string" ? options.month.trim() : "";

  return requestJson(
    withQuery("/scheduled_messages/received_dates", {
      month: normalizedMonth
    }),
    {
      method: "GET",
      token: accessToken,
      skipUnauthorizedHandler: options.skipUnauthorizedHandler
    }
  );
}

export function getLiveMessages(accessToken, options = {}) {
  const beforeId = Number(options.beforeId);
  const normalizedBeforeId = Number.isInteger(beforeId) && beforeId > 0
    ? beforeId
    : undefined;

  return requestJson(
    withQuery("/live_messages", {
      before_id: normalizedBeforeId
    }),
    {
      method: "GET",
      token: accessToken,
      skipUnauthorizedHandler: options.skipUnauthorizedHandler
    }
  );
}

export function sendLiveMessage(accessToken, options = {}) {
  const normalizedContent =
    typeof options.content === "string" ? options.content.trim() : "";
  const numericReplyToId = Number(options.replyToId);
  const normalizedReplyToId = Number.isInteger(numericReplyToId) && numericReplyToId > 0
    ? numericReplyToId
    : null;
  const requestBody = {
    content: normalizedContent
  };

  if (normalizedReplyToId) {
    requestBody.reply_to_id = normalizedReplyToId;
  }

  return requestJson("/live_messages", {
    method: "POST",
    token: accessToken,
    body: requestBody,
    skipUnauthorizedHandler: options.skipUnauthorizedHandler
  });
}

export function updateLiveMessage(accessToken, messageId, options = {}) {
  const normalizedId = encodeURIComponent(String(messageId));
  const normalizedContent =
    typeof options.content === "string" ? options.content.trim() : "";

  return requestJson(`/live_messages/${normalizedId}`, {
    method: "PATCH",
    token: accessToken,
    body: {
      content: normalizedContent
    },
    skipUnauthorizedHandler: options.skipUnauthorizedHandler
  });
}

export function deleteLiveMessage(accessToken, messageId, options = {}) {
  const normalizedId = encodeURIComponent(String(messageId));

  return requestJson(`/live_messages/${normalizedId}`, {
    method: "DELETE",
    token: accessToken,
    skipUnauthorizedHandler: options.skipUnauthorizedHandler
  });
}

export function markLiveMessagesRead(accessToken, options = {}) {
  const numericMessageId = Number(options.messageId);
  const normalizedMessageId = Number.isInteger(numericMessageId) && numericMessageId > 0
    ? numericMessageId
    : 0;

  return requestJson("/live_messages/read", {
    method: "PATCH",
    token: accessToken,
    body: {
      message_id: normalizedMessageId
    },
    skipUnauthorizedHandler: options.skipUnauthorizedHandler
  });
}

export function markScheduledMessagesRead(accessToken, options = {}) {
  return requestJson("/scheduled_messages/mark_read", {
    method: "PATCH",
    token: accessToken,
    skipUnauthorizedHandler: options.skipUnauthorizedHandler
  });
}

export function getNotifications(accessToken, options = {}) {
  return requestJson("/notifications", {
    method: "GET",
    token: accessToken,
    skipUnauthorizedHandler: options.skipUnauthorizedHandler
  });
}

export async function healthCheckServer() {
  const response = await fetch(`${API_BASE_URL}/up`, {
    method: "GET",
    headers: {
      Accept: "application/json, text/plain"
    }
  });

  if (response.status !== 200) {
    throw new ApiError(`Health check failed (${response.status})`, {
      status: response.status
    });
  }

  return true;
}

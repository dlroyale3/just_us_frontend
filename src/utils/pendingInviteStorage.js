const PENDING_INVITE_CODE_KEY = "pending_invite_code";
const PENDING_INVITE_NAME_KEY = "pending_invite_name";

function readFromStorage(storage, key) {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function writeToStorage(storage, key, value) {
  try {
    if (value) {
      storage.setItem(key, value);
    } else {
      storage.removeItem(key);
    }
  } catch {
    // Ignore storage access errors and keep UX resilient.
  }
}

export function getPendingInviteCode() {
  if (typeof window === "undefined") {
    return null;
  }

  return readFromStorage(window.sessionStorage, PENDING_INVITE_CODE_KEY);
}

export function getPendingInviteName() {
  if (typeof window === "undefined") {
    return null;
  }

  return readFromStorage(window.sessionStorage, PENDING_INVITE_NAME_KEY);
}

export function getPendingInviteContext() {
  const code = getPendingInviteCode();
  const name = getPendingInviteName();

  if (!code || !name) {
    return null;
  }

  return { code, name };
}

export function setPendingInviteCode(inviteCode) {
  if (typeof window === "undefined") {
    return;
  }

  writeToStorage(window.sessionStorage, PENDING_INVITE_CODE_KEY, inviteCode);
}

export function setPendingInviteName(inviteName) {
  if (typeof window === "undefined") {
    return;
  }

  writeToStorage(window.sessionStorage, PENDING_INVITE_NAME_KEY, inviteName);
}

export function setPendingInviteContext(inviteCode, inviteName) {
  setPendingInviteCode(inviteCode);
  setPendingInviteName(inviteName);
}

export function clearPendingInviteCode() {
  if (typeof window === "undefined") {
    return;
  }

  writeToStorage(window.sessionStorage, PENDING_INVITE_CODE_KEY, null);
}

export function clearPendingInviteName() {
  if (typeof window === "undefined") {
    return;
  }

  writeToStorage(window.sessionStorage, PENDING_INVITE_NAME_KEY, null);
}

export function clearPendingInviteContext() {
  clearPendingInviteCode();
  clearPendingInviteName();
}

export { PENDING_INVITE_CODE_KEY, PENDING_INVITE_NAME_KEY };
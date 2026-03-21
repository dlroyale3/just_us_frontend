function isRuntimeAvatarDebugEnabled() {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    return window.localStorage.getItem("justus_debug_avatars") === "1";
  } catch {
    return false;
  }
}

export function isAvatarDebugEnabled() {
  return import.meta.env.DEV || isRuntimeAvatarDebugEnabled();
}

export function summarizeAvatarUrl(value) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const parsed = new URL(trimmed);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return trimmed.slice(0, 120);
  }
}

export function logAvatarDebug(eventName, payload = {}) {
  if (!isAvatarDebugEnabled()) {
    return;
  }

  void eventName;
  void payload;
}

export const ACCESS_TOKEN_KEY = "justus_access_token";
export const REFRESH_TOKEN_KEY = "justus_refresh_token";
export const USER_PROFILE_KEY = "justus_user_profile";
export const LEGACY_AUTH_KEY = "justus.auth.v1";

const SESSION_STORAGE_KEYS = [ACCESS_TOKEN_KEY, REFRESH_TOKEN_KEY, USER_PROFILE_KEY, LEGACY_AUTH_KEY];

function readLegacyAuthPayload() {
  const rawValue = localStorage.getItem(LEGACY_AUTH_KEY);

  if (!rawValue) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawValue);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function readLegacyToken(camelCaseKey, snakeCaseKey) {
  const payload = readLegacyAuthPayload();

  if (!payload) {
    return null;
  }

  const camelCaseValue = payload[camelCaseKey];
  if (typeof camelCaseValue === "string" && camelCaseValue.trim().length > 0) {
    return camelCaseValue;
  }

  const snakeCaseValue = payload[snakeCaseKey];
  if (typeof snakeCaseValue === "string" && snakeCaseValue.trim().length > 0) {
    return snakeCaseValue;
  }

  return null;
}

export function getAccessToken() {
  return localStorage.getItem(ACCESS_TOKEN_KEY) ?? readLegacyToken("accessToken", "access_token");
}

export function getRefreshToken() {
  return localStorage.getItem(REFRESH_TOKEN_KEY) ?? readLegacyToken("refreshToken", "refresh_token");
}

export function saveAccessToken(token) {
  localStorage.setItem(ACCESS_TOKEN_KEY, token);
}

export function saveRefreshToken(token) {
  localStorage.setItem(REFRESH_TOKEN_KEY, token);
}

export function saveAuthTokens({ accessToken, refreshToken }) {
  if (accessToken) {
    saveAccessToken(accessToken);
  }

  if (refreshToken) {
    saveRefreshToken(refreshToken);
  }
}

export function saveStoredProfile(profileState) {
  if (!profileState || typeof profileState !== "object") {
    localStorage.removeItem(USER_PROFILE_KEY);
    return;
  }

  const normalizedStatus =
    profileState.status === "paired" || profileState.status === "unpaired"
      ? profileState.status
      : null;

  if (!normalizedStatus) {
    localStorage.removeItem(USER_PROFILE_KEY);
    return;
  }

  const payload = {
    status: normalizedStatus,
    user: profileState.user ?? null,
    partner: profileState.partner ?? null
  };

  try {
    localStorage.setItem(USER_PROFILE_KEY, JSON.stringify(payload));
  } catch {
    // Best effort cache only.
  }
}

export function getStoredProfile() {
  const rawValue = localStorage.getItem(USER_PROFILE_KEY);

  if (!rawValue) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawValue);

    if (!parsed || typeof parsed !== "object") {
      return null;
    }

    const status = parsed.status;
    if (status !== "paired" && status !== "unpaired") {
      return null;
    }

    return {
      status,
      user: parsed.user ?? null,
      partner: parsed.partner ?? null,
      error: null
    };
  } catch {
    return null;
  }
}

export function clearAuthTokens() {
  SESSION_STORAGE_KEYS.forEach((key) => {
    localStorage.removeItem(key);
  });
}

export function hasStoredSession() {
  return Boolean(getAccessToken() || getRefreshToken());
}

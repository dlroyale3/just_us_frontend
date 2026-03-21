import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  acceptInvite,
  ApiError,
  getCurrentUser,
  getFriendlyApiError,
  healthCheckServer,
  isConnectivityError,
  isTerminalRefreshAuthError,
  logoutSession,
  refreshAccessToken,
  setServerDownHandler,
  setUnauthorizedHandler,
  signInWithGoogle
} from "../services/apiClient";
import {
  ACCESS_TOKEN_KEY,
  LEGACY_AUTH_KEY,
  REFRESH_TOKEN_KEY,
  clearAuthTokens,
  getStoredProfile,
  getAccessToken,
  getRefreshToken,
  hasStoredSession,
  saveAccessToken,
  saveStoredProfile,
  saveAuthTokens
} from "../utils/authStorage";

const AuthContext = createContext(null);

function debugAuth(eventName, payload = {}) {
  void eventName;
  void payload;
}

function summarizeAvatarUrl(value) {
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

function toStatus(hasPartner) {
  return hasPartner ? "paired" : "unpaired";
}

const SESSION_UNAUTHORIZED_ERROR_CODES = new Set([
  "no_token",
  "invalid_token_type",
  "expired_access_token",
  "invalid_token",
  "user_not_found",
  "failed_authentication",
  "failed_authentification",
  "token_revoked",
  "expired_refresh_token",
  "missing_refresh_token",
  "invalid_refresh_payload",
  "refresh_failed"
]);

function normalizeInviteCode(value) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().toUpperCase();
}

function mergeUserInviteCode(user, fallbackUsers = []) {
  if (!user || typeof user !== "object") {
    return user;
  }

  const directInviteCode = normalizeInviteCode(user.invite_code ?? user.inviteCode);
  if (directInviteCode) {
    return {
      ...user,
      invite_code: directInviteCode
    };
  }

  const userId = user.id;

  for (const fallbackUser of fallbackUsers) {
    if (!fallbackUser || typeof fallbackUser !== "object") {
      continue;
    }

    if (
      userId !== undefined &&
      userId !== null &&
      fallbackUser.id !== undefined &&
      fallbackUser.id !== null &&
      fallbackUser.id !== userId
    ) {
      continue;
    }

    const fallbackInviteCode = normalizeInviteCode(
      fallbackUser.invite_code ?? fallbackUser.inviteCode
    );

    if (!fallbackInviteCode) {
      continue;
    }

    return {
      ...user,
      invite_code: fallbackInviteCode
    };
  }

  return user;
}

function isSessionUnauthorizedError(apiError) {
  const errorCode = typeof apiError?.errorCode === "string" ? apiError.errorCode : "";
  return apiError?.status === 401 && SESSION_UNAUTHORIZED_ERROR_CODES.has(errorCode);
}

function profileToState(profile, options = {}) {
  const fallbackUsers = [
    options.userHint,
    options.cachedProfile?.user
  ];
  const mergedUser = mergeUserInviteCode(profile.user, fallbackUsers);

  return {
    status: toStatus(profile.has_partner),
    user: mergedUser,
    partner: profile.partner,
    error: null
  };
}

async function loadProfile(accessToken, options = {}) {
  const profile = await getCurrentUser(accessToken, options);
  const cachedProfile = getStoredProfile();
  const profileState = profileToState(profile, {
    cachedProfile,
    userHint: options.userHint
  });
  saveStoredProfile(profileState);
  return profileState;
}

export function AuthProvider({ children }) {
  const bootstrapSequenceRef = useRef(0);
  const hasSeenServerDowntimeRef = useRef(false);
  const [isServerDown, setIsServerDown] = useState(false);

  const [state, setState] = useState({
    status: "loading",
    user: null,
    partner: null,
    error: null
  });

  const setLoggedOut = useCallback((error = null) => {
    debugAuth("set_logged_out", { error });
    clearAuthTokens();
    setState({
      status: "logged_out",
      user: null,
      partner: null,
      error
    });
  }, []);

  const setRecoveringSession = useCallback((errorMessage) => {
    debugAuth("set_recovering_session", { errorMessage });
    setState((previousState) => ({
      status: "loading",
      user: previousState.user,
      partner: previousState.partner,
      error: errorMessage ?? null
    }));
  }, []);

  useEffect(() => {
    setUnauthorizedHandler((apiError) => {
      if (isSessionUnauthorizedError(apiError)) {
        setLoggedOut("Your session expired. Please sign in again.");
      }
    });

    return () => {
      setUnauthorizedHandler(null);
    };
  }, [setLoggedOut]);

  useEffect(() => {
    setServerDownHandler(() => {
      debugAuth("server_marked_down");
      setIsServerDown(true);
    });

    return () => {
      setServerDownHandler(null);
    };
  }, []);

  useEffect(() => {
    if (!isServerDown) {
      return undefined;
    }

    hasSeenServerDowntimeRef.current = true;

    let isCleared = false;

    const intervalId = window.setInterval(() => {
      void healthCheckServer()
        .then(() => {
          if (isCleared) {
            return;
          }

          window.clearInterval(intervalId);
          setIsServerDown(false);
        })
        .catch(() => {
          // Server is still unavailable. Keep polling.
        });
    }, 5000);

    return () => {
      isCleared = true;
      window.clearInterval(intervalId);
    };
  }, [isServerDown]);

  const bootstrapSession = useCallback(async () => {
    const currentSequence = ++bootstrapSequenceRef.current;
    const isLatestRun = () => bootstrapSequenceRef.current === currentSequence;

    const storedAccessToken = getAccessToken();
    const storedRefreshToken = getRefreshToken();

    debugAuth("bootstrap_start", {
      sequence: currentSequence,
      hasAccessToken: Boolean(storedAccessToken),
      hasRefreshToken: Boolean(storedRefreshToken)
    });

    if (!storedAccessToken && !storedRefreshToken) {
      if (isLatestRun()) {
        setLoggedOut();
      }
      return;
    }

    if (isLatestRun()) {
      setState((previousState) => ({
        ...previousState,
        status: "loading",
        error: null
      }));
    }

    const tryProfileLoad = async (token, options = {}) => {
      const profileState = await loadProfile(token, {
        skipUnauthorizedHandler: true,
        userHint: options.userHint
      });

      debugAuth("profile_loaded", {
        sequence: currentSequence,
        status: profileState.status,
        hasInviteCode: Boolean(profileState.user?.invite_code),
        hasUserAvatar: Boolean(profileState.user?.avatar_url),
        hasPartnerAvatar: Boolean(profileState.partner?.avatar_url),
        userAvatarSummary: summarizeAvatarUrl(profileState.user?.avatar_url),
        partnerAvatarSummary: summarizeAvatarUrl(profileState.partner?.avatar_url)
      });

      if (!isLatestRun()) {
        return false;
      }

      setState(profileState);
      return true;
    };

    try {
      if (storedAccessToken) {
        await tryProfileLoad(storedAccessToken);
        return;
      }

      const refreshPayload = await refreshAccessToken(storedRefreshToken, {
        skipUnauthorizedHandler: true
      });

      if (!isLatestRun()) {
        return;
      }

      saveAccessToken(refreshPayload.access_token);
      await tryProfileLoad(refreshPayload.access_token, {
        userHint: refreshPayload.user
      });
    } catch (error) {
      debugAuth("bootstrap_error", {
        sequence: currentSequence,
        message: error instanceof Error ? error.message : String(error),
        status: error?.status,
        errorCode: error?.errorCode
      });

      const shouldKeepLocalSession =
        Boolean(storedRefreshToken) &&
        isConnectivityError(error);

      if (shouldKeepLocalSession) {
        if (isLatestRun()) {
          setRecoveringSession("You are offline. Reconnecting automatically...");
        }
        return;
      }

      const shouldTryRefresh =
        error instanceof ApiError &&
        (error.status === 401 || error.status === 403) &&
        Boolean(storedRefreshToken);

      if (shouldTryRefresh) {
        try {
          const refreshPayload = await refreshAccessToken(storedRefreshToken, {
            skipUnauthorizedHandler: true
          });

          if (!isLatestRun()) {
            return;
          }

          saveAccessToken(refreshPayload.access_token);
          await tryProfileLoad(refreshPayload.access_token, {
            userHint: refreshPayload.user
          });
          return;
        } catch (refreshError) {
          debugAuth("refresh_error", {
            sequence: currentSequence,
            message: refreshError instanceof Error ? refreshError.message : String(refreshError),
            status: refreshError?.status,
            errorCode: refreshError?.errorCode
          });

          const shouldPreserveSession = isConnectivityError(refreshError);

          if (shouldPreserveSession) {
            if (isLatestRun()) {
              setRecoveringSession("You are offline. Reconnecting automatically...");
            }
            return;
          }

          const shouldLogout = isTerminalRefreshAuthError(refreshError);
          if (isLatestRun()) {
            if (shouldLogout) {
              setLoggedOut("Your session expired. Please sign in again.");
            } else {
              setLoggedOut();
            }
          }
          return;
        }
      }

      if (isLatestRun()) {
        setLoggedOut();
      }
    }
  }, [setLoggedOut, setRecoveringSession]);

  useEffect(() => {
    if (isServerDown || !hasSeenServerDowntimeRef.current) {
      return;
    }

    hasSeenServerDowntimeRef.current = false;

    if (!hasStoredSession()) {
      return;
    }

    debugAuth("server_recovered_rebootstrap");
    void bootstrapSession();
  }, [isServerDown, bootstrapSession]);

  useEffect(() => {
    debugAuth("state_snapshot", {
      status: state.status,
      isServerDown,
      userId: state.user?.id ?? null,
      partnerId: state.partner?.id ?? null,
      hasInviteCode: Boolean(state.user?.invite_code ?? state.user?.inviteCode),
      hasUserAvatar: Boolean(state.user?.avatar_url),
      hasPartnerAvatar: Boolean(state.partner?.avatar_url),
      userAvatarSummary: summarizeAvatarUrl(state.user?.avatar_url),
      partnerAvatarSummary: summarizeAvatarUrl(state.partner?.avatar_url)
    });
  }, [
    isServerDown,
    state.partner?.avatar_url,
    state.partner?.id,
    state.status,
    state.user?.avatar_url,
    state.user?.id,
    state.user?.inviteCode,
    state.user?.invite_code
  ]);

  useEffect(() => {
    void bootstrapSession();
  }, [bootstrapSession]);

  const syncSessionFromStorage = useCallback(async () => {
    if (!hasStoredSession()) {
      setLoggedOut("You were logged out from another tab.");
      return;
    }

    await bootstrapSession();
  }, [bootstrapSession, setLoggedOut]);

  useEffect(() => {
    const handleStorageChange = (event) => {
      if (event.storageArea !== window.localStorage) {
        return;
      }

      const isAuthStorageChange =
        event.key === null ||
        event.key === ACCESS_TOKEN_KEY ||
        event.key === REFRESH_TOKEN_KEY ||
        event.key === LEGACY_AUTH_KEY;

      if (!isAuthStorageChange) {
        return;
      }

      if (event.key !== null && event.newValue === event.oldValue) {
        return;
      }

      void syncSessionFromStorage();
    };

    window.addEventListener("storage", handleStorageChange);

    return () => {
      window.removeEventListener("storage", handleStorageChange);
    };
  }, [syncSessionFromStorage]);

  const signInWithGoogleCredential = useCallback(async (credential) => {
    setState((previousState) => ({
      ...previousState,
      status: "loading",
      error: null
    }));

    try {
      const authPayload = await signInWithGoogle(credential);
      saveAuthTokens({
        accessToken: authPayload.access_token,
        refreshToken: authPayload.refresh_token
      });

      const profileState = await loadProfile(authPayload.access_token, {
        userHint: authPayload.user
      });
      setState(profileState);
    } catch (error) {
      setLoggedOut(getFriendlyApiError(error, "Sign in failed. Please try again."));
      throw error;
    }
  }, [setLoggedOut]);

  const acceptPartnerInvite = useCallback(async (inviteCode) => {
    const accessToken = getAccessToken();

    if (!accessToken) {
      setLoggedOut("Your session expired. Please sign in again.");
      throw new Error("Missing access token");
    }

    try {
      const response = await acceptInvite(accessToken, inviteCode, {
        skipUnauthorizedHandler: true
      });
      await bootstrapSession();
      return response;
    } catch (error) {
      if (isSessionUnauthorizedError(error)) {
        setLoggedOut("Your session expired. Please sign in again.");
      }

      throw error;
    }
  }, [bootstrapSession, setLoggedOut]);

  const logout = useCallback(async () => {
    const accessToken = getAccessToken();

    try {
      if (accessToken) {
        await logoutSession(accessToken);
      }
    } catch {
      // Logout should always clear local tokens, even when network fails.
    }

    try {
      window.localStorage.clear();
      window.sessionStorage.clear();
    } catch {
      // Storage cleanup is best-effort. Auth state is still reset below.
    }

    setLoggedOut();
  }, [setLoggedOut]);

  const value = useMemo(() => ({
    status: state.status,
    user: state.user,
    partner: state.partner,
    error: state.error,
    isServerDown,
    isAuthenticated: state.status === "unpaired" || state.status === "paired",
    signInWithGoogleCredential,
    acceptPartnerInvite,
    refreshSession: bootstrapSession,
    logout
  }), [
    state.status,
    state.user,
    state.partner,
    state.error,
    isServerDown,
    signInWithGoogleCredential,
    acceptPartnerInvite,
    bootstrapSession,
    logout
  ]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }

  return context;
}

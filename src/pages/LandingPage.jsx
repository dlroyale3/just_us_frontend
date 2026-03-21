import { useEffect, useMemo, useRef, useState } from "react";
import { useGoogleLogin } from "@react-oauth/google";
import { useNavigate } from "react-router-dom";
import { BottomCtaSection } from "../components/landing/BottomCtaSection";
import { FeaturesDeepDiveSection } from "../components/landing/FeaturesDeepDiveSection";
import { HeroSection } from "../components/landing/HeroSection";
import { ProblemSolutionSection } from "../components/landing/ProblemSolutionSection";
import { useAuth } from "../context/AuthContext";
import { getFriendlyApiError } from "../services/apiClient";
import { isBlurDebugEnabled, logBlurDiagnostics } from "../utils/blurDebug";
import {
  clearPendingInviteContext,
  getPendingInviteCode,
  getPendingInviteContext
} from "../utils/pendingInviteStorage";

const MAX_INVITE_CODE_LENGTH = 12;
const GOOGLE_POPUP_GUARD_TIMEOUT_MS = 20000;

function sanitizeInviteCode(value) {
  return (value ?? "")
    .toString()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, MAX_INVITE_CODE_LENGTH);
}

export function LandingPage() {
  const { signInWithGoogleCredential, acceptPartnerInvite, error: sessionError } = useAuth();
  const navigate = useNavigate();
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [signInError, setSignInError] = useState(null);
  const [pendingInviteContext, setPendingInviteContext] = useState(null);
  const googlePopupGuardTimeoutRef = useRef(null);

  const clearGooglePopupGuardTimeout = () => {
    if (googlePopupGuardTimeoutRef.current !== null) {
      window.clearTimeout(googlePopupGuardTimeoutRef.current);
      googlePopupGuardTimeoutRef.current = null;
    }
  };

  useEffect(() => {
    setPendingInviteContext(getPendingInviteContext());
  }, []);

  useEffect(() => {
    return () => {
      clearGooglePopupGuardTimeout();
    };
  }, []);

  useEffect(() => {
    if (!isBlurDebugEnabled() || typeof document === "undefined" || typeof window === "undefined") {
      return undefined;
    }

    const logLandingPanels = (reason) => {
      const panelElements = Array.from(document.querySelectorAll("[data-blur-panel^='landing-']"));

      console.log("[blur] landing_panel_scan", {
        reason,
        panelCount: panelElements.length,
        pagePath: window.location.pathname,
        visibilityState: document.visibilityState
      });

      panelElements.forEach((element) => {
        const panelKey = element.dataset.blurPanel || "landing-unknown";
        logBlurDiagnostics(element, `landing:${panelKey}:${reason}`);
      });
    };

    const schedulePanelLog = (reason) => {
      window.requestAnimationFrame(() => {
        logLandingPanels(reason);
      });
    };

    schedulePanelLog("mount");

    const postMountTimeoutId = window.setTimeout(() => {
      schedulePanelLog("post_mount_450ms");
    }, 450);

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        schedulePanelLog("visibility_visible");
      }
    };

    const handleWindowFocus = () => {
      schedulePanelLog("window_focus");
    };

    const handleWindowResize = () => {
      schedulePanelLog("window_resize");
    };

    window.addEventListener("focus", handleWindowFocus);
    window.addEventListener("resize", handleWindowResize);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.clearTimeout(postMountTimeoutId);
      window.removeEventListener("focus", handleWindowFocus);
      window.removeEventListener("resize", handleWindowResize);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  const contextualHeroCopy = useMemo(() => {
    if (!pendingInviteContext?.code || !pendingInviteContext?.name) {
      return null;
    }

    return {
      headline: `Join ${pendingInviteContext.name}`,
      subheadline: "Sign in with Google to connect your vaults and accept the invitation."
    };
  }, [pendingInviteContext]);

  const googleLogin = useGoogleLogin({
    ux_mode: "popup",
    flow: "implicit",
    scope: "openid profile email",
    onSuccess: async (tokenResponse) => {
      clearGooglePopupGuardTimeout();
      const token = tokenResponse?.access_token ?? tokenResponse?.id_token ?? tokenResponse?.code;

      if (!token) {
        setSignInError("Google sign in did not return a valid token.");
        setIsSigningIn(false);
        return;
      }

      try {
        await signInWithGoogleCredential(token);

        const pendingInviteCode = sanitizeInviteCode(getPendingInviteCode());

        if (pendingInviteCode) {
          try {
            await acceptPartnerInvite(pendingInviteCode);
            clearPendingInviteContext();
            setPendingInviteContext(null);
            navigate("/dashboard", { replace: true });
          } catch (autoAcceptError) {
            clearPendingInviteContext();
            setPendingInviteContext(null);
            setSignInError(
              getFriendlyApiError(
                autoAcceptError,
                "Signed in, but we could not accept the invite automatically. Please try again from Pairing."
              )
            );
            navigate("/pairing", { replace: true });
          }
        }
      } catch (error) {
        setSignInError(getFriendlyApiError(error, "Google sign in failed. Please try again."));
      } finally {
        setIsSigningIn(false);
      }
    },
    onError: () => {
      clearGooglePopupGuardTimeout();
      setSignInError("Google sign in was canceled or failed.");
      setIsSigningIn(false);
    },
    onNonOAuthError: (nonOAuthError) => {
      clearGooglePopupGuardTimeout();

      const errorType = nonOAuthError?.type;
      const isPopupClosedByUser = errorType === "popup_closed";

      setSignInError(
        isPopupClosedByUser
          ? "Google sign in was canceled."
          : "Google sign in was interrupted. Please try again."
      );
      setIsSigningIn(false);
    }
  });

  const handleGoogleSignIn = () => {
    setSignInError(null);
    setIsSigningIn(true);

    let popupAttemptStarted = false;

    try {
      googleLogin();
      popupAttemptStarted = true;
    } catch (error) {
      setSignInError(getFriendlyApiError(error, "Google sign in failed to start. Please try again."));
      setIsSigningIn(false);
    } finally {
      if (!popupAttemptStarted) {
        return;
      }

      clearGooglePopupGuardTimeout();
      googlePopupGuardTimeoutRef.current = window.setTimeout(() => {
        googlePopupGuardTimeoutRef.current = null;

        setIsSigningIn((previous) => {
          if (!previous) {
            return previous;
          }

          setSignInError((previousError) => previousError ?? "Google sign in was canceled or timed out.");
          return false;
        });
      }, GOOGLE_POPUP_GUARD_TIMEOUT_MS);
    }
  };

  return (
    <>
      <HeroSection
        onGoogleSignIn={handleGoogleSignIn}
        isSigningIn={isSigningIn}
        errorMessage={signInError ?? sessionError}
        headline={contextualHeroCopy?.headline}
        subheadline={contextualHeroCopy?.subheadline}
      />
      <ProblemSolutionSection />
      <FeaturesDeepDiveSection />
      <BottomCtaSection onGoogleSignIn={handleGoogleSignIn} isSigningIn={isSigningIn} />
    </>
  );
}

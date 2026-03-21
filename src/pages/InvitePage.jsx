import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { GlassLoader } from "../components/ui/GlassLoader";
import { PremiumButton } from "../components/ui/PremiumButton";
import { useAuth } from "../context/AuthContext";
import { getFriendlyApiError, getInvitePreview } from "../services/apiClient";
import { logAvatarDebug, summarizeAvatarUrl } from "../utils/avatarDebug";
import { clearPendingInviteContext, setPendingInviteContext } from "../utils/pendingInviteStorage";

const MAX_INVITE_CODE_LENGTH = 12;
const SELF_INVITE_MESSAGE =
  "Oops! You clicked your own invite link. You need to send this to your partner, not yourself!";

function sanitizeInviteCode(value) {
  return (value ?? "")
    .toString()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, MAX_INVITE_CODE_LENGTH);
}

export function InvitePage() {
  const { status, user, acceptPartnerInvite } = useAuth();
  const navigate = useNavigate();
  const { code } = useParams();

  const [invitePreview, setInvitePreview] = useState(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(true);
  const [previewError, setPreviewError] = useState(null);
  const [acceptError, setAcceptError] = useState(null);
  const [isAccepting, setIsAccepting] = useState(false);

  const inviteCode = useMemo(() => sanitizeInviteCode(code), [code]);
  const ownInviteCode = useMemo(() => sanitizeInviteCode(user?.invite_code), [user?.invite_code]);
  const isAuthenticated = status === "unpaired" || status === "paired";
  const isSelfInvite = isAuthenticated && Boolean(inviteCode) && inviteCode === ownInviteCode;
  const invitePreviewName = invitePreview?.name ?? "Your partner";
  const invitePreviewAvatarFallbackUrl = useMemo(() => {
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(invitePreviewName)}&background=0f766e&color=fff`;
  }, [invitePreviewName]);
  const preferredInvitePreviewAvatarUrl = useMemo(() => {
    const avatarUrl = typeof invitePreview?.picture === "string" ? invitePreview.picture.trim() : "";

    if (avatarUrl) {
      return avatarUrl;
    }

    return invitePreviewAvatarFallbackUrl;
  }, [invitePreview?.picture, invitePreviewAvatarFallbackUrl]);
  const [invitePreviewAvatarUrl, setInvitePreviewAvatarUrl] = useState(preferredInvitePreviewAvatarUrl);

  useEffect(() => {
    setInvitePreviewAvatarUrl(preferredInvitePreviewAvatarUrl);
  }, [preferredInvitePreviewAvatarUrl]);

  useEffect(() => {
    logAvatarDebug("invite_preview_avatar_resolved", {
      page: "InvitePage",
      role: "partner_preview",
      inviteCode,
      inviteName: invitePreviewName,
      hasPrimaryAvatar: Boolean(invitePreview?.picture),
      primaryAvatarSummary: summarizeAvatarUrl(invitePreview?.picture),
      selectedAvatarSummary: summarizeAvatarUrl(invitePreviewAvatarUrl),
      fallbackAvatarSummary: summarizeAvatarUrl(invitePreviewAvatarFallbackUrl),
      isUsingFallback: invitePreviewAvatarUrl === invitePreviewAvatarFallbackUrl
    });
  }, [
    inviteCode,
    invitePreview?.picture,
    invitePreviewAvatarFallbackUrl,
    invitePreviewAvatarUrl,
    invitePreviewName
  ]);

  const handleInvitePreviewAvatarError = (event) => {
    const failedAvatarUrl = event.currentTarget.currentSrc || event.currentTarget.src;

    logAvatarDebug("invite_preview_avatar_fallback_activated", {
      page: "InvitePage",
      role: "partner_preview",
      inviteCode,
      failedAvatarSummary: summarizeAvatarUrl(failedAvatarUrl),
      fallbackAvatarSummary: summarizeAvatarUrl(invitePreviewAvatarFallbackUrl),
      selectedAvatarSummary: summarizeAvatarUrl(invitePreviewAvatarUrl),
      isOnline: typeof navigator !== "undefined" ? navigator.onLine : null,
      referrerPolicy: event.currentTarget.referrerPolicy || null,
      reason: "img_onerror"
    });

    event.currentTarget.onerror = null;
    setInvitePreviewAvatarUrl((previousValue) => {
      if (previousValue === invitePreviewAvatarFallbackUrl) {
        return previousValue;
      }

      return invitePreviewAvatarFallbackUrl;
    });
  };

  const handleInvitePreviewAvatarLoad = (event) => {
    const loadedAvatarUrl = event.currentTarget.currentSrc || event.currentTarget.src;

    logAvatarDebug("invite_preview_avatar_loaded", {
      page: "InvitePage",
      role: "partner_preview",
      inviteCode,
      loadedAvatarSummary: summarizeAvatarUrl(loadedAvatarUrl),
      isFallback: loadedAvatarUrl === invitePreviewAvatarFallbackUrl
    });
  };

  useEffect(() => {
    let isCancelled = false;

    async function loadInvitePreview() {
      if (!inviteCode) {
        setPreviewError("This invite link is invalid.");
        setIsLoadingPreview(false);
        return;
      }

      setIsLoadingPreview(true);
      setPreviewError(null);
      setAcceptError(null);

      try {
        const payload = await getInvitePreview(inviteCode);

        if (isCancelled) {
          return;
        }

        setInvitePreview({
          name: payload?.name ?? "Your partner",
          picture: payload?.picture ?? ""
        });
      } catch (error) {
        if (isCancelled) {
          return;
        }

        setPreviewError(getFriendlyApiError(error, "This invite link is invalid or expired."));
      } finally {
        if (!isCancelled) {
          setIsLoadingPreview(false);
        }
      }
    }

    void loadInvitePreview();

    return () => {
      isCancelled = true;
    };
  }, [inviteCode]);

  const handleDecline = () => {
    clearPendingInviteContext();
    navigate(isAuthenticated ? "/pairing" : "/login", { replace: true });
  };

  const handleAccept = async () => {
    if (!inviteCode || isAccepting) {
      return;
    }

    if (!isAuthenticated) {
      setPendingInviteContext(inviteCode, invitePreview?.name ?? "Your partner");
      navigate("/login", { replace: true });
      return;
    }

    setAcceptError(null);
    setIsAccepting(true);

    try {
      await acceptPartnerInvite(inviteCode);
      clearPendingInviteContext();
      navigate("/dashboard", { replace: true });
    } catch (error) {
      setAcceptError(getFriendlyApiError(error, "Could not accept invite right now. Please try again."));
    } finally {
      setIsAccepting(false);
    }
  };

  if (status === "loading" || isLoadingPreview) {
    return <GlassLoader message="Preparing invite preview..." />;
  }

  if (isSelfInvite) {
    return (
      <section className="animate-riseIn py-8 sm:py-12">
        <div className="mx-auto max-w-3xl rounded-3xl border border-white/30 bg-white/60 px-6 py-10 text-center shadow-[0_20px_48px_rgba(15,23,42,0.08)] backdrop-blur-xl sm:px-10 sm:py-12">
          <p className="text-xs uppercase tracking-[0.3em] text-teal-700/80">Invite Preview</p>
          <h1 className="mt-4 font-serif text-3xl text-teal-950 sm:text-4xl">Wrong Vault</h1>
          <p className="mx-auto mt-4 max-w-2xl text-sm leading-relaxed text-stone-700 sm:text-base">
            {SELF_INVITE_MESSAGE}
          </p>

          <PremiumButton variant="sage" onClick={() => navigate("/pairing", { replace: true })} className="mt-8">
            Back to my Vault
          </PremiumButton>
        </div>
      </section>
    );
  }

  if (previewError) {
    return (
      <section className="animate-riseIn py-8 sm:py-12">
        <div className="mx-auto max-w-3xl rounded-3xl border border-white/30 bg-white/60 px-6 py-10 text-center shadow-[0_20px_48px_rgba(15,23,42,0.08)] backdrop-blur-xl sm:px-10 sm:py-12">
          <p className="text-xs uppercase tracking-[0.3em] text-teal-700/80">Invite Preview</p>
          <h1 className="mt-4 font-serif text-3xl text-teal-950 sm:text-4xl">Invite unavailable</h1>
          <p className="mx-auto mt-4 max-w-2xl text-sm leading-relaxed text-[#b4533f] sm:text-base">{previewError}</p>

          <PremiumButton variant="google" onClick={handleDecline} className="mt-8 border-stone-300/90 bg-white/80 text-stone-700">
            Go to Pairing
          </PremiumButton>
        </div>
      </section>
    );
  }

  return (
    <section className="animate-riseIn py-8 sm:py-12">
      <div className="mx-auto max-w-3xl rounded-3xl border border-white/30 bg-white/60 px-6 py-10 shadow-[0_20px_48px_rgba(15,23,42,0.08)] backdrop-blur-xl sm:px-10 sm:py-12">
        <p className="text-center text-xs uppercase tracking-[0.3em] text-teal-700/80">Invite Preview</p>

        <div className="mt-7 flex flex-col items-center text-center">
          <img
            src={invitePreviewAvatarUrl}
            alt={`${invitePreviewName} profile`}
            className="h-24 w-24 rounded-full border border-white/70 object-cover shadow-[0_14px_28px_rgba(15,23,42,0.14)]"
            referrerPolicy="no-referrer"
            onError={handleInvitePreviewAvatarError}
            onLoad={handleInvitePreviewAvatarLoad}
            loading="eager"
            decoding="async"
          />

          <h1 className="mt-6 font-serif text-3xl text-teal-950 sm:text-4xl">Connect your private space</h1>
          <p className="mt-3 text-sm text-stone-700 sm:text-base">
            <span className="font-semibold text-teal-950">{invitePreviewName}</span> wants to connect vaults with you.
          </p>
        </div>

        <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-center">
          <PremiumButton
            variant="google"
            onClick={handleDecline}
            disabled={isAccepting}
            className="w-full border-stone-300/90 bg-white/80 text-stone-700 sm:w-auto"
          >
            Decline
          </PremiumButton>

          <PremiumButton
            variant="sage"
            onClick={handleAccept}
            isLoading={isAccepting}
            className="w-full sm:w-auto"
          >
            Accept Invite
          </PremiumButton>
        </div>

        {acceptError && <p className="mt-4 text-center text-sm text-[#b4533f]">{acceptError}</p>}
      </div>
    </section>
  );
}

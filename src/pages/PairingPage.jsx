import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Copy, LogOut } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { GlassLoader } from "../components/ui/GlassLoader";
import { PremiumButton } from "../components/ui/PremiumButton";
import { useAuth } from "../context/AuthContext";
import { getCurrentUser } from "../services/apiClient";
import { getAccessToken } from "../utils/authStorage";
import { logAvatarDebug, summarizeAvatarUrl } from "../utils/avatarDebug";

const MAX_INVITE_CODE_LENGTH = 12;
const SELF_PAIRING_MESSAGE = "You cannot pair with yourself. Please enter your partner's code.";
const PAIRING_STATUS_POLL_INTERVAL_MS = 8000;
const AUTH_PANEL_CLASS = "glass-auth-panel rounded-3xl";

function sanitizeInviteCode(value) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, MAX_INVITE_CODE_LENGTH);
}

function safeDecode(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function extractCodeFromUrl(value) {
  try {
    const parsed = new URL(value);
    const queryCode = parsed.searchParams.get("code") ?? "";

    if (queryCode) {
      return queryCode;
    }

    const pathMatch = parsed.pathname.match(/\/invite\/([^/?#]+)/i);
    return pathMatch?.[1] ?? "";
  } catch {
    return "";
  }
}

function extractInviteCode(value) {
  const trimmed = value.trim();

  if (!trimmed) {
    return "";
  }

  const directMatch = trimmed.match(/[?&]code=([^&#\s]+)/i);
  if (directMatch?.[1]) {
    return safeDecode(directMatch[1]);
  }

  const urlCode = extractCodeFromUrl(trimmed);
  if (urlCode) {
    return safeDecode(urlCode);
  }

  if (!/^https?:\/\//i.test(trimmed)) {
    const urlWithSchemeCode = extractCodeFromUrl(`https://${trimmed}`);
    if (urlWithSchemeCode) {
      return safeDecode(urlWithSchemeCode);
    }
  }

  if (trimmed.startsWith("?")) {
    const queryCode = new URLSearchParams(trimmed.slice(1)).get("code");
    if (queryCode) {
      return safeDecode(queryCode);
    }
  }

  return trimmed;
}

function isInvalidInviteError(error) {
  const code = typeof error?.errorCode === "string" ? error.errorCode : "";
  const message = typeof error?.message === "string" ? error.message.toLowerCase() : "";

  return (
    code === "invalid_invite_code" ||
    code === "missing_invite_code" ||
    (message.includes("invalid") && message.includes("invite"))
  );
}

function shouldUseBackendMessage(message) {
  if (typeof message !== "string") {
    return false;
  }

  const trimmed = message.trim();
  if (!trimmed) {
    return false;
  }

  return !trimmed.toLowerCase().startsWith("request failed");
}

function mapPairingError(error) {
  const errorCode = typeof error?.errorCode === "string" ? error.errorCode : "";
  const backendMessage = typeof error?.message === "string" ? error.message : "";
  const status = typeof error?.status === "number" ? error.status : 0;

  if (errorCode === "invalid_action") {
    return SELF_PAIRING_MESSAGE;
  }

  if (errorCode === "already_paired") {
    return "Your vault is already connected to a partner.";
  }

  if (errorCode === "partner_already_paired") {
    return "This invite code belongs to a user who is already paired.";
  }

  if (errorCode === "invalid_invite_code") {
    return "That invite code is invalid. Please verify and try again.";
  }

  if (errorCode === "missing_invite_code") {
    return "Please enter a valid invite code before connecting.";
  }

  if (errorCode === "failed_pairing") {
    return "We could not complete pairing right now. Please try again.";
  }

  if (shouldUseBackendMessage(backendMessage)) {
    return backendMessage;
  }

  if (status === 400) {
    return "Invite data is invalid. Please check the code and try again.";
  }

  if (status === 404) {
    return "We could not find that invite code. Please ask your partner for a new one.";
  }

  if (status === 422) {
    return "This invite cannot be used right now. Please verify both vault states.";
  }

  return "Could not connect vaults. Try again.";
}

function shouldClearCodeFromError(error) {
  const errorCode = typeof error?.errorCode === "string" ? error.errorCode : "";
  const status = typeof error?.status === "number" ? error.status : 0;

  return errorCode === "invalid_invite_code" || errorCode === "missing_invite_code" || status === 404;
}

function isSelfPairingCode(candidateCode, ownCode) {
  return Boolean(candidateCode) && Boolean(ownCode) && candidateCode === ownCode;
}

function fallbackCopyToClipboard(text) {
  const temporaryTextArea = document.createElement("textarea");
  temporaryTextArea.value = text;
  temporaryTextArea.setAttribute("readonly", "");
  temporaryTextArea.style.position = "absolute";
  temporaryTextArea.style.left = "-9999px";
  document.body.appendChild(temporaryTextArea);
  temporaryTextArea.select();
  document.execCommand("copy");
  document.body.removeChild(temporaryTextArea);
}

function handleCopyKeyDown(event, onCopy) {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    onCopy();
  }
}

export function PairingPage() {
  const { user, acceptPartnerInvite, refreshSession, logout } = useAuth();
  const navigate = useNavigate();
  const [partnerCode, setPartnerCode] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [isSelfPairingError, setIsSelfPairingError] = useState(false);
  const [copiedAction, setCopiedAction] = useState(null);
  const isPollingRequestInFlightRef = useRef(false);

  const loggedInUserName = useMemo(() => {
    const name = typeof user?.name === "string" ? user.name.trim() : "";
    if (name) {
      return name;
    }

    const email = typeof user?.email === "string" ? user.email.trim() : "";
    return email || "Unknown user";
  }, [user?.email, user?.name]);

  const loggedInUserEmail = useMemo(() => {
    const email = typeof user?.email === "string" ? user.email.trim() : "";
    return email;
  }, [user?.email]);

  const fallbackLoggedInAvatarUrl = useMemo(() => {
    const encodedName = encodeURIComponent(loggedInUserName || "User");
    return `https://ui-avatars.com/api/?name=${encodedName}&background=0f766e&color=fff`;
  }, [loggedInUserName]);

  const preferredLoggedInAvatarUrl = useMemo(() => {
    const avatarUrl = typeof user?.avatar_url === "string" ? user.avatar_url.trim() : "";

    if (avatarUrl) {
      return avatarUrl;
    }

    return fallbackLoggedInAvatarUrl;
  }, [fallbackLoggedInAvatarUrl, user?.avatar_url]);

  const [loggedInAvatarUrl, setLoggedInAvatarUrl] = useState(preferredLoggedInAvatarUrl);

  useEffect(() => {
    setLoggedInAvatarUrl(preferredLoggedInAvatarUrl);
  }, [preferredLoggedInAvatarUrl]);

  useEffect(() => {
    logAvatarDebug("pairing_avatar_resolved", {
      page: "PairingPage",
      role: "user",
      userId: user?.id ?? null,
      userName: loggedInUserName,
      hasPrimaryAvatar: Boolean(user?.avatar_url),
      primaryAvatarSummary: summarizeAvatarUrl(user?.avatar_url),
      selectedAvatarSummary: summarizeAvatarUrl(loggedInAvatarUrl),
      fallbackAvatarSummary: summarizeAvatarUrl(fallbackLoggedInAvatarUrl),
      isUsingFallback: loggedInAvatarUrl === fallbackLoggedInAvatarUrl
    });
  }, [fallbackLoggedInAvatarUrl, loggedInAvatarUrl, loggedInUserName, user?.avatar_url, user?.id]);

  const handleLoggedInAvatarError = useCallback(() => {
    logAvatarDebug("pairing_avatar_fallback_activated", {
      page: "PairingPage",
      role: "user",
      userId: user?.id ?? null,
      failedAvatarSummary: summarizeAvatarUrl(loggedInAvatarUrl),
      fallbackAvatarSummary: summarizeAvatarUrl(fallbackLoggedInAvatarUrl),
      reason: "img_onerror"
    });

    setLoggedInAvatarUrl((previousValue) => {
      if (previousValue === fallbackLoggedInAvatarUrl) {
        return previousValue;
      }

      return fallbackLoggedInAvatarUrl;
    });
  }, [fallbackLoggedInAvatarUrl, loggedInAvatarUrl, user?.id]);

  const handleLoggedInAvatarLoad = useCallback((event) => {
    const loadedAvatarUrl = event.currentTarget.currentSrc || event.currentTarget.src;

    logAvatarDebug("pairing_avatar_loaded", {
      page: "PairingPage",
      role: "user",
      userId: user?.id ?? null,
      loadedAvatarSummary: summarizeAvatarUrl(loadedAvatarUrl),
      isFallback: loadedAvatarUrl === fallbackLoggedInAvatarUrl
    });
  }, [fallbackLoggedInAvatarUrl, user?.id]);

  const myInviteCode = user?.invite_code ?? user?.inviteCode ?? "";
  const mySanitizedInviteCode = useMemo(() => sanitizeInviteCode(myInviteCode), [myInviteCode]);

  const inviteLink = useMemo(() => {
    const origin = typeof window !== "undefined" ? window.location.origin : "";

    if (!origin || !myInviteCode) {
      return "";
    }

    return `${origin}/invite/${encodeURIComponent(myInviteCode)}`;
  }, [myInviteCode]);

  useEffect(() => {
    if (!copiedAction) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setCopiedAction(null);
    }, 2000);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [copiedAction]);

  useEffect(() => {
    let isUnmounted = false;

    const pollPairingStatus = async () => {
      if (isPollingRequestInFlightRef.current || isSubmitting) {
        return;
      }

      if (typeof document !== "undefined" && document.visibilityState !== "visible") {
        return;
      }

      const accessToken = getAccessToken();
      if (!accessToken) {
        return;
      }

      isPollingRequestInFlightRef.current = true;

      try {
        const profile = await getCurrentUser(accessToken, {
          skipUnauthorizedHandler: true,
          skipServerDownHandler: true
        });

        if (isUnmounted || !profile?.has_partner) {
          return;
        }

        await refreshSession();

        if (!isUnmounted) {
          navigate("/dashboard", { replace: true });
        }
      } catch {
        // Polling is intentionally silent to avoid UX noise for transient failures.
      } finally {
        isPollingRequestInFlightRef.current = false;
      }
    };

    void pollPairingStatus();

    const intervalId = window.setInterval(() => {
      void pollPairingStatus();
    }, PAIRING_STATUS_POLL_INTERVAL_MS);

    return () => {
      isUnmounted = true;
      window.clearInterval(intervalId);
    };
  }, [isSubmitting, navigate, refreshSession]);

  const copyText = async (value, actionName) => {
    if (!value) {
      return;
    }

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
      } else {
        fallbackCopyToClipboard(value);
      }
      setCopiedAction(actionName);
    } catch {
      fallbackCopyToClipboard(value);
      setCopiedAction(actionName);
    }
  };

  const handlePartnerCodeChange = (event) => {
    const rawValue = event.target.value;
    const normalizedCode = sanitizeInviteCode(extractInviteCode(rawValue));

    setPartnerCode(normalizedCode);

    if (isSelfPairingCode(normalizedCode, mySanitizedInviteCode)) {
      setIsSelfPairingError(true);
      setSubmitError(SELF_PAIRING_MESSAGE);
      return;
    }

    if (submitError || isSelfPairingError) {
      setIsSelfPairingError(false);
      setSubmitError(null);
    }
  };

  const handleClearInput = () => {
    setPartnerCode("");
    setIsSelfPairingError(false);
    setSubmitError(null);
  };

  const handleAcceptInvite = async (event) => {
    event.preventDefault();
    const cleanedInviteCode = sanitizeInviteCode(extractInviteCode(partnerCode));

    if (!cleanedInviteCode) {
      setSubmitError("Please paste your partner's invite code or link.");
      return;
    }

    if (isSelfPairingCode(cleanedInviteCode, mySanitizedInviteCode)) {
      setIsSelfPairingError(true);
      setSubmitError(SELF_PAIRING_MESSAGE);
      return;
    }

    setPartnerCode(cleanedInviteCode);
    setIsSubmitting(true);
    setIsSelfPairingError(false);
    setSubmitError(null);

    try {
      await acceptPartnerInvite(cleanedInviteCode);
      navigate("/dashboard", { replace: true });
    } catch (error) {
      const nextMessage = mapPairingError(error);
      const nextIsSelfPairing =
        typeof error?.errorCode === "string" && error.errorCode === "invalid_action";

      if (nextIsSelfPairing) {
        setIsSelfPairingError(true);
      }

      if (isInvalidInviteError(error) || shouldClearCodeFromError(error)) {
        setPartnerCode("");
      }

      setSubmitError(nextMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="flex h-full min-h-0 px-4 py-4 sm:px-6 sm:py-5">
      <div className="mx-auto flex w-full max-w-5xl flex-col justify-center gap-4">
        <header>
          <div className={`${AUTH_PANEL_CLASS} px-6 py-6 sm:px-8 sm:py-7`}>
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
            <div className="text-center sm:text-left">
              <p className="text-xs uppercase tracking-[0.32em] text-teal-700/85">Secure Pairing</p>
              <h1 className="mt-3 font-serif text-4xl text-teal-950 sm:text-5xl">Link Your Vaults</h1>
              <p className="mt-2 text-sm text-stone-700 sm:text-base">
                One elegant step before your private shared dashboard opens.
              </p>
            </div>

            <div className="flex w-full flex-col gap-3 sm:w-auto sm:min-w-[260px]">
              <div className="flex items-center gap-3 rounded-2xl border border-white/45 bg-white/80 px-4 py-3 shadow-sm">
                <img
                  src={loggedInAvatarUrl}
                  alt={`Avatar of ${loggedInUserName}`}
                  className="h-11 w-11 rounded-full border border-white/70 object-cover"
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  onLoad={handleLoggedInAvatarLoad}
                  onError={handleLoggedInAvatarError}
                />

                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-[0.22em] text-teal-700/80">Signed in as</p>
                  <p className="truncate text-sm font-semibold text-teal-950">{loggedInUserName}</p>
                  {loggedInUserEmail && <p className="truncate text-xs text-stone-600">{loggedInUserEmail}</p>}
                </div>
              </div>

              <PremiumButton
                variant="google"
                onClick={logout}
                className="self-center border-stone-300/90 bg-white/80 text-stone-700 sm:self-end"
              >
                <LogOut size={16} />
                <span>Sign out</span>
              </PremiumButton>
            </div>
          </div>
          </div>
        </header>

        <div className="grid gap-4 md:grid-cols-2">
          <article className={`${AUTH_PANEL_CLASS} p-6 sm:p-7`}>
          <p className="text-xs uppercase tracking-[0.3em] text-teal-700/80">My Code</p>
          <h2 className="mt-3 font-serif text-3xl text-teal-950">Share Your Vault</h2>
          <p className="mt-2 text-sm leading-relaxed text-stone-700">
            Send a private link or your code so your partner can join instantly.
          </p>

          <div
            role="button"
            tabIndex={0}
            onClick={() => copyText(inviteLink, "link")}
            onKeyDown={(event) => handleCopyKeyDown(event, () => copyText(inviteLink, "link"))}
            className="mt-6 flex cursor-pointer items-center justify-between gap-4 rounded-2xl border border-white/45 bg-white/75 px-4 py-4 transition hover:border-emerald-300/60 hover:bg-white/85"
          >
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-[0.2em] text-teal-700/75">Invite Link</p>
              <p className="mt-1 truncate text-sm font-medium text-teal-900">{inviteLink || "Invite link unavailable"}</p>
            </div>
            <div className="shrink-0 text-teal-800">
              {copiedAction === "link" ? <Check size={18} /> : <Copy size={18} />}
            </div>
          </div>

          {copiedAction === "link" && <p className="mt-2 text-sm font-medium text-emerald-700">Copied!</p>}

          <div
            role="button"
            tabIndex={0}
            onClick={() => copyText(myInviteCode, "code")}
            onKeyDown={(event) => handleCopyKeyDown(event, () => copyText(myInviteCode, "code"))}
            className="mt-5 flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-white/40 bg-white/65 px-4 py-3 transition hover:border-emerald-300/60 hover:bg-white/75"
          >
            <p className="min-w-0 truncate text-sm text-stone-700">
              Or share this code: <span className="font-mono font-semibold tracking-[0.15em] text-teal-950">{myInviteCode || "------"}</span>
            </p>
            <div className="shrink-0 text-stone-700">
              {copiedAction === "code" ? <Check size={16} /> : <Copy size={16} />}
            </div>
          </div>

          {copiedAction === "code" && <p className="mt-2 text-sm font-medium text-emerald-700">Copied!</p>}
          </article>

          <article className={`${AUTH_PANEL_CLASS} relative p-6 sm:p-7`}>
          {isSubmitting && <GlassLoader message="Verifying code..." fullScreen={false} />}

          <p className="text-xs uppercase tracking-[0.3em] text-teal-700/80">Partner&apos;s Code</p>
          <h2 className="mt-3 font-serif text-3xl text-teal-950">Accept an invite</h2>
          <p className="mt-2 text-sm leading-relaxed text-stone-700">
            Paste your partner&apos;s code or invite link. We&apos;ll extract the code automatically.
          </p>

          <form onSubmit={handleAcceptInvite} className="mt-6">
            <label htmlFor="partnerCode" className="mb-2 block text-sm font-medium text-stone-800">
              Partner invite code
            </label>

            <input
              id="partnerCode"
              value={partnerCode}
              onChange={handlePartnerCodeChange}
              placeholder="Paste your partner's code or link here"
              autoComplete="off"
              maxLength={250}
              className="w-full rounded-2xl border border-white/70 bg-white/80 px-4 py-3 text-base tracking-[0.15em] text-teal-950 outline-none transition focus:border-emerald-300 focus:ring-2 focus:ring-emerald-200/80"
            />

            <PremiumButton
              type="submit"
              disabled={isSubmitting}
              variant="sage"
              className="mt-5 w-full sm:w-auto"
            >
              Connect Vaults
            </PremiumButton>

            {submitError && (
              <div className="mt-4 flex flex-wrap items-center gap-3" role="alert">
                <p className="text-sm text-[#b4533f]">{submitError}</p>
                {isSelfPairingError && (
                  <button
                    type="button"
                    onClick={handleClearInput}
                    className="rounded-full border border-[#d6a597] bg-[#fff2ed] px-3 py-1 text-xs font-semibold text-[#a34833] transition hover:bg-[#ffe7df]"
                  >
                    Clear input
                  </button>
                )}
              </div>
            )}
          </form>
          </article>
        </div>
      </div>
    </section>
  );
}

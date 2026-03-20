import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createConsumer } from "@rails/actioncable";
import { CalendarDays, Inbox, Pencil, Search, Trash2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { InboxCalendar } from "../components/dashboard/InboxCalendar";
import { DashboardLayout } from "../components/layout/DashboardLayout";
import { GlassLoader } from "../components/ui/GlassLoader";
import { useAuth } from "../context/AuthContext";
import { useSettings } from "../context/SettingsContext";
import {
  createScheduledMessage,
  deleteScheduledMessage,
  getFriendlyApiError,
  getSentScheduledMessageDates,
  getSentScheduledMessages,
  updateScheduledMessage
} from "../services/apiClient";
import { getAccessToken } from "../utils/authStorage";
import { logAvatarDebug, summarizeAvatarUrl } from "../utils/avatarDebug";

function classNames(...parts) {
  return parts.filter(Boolean).join(" ");
}

const MATTE_GLASS_PANEL_CLASS =
  "relative isolate z-10 bg-black/30 border border-white/10 shadow-2xl ring-1 ring-white/5 glass-internal-blur";
const ROUTE_SWITCH_BUTTON_CLASS =
  "inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-white/35 bg-white/20 px-5 text-sm font-semibold uppercase tracking-[0.1em] text-white transition-colors hover:border-emerald-300/60 hover:bg-emerald-500/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70";
const SEND_LIVE_SOUND_URL = "/sounds/send-live.mp3";
const NOTIFICATION_VOLUME_CURVE_POWER = 1.7;

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function sliderValueToNotificationGain(sliderValue) {
  const safeSliderValue = clamp(Number(sliderValue), 0, 100);
  const normalizedValue = safeSliderValue / 100;

  return Math.pow(normalizedValue, NOTIFICATION_VOLUME_CURVE_POWER);
}

function toDateKey(value) {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      return "";
    }

    const year = value.getFullYear();
    const month = `${value.getMonth() + 1}`.padStart(2, "0");
    const day = `${value.getDate()}`.padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  if (typeof value === "string") {
    if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
      return value.slice(0, 10);
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return "";
    }

    return toDateKey(parsed);
  }

  return "";
}

function toDateLabel(value) {
  const dateKey = toDateKey(value);

  if (!dateKey) {
    return "Unknown date";
  }

  const parsed = new Date(`${dateKey}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return dateKey;
  }

  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric"
  }).format(parsed);
}

function normalizeSentMessages(payload) {
  if (Array.isArray(payload?.messages)) {
    return payload.messages;
  }

  if (Array.isArray(payload?.data?.messages)) {
    return payload.data.messages;
  }

  if (Array.isArray(payload?.data)) {
    return payload.data;
  }

  return [];
}

function resolveHasMore(payload, pageLoaded, receivedCount) {
  const pagination = payload?.pagination ?? payload?.meta ?? null;

  if (pagination) {
    if (typeof pagination.has_next_page === "boolean") {
      return pagination.has_next_page;
    }

    if (typeof pagination.has_more === "boolean") {
      return pagination.has_more;
    }

    if (typeof pagination.next_page === "number") {
      return pagination.next_page > pageLoaded;
    }

    if (typeof pagination.total_pages === "number") {
      return pageLoaded < pagination.total_pages;
    }
  }

  if (typeof payload?.has_more === "boolean") {
    return payload.has_more;
  }

  if (typeof payload?.next_page === "number") {
    return payload.next_page > pageLoaded;
  }

  return receivedCount > 0;
}

function shiftMonth(baseDate, monthDelta) {
  return new Date(baseDate.getFullYear(), baseDate.getMonth() + monthDelta, 1);
}

function toMonthKey(dateValue) {
  const year = dateValue.getFullYear();
  const month = `${dateValue.getMonth() + 1}`.padStart(2, "0");
  return `${year}-${month}`;
}

function normalizeDateKeys(payload) {
  const rawDateList =
    payload?.dates ??
    payload?.sent_dates ??
    payload?.data?.dates ??
    payload?.data?.sent_dates ??
    payload?.data;

  if (!Array.isArray(rawDateList)) {
    return [];
  }

  return rawDateList
    .map((dateValue) => toDateKey(typeof dateValue === "string" ? dateValue : ""))
    .filter(Boolean);
}

function parseDateOrToday(value) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return new Date();
  }

  return parsed;
}

function buildScheduledMessagesCableUrl(accessToken) {
  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000";
  const parsedUrl = new URL(apiBaseUrl);

  parsedUrl.protocol = parsedUrl.protocol === "https:" ? "wss:" : "ws:";
  parsedUrl.pathname = "/cable";
  parsedUrl.search = "";
  parsedUrl.searchParams.set("token", accessToken);

  return parsedUrl.toString();
}

export function SentMessagesPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { textSize, isNotificationMuted, notificationVolume } = useSettings();
  const [draftContent, setDraftContent] = useState("");
  const [unlockDate, setUnlockDate] = useState(() => new Date());
  const [calendarMonth, setCalendarMonth] = useState(() => new Date());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [composeError, setComposeError] = useState(null);
  const [composeSuccess, setComposeSuccess] = useState(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [showToolbarCalendar, setShowToolbarCalendar] = useState(false);
  const [selectedFeedDate, setSelectedFeedDate] = useState(null);
  const [toolbarCalendarMonth, setToolbarCalendarMonth] = useState(() => new Date());
  const [markedDates, setMarkedDates] = useState([]);
  const [isToolbarCalendarLoading, setIsToolbarCalendarLoading] = useState(false);

  const [sentMessages, setSentMessages] = useState([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [isInitialFeedLoading, setIsInitialFeedLoading] = useState(true);
  const [isFetchingNextPage, setIsFetchingNextPage] = useState(false);
  const [feedError, setFeedError] = useState(null);
  const [deleteSuccessToast, setDeleteSuccessToast] = useState("");
  const [expandedSentMessageIds, setExpandedSentMessageIds] = useState(new Set());

  const [editingId, setEditingId] = useState(null);
  const [editingContent, setEditingContent] = useState("");
  const [savingEditId, setSavingEditId] = useState(null);

  const todayDate = useMemo(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return now;
  }, []);
  const todayDateKey = toDateKey(todayDate);

  const feedRequestIdRef = useRef(0);
  const inFlightFeedRequestCountRef = useRef(0);
  const loadMoreSentinelRef = useRef(null);
  const toolbarCalendarRef = useRef(null);
  const toolbarCalendarToggleButtonRef = useRef(null);

  const highlightedDateKeys = useMemo(() => {
    const selectedDateKey = toDateKey(unlockDate);

    if (!selectedDateKey) {
      return new Set();
    }

    return new Set([selectedDateKey]);
  }, [unlockDate]);

  const heroTextareaTextSizeClass = textSize === "large"
    ? "text-xl"
    : textSize === "medium"
      ? "text-lg"
      : "text-base";
  const messageTextSizeClass = textSize === "large"
    ? "text-xl"
    : textSize === "medium"
      ? "text-base"
      : "text-sm";
  const userAvatarFallbackUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(user?.name || "User")}&background=random&color=fff`;
  const userAvatarUrl = user?.avatar_url || userAvatarFallbackUrl;

  useEffect(() => {
    logAvatarDebug("write_capsule_avatar_resolved", {
      page: "WriteCapsulePage",
      role: "user",
      userId: user?.id ?? null,
      userName: user?.name ?? null,
      hasPrimaryAvatar: Boolean(user?.avatar_url),
      primaryAvatarSummary: summarizeAvatarUrl(user?.avatar_url),
      selectedAvatarSummary: summarizeAvatarUrl(userAvatarUrl),
      fallbackAvatarSummary: summarizeAvatarUrl(userAvatarFallbackUrl),
      isUsingFallback: userAvatarUrl === userAvatarFallbackUrl
    });
  }, [user?.avatar_url, user?.id, user?.name, userAvatarFallbackUrl, userAvatarUrl]);

  const handleUserAvatarError = useCallback((event, context) => {
    const failedAvatarUrl = event.currentTarget.currentSrc || event.currentTarget.src;

    logAvatarDebug("write_capsule_avatar_fallback_activated", {
      page: "WriteCapsulePage",
      role: "user",
      userId: user?.id ?? null,
      context,
      failedAvatarSummary: summarizeAvatarUrl(failedAvatarUrl),
      fallbackAvatarSummary: summarizeAvatarUrl(userAvatarFallbackUrl),
      selectedAvatarSummary: summarizeAvatarUrl(userAvatarUrl),
      isOnline: typeof navigator !== "undefined" ? navigator.onLine : null,
      referrerPolicy: event.currentTarget.referrerPolicy || null,
      reason: "img_onerror"
    });

    event.currentTarget.onerror = null;
    event.currentTarget.src = userAvatarFallbackUrl;
  }, [user?.id, userAvatarFallbackUrl, userAvatarUrl]);

  const handleUserAvatarLoad = useCallback((event, context) => {
    const loadedAvatarUrl = event.currentTarget.currentSrc || event.currentTarget.src;

    logAvatarDebug("write_capsule_avatar_loaded", {
      page: "WriteCapsulePage",
      role: "user",
      userId: user?.id ?? null,
      context,
      loadedAvatarSummary: summarizeAvatarUrl(loadedAvatarUrl),
      isFallback: loadedAvatarUrl === userAvatarFallbackUrl
    });
  }, [user?.id, userAvatarFallbackUrl]);

  const toggleSentMessageExpanded = useCallback((messageKey) => {
    setExpandedSentMessageIds((previousIds) => {
      const nextIds = new Set(previousIds);

      if (nextIds.has(messageKey)) {
        nextIds.delete(messageKey);
      } else {
        nextIds.add(messageKey);
      }

      return nextIds;
    });
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedSearchQuery(searchQuery.trim());
    }, 300);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [searchQuery]);

  const loadSentPage = useCallback(async (pageToLoad, options = {}) => {
    const replace = options.replace === true;

    if (pageToLoad > 1 && inFlightFeedRequestCountRef.current > 0) {
      return;
    }

    const accessToken = getAccessToken();

    if (!accessToken) {
      setFeedError("Your session expired. Please sign in again.");
      setHasMore(false);
      setIsInitialFeedLoading(false);
      setIsFetchingNextPage(false);
      return;
    }

    inFlightFeedRequestCountRef.current += 1;

    if (pageToLoad === 1) {
      setIsInitialFeedLoading(true);
      setHasMore(true);
      if (replace) {
        setSentMessages([]);
        setPage(0);
      }
    } else {
      setIsFetchingNextPage(true);
    }

    setFeedError(null);

    const currentRequestId = feedRequestIdRef.current + 1;
    feedRequestIdRef.current = currentRequestId;

    try {
      const payload = await getSentScheduledMessages(accessToken, {
        page: pageToLoad,
        searchQuery: debouncedSearchQuery,
        date: selectedFeedDate ? toDateKey(selectedFeedDate) : ""
      });

      if (currentRequestId !== feedRequestIdRef.current) {
        return;
      }

      const normalizedSearch = debouncedSearchQuery.toLowerCase();
      const selectedDateKey = selectedFeedDate ? toDateKey(selectedFeedDate) : "";
      const incomingMessages = normalizeSentMessages(payload).filter((message) => {
        if (selectedDateKey && toDateKey(message?.unlock_date) !== selectedDateKey) {
          return false;
        }

        if (!normalizedSearch) {
          return true;
        }

        const content = typeof message?.content === "string" ? message.content.toLowerCase() : "";
        return content.includes(normalizedSearch);
      });

      let appendedCount = 0;

      setSentMessages((previousMessages) => {
        const baseMessages = replace ? [] : previousMessages;
        const knownKeys = new Set(
          baseMessages.map((message) => {
            return message?.__feedKey ?? String(message?.id ?? "");
          })
        );
        const nextMessages = [...baseMessages];

        incomingMessages.forEach((message, index) => {
          const fallbackKey = `${pageToLoad}-${index}-${message?.unlock_date ?? ""}-${message?.content ?? ""}`;
          const messageKey =
            message?.id !== undefined && message?.id !== null ? String(message.id) : fallbackKey;

          if (knownKeys.has(messageKey)) {
            return;
          }

          knownKeys.add(messageKey);
          appendedCount += 1;
          nextMessages.push({
            ...message,
            __feedKey: messageKey
          });
        });

        return nextMessages;
      });

      const backendHasMore = resolveHasMore(payload, pageToLoad, incomingMessages.length);

      if (pageToLoad > 1 && appendedCount === 0) {
        setHasMore(false);
      } else {
        setHasMore(Boolean(backendHasMore));
      }

      setPage(pageToLoad);
    } catch (error) {
      if (currentRequestId !== feedRequestIdRef.current) {
        return;
      }

      setFeedError(getFriendlyApiError(error, "Could not load sent capsules right now."));
      if (pageToLoad > 1) {
        setHasMore(false);
      }
    } finally {
      inFlightFeedRequestCountRef.current = Math.max(0, inFlightFeedRequestCountRef.current - 1);

      if (currentRequestId === feedRequestIdRef.current) {
        setIsInitialFeedLoading(false);
        setIsFetchingNextPage(false);
      }
    }
  }, [debouncedSearchQuery, selectedFeedDate]);

  useEffect(() => {
    void loadSentPage(1, { replace: true });
  }, [loadSentPage]);

  useEffect(() => {
    if (!showToolbarCalendar) {
      return;
    }

    const accessToken = getAccessToken();

    if (!accessToken) {
      setMarkedDates([]);
      return;
    }

    let isCancelled = false;

    const loadMarkedDates = async () => {
      setIsToolbarCalendarLoading(true);

      try {
        const payload = await getSentScheduledMessageDates(accessToken);
        const dateKeys = Array.isArray(payload)
          ? payload.filter((dateValue) => typeof dateValue === "string")
          : normalizeDateKeys(payload);

        if (!isCancelled) {
          setMarkedDates(dateKeys);
        }
      } catch (error) {
        console.error(error);
        if (!isCancelled) {
          setMarkedDates([]);
        }
      } finally {
        if (!isCancelled) {
          setIsToolbarCalendarLoading(false);
        }
      }
    };

    void loadMarkedDates();

    return () => {
      isCancelled = true;
    };
  }, [showToolbarCalendar]);

  useEffect(() => {
    function handleClickOutside(event) {
      const clickedInsideCalendar = toolbarCalendarRef.current?.contains(event.target);
      const clickedToggleButton = toolbarCalendarToggleButtonRef.current?.contains(event.target);

      if (!clickedInsideCalendar && !clickedToggleButton) {
        setShowToolbarCalendar(false);
      }
    }

    if (showToolbarCalendar) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showToolbarCalendar]);

  useEffect(() => {
    const sentinelNode = loadMoreSentinelRef.current;

    if (!sentinelNode || !hasMore || isInitialFeedLoading || isFetchingNextPage || sentMessages.length === 0) {
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) {
          return;
        }

        void loadSentPage(page + 1);
      },
      {
        root: null,
        rootMargin: "0px 0px 220px 0px",
        threshold: 0.1
      }
    );

    observer.observe(sentinelNode);

    return () => {
      observer.disconnect();
    };
  }, [hasMore, isFetchingNextPage, isInitialFeedLoading, loadSentPage, page, sentMessages.length]);

  const handleSubmit = async (event) => {
    event.preventDefault();

    const trimmedContent = draftContent.trim();
    const selectedUnlockDateKey = toDateKey(unlockDate);

    if (!trimmedContent) {
      setComposeError("Write a message before burying the capsule.");
      setComposeSuccess(null);
      return;
    }

    if (!selectedUnlockDateKey || selectedUnlockDateKey < todayDateKey) {
      setComposeError("Unlock date must be today or later.");
      setComposeSuccess(null);
      return;
    }

    const accessToken = getAccessToken();

    if (!accessToken) {
      setComposeError("Your session expired. Please sign in again.");
      setComposeSuccess(null);
      return;
    }

    setComposeError(null);
    setComposeSuccess(null);
    setIsSubmitting(true);

    if (!isNotificationMuted) {
      const audioTrack = new Audio(SEND_LIVE_SOUND_URL);
      audioTrack.volume = sliderValueToNotificationGain(notificationVolume);
      const playPromise = audioTrack.play();

      if (playPromise && typeof playPromise.catch === "function") {
        playPromise.catch(() => {});
      }
    }

    try {
      const payload = await createScheduledMessage(accessToken, {
        content: trimmedContent,
        unlockDate: selectedUnlockDateKey
      });

      setDraftContent("");
      setComposeSuccess(payload?.message ?? "Time capsule successfully buried!");
      void loadSentPage(1, { replace: true });
    } catch (error) {
      setComposeError(getFriendlyApiError(error, "Could not bury your capsule right now."));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStartEdit = (message) => {
    if (!message?.id) {
      return;
    }

    setEditingId(String(message.id));
    setEditingContent(message?.content ?? "");
    setFeedError(null);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditingContent("");
  };

  const handleSaveEdit = async (message) => {
    if (!message?.id) {
      return;
    }

    const trimmedEditContent = editingContent.trim();

    if (!trimmedEditContent) {
      setFeedError("Message content cannot be empty.");
      return;
    }

    const originalContent = typeof message?.content === "string" ? message.content.trim() : "";

    if (trimmedEditContent === originalContent) {
      handleCancelEdit();
      return;
    }

    const accessToken = getAccessToken();

    if (!accessToken) {
      setFeedError("Your session expired. Please sign in again.");
      return;
    }

    setSavingEditId(String(message.id));
    setFeedError(null);

    try {
      const payload = await updateScheduledMessage(accessToken, message.id, {
        content: trimmedEditContent,
        unlockDate: toDateKey(message?.unlock_date)
      });

      const updatedMessage = payload?.data ?? {};

      setSentMessages((previousMessages) => {
        return previousMessages.map((existingMessage) => {
          if (String(existingMessage?.id) !== String(message.id)) {
            return existingMessage;
          }

          return {
            ...existingMessage,
            content: typeof updatedMessage?.content === "string" ? updatedMessage.content : trimmedEditContent,
            unlock_date: toDateKey(updatedMessage?.unlock_date) || toDateKey(existingMessage?.unlock_date)
          };
        });
      });

      handleCancelEdit();
    } catch (error) {
      setFeedError(getFriendlyApiError(error, "Could not save this edit right now."));
    } finally {
      setSavingEditId(null);
    }
  };

  const handleDeleteMessage = async (message) => {
    if (!message?.id) {
      return;
    }

    const accessToken = getAccessToken();

    if (!accessToken) {
      setFeedError("Your session expired. Please sign in again.");
      return;
    }

    try {
      await deleteScheduledMessage(accessToken, message.id);
      const deletedId = String(message.id);

      setSentMessages((previousMessages) => {
        return previousMessages.filter((existingMessage) => String(existingMessage?.id ?? "") !== deletedId);
      });
      setEditingId((previousEditingId) => previousEditingId === deletedId ? null : previousEditingId);
      setSavingEditId((previousSavingId) => previousSavingId === deletedId ? null : previousSavingId);
      setDeleteSuccessToast("Capsule successfully destroyed.");
    } catch (error) {
      setFeedError(getFriendlyApiError(error, "Could not destroy this capsule right now."));
    }
  };

  useEffect(() => {
    if (!deleteSuccessToast) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setDeleteSuccessToast("");
    }, 2400);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [deleteSuccessToast]);

  useEffect(() => {
    const accessToken = getAccessToken();

    if (!accessToken) {
      return undefined;
    }

    let consumer;
    let subscription;

    try {
      consumer = createConsumer(buildScheduledMessagesCableUrl(accessToken));
      subscription = consumer.subscriptions.create("ScheduledMessagesChannel", {
        received(data) {
          const action = typeof data?.action === "string" ? data.action : "";

          if (action === "message_deleted") {
            const deletedId = String(data?.message_id ?? "");

            if (!deletedId) {
              return;
            }

            setSentMessages((previousMessages) => {
              return previousMessages.filter((message) => String(message?.id ?? "") !== deletedId);
            });
            setEditingId((previousEditingId) => previousEditingId === deletedId ? null : previousEditingId);
            setSavingEditId((previousSavingId) => previousSavingId === deletedId ? null : previousSavingId);
            return;
          }

          const incomingMessage = data?.message;

          if (!incomingMessage || typeof incomingMessage !== "object") {
            return;
          }

          const incomingId = String(incomingMessage?.id ?? "");

          if (action === "message_created") {
            setSentMessages((previousMessages) => {
              const existingIndex = previousMessages.findIndex((message) => String(message?.id ?? "") === incomingId);

              if (existingIndex >= 0) {
                const nextMessages = [...previousMessages];
                nextMessages[existingIndex] = {
                  ...nextMessages[existingIndex],
                  ...incomingMessage
                };
                return nextMessages;
              }

              return [
                {
                  ...incomingMessage,
                  __feedKey: incomingId || `socket-${Date.now()}`
                },
                ...previousMessages
              ];
            });
            return;
          }

          if (action === "message_updated") {
            setSentMessages((previousMessages) => {
              return previousMessages.map((message) => {
                if (String(message?.id ?? "") !== incomingId) {
                  return message;
                }

                return {
                  ...message,
                  ...incomingMessage
                };
              });
            });
            return;
          }

        }
      });
    } catch {
      return undefined;
    }

    return () => {
      subscription?.unsubscribe();
      consumer?.disconnect();
    };
  }, []);

  return (
    <section className="pb-10 sm:pb-14">
      {deleteSuccessToast && (
        <div className={classNames("fixed bottom-6 right-6 z-[140] max-w-sm rounded-2xl px-4 py-3 text-sm text-white drop-shadow-md", MATTE_GLASS_PANEL_CLASS)}>
          <p>{deleteSuccessToast}</p>
        </div>
      )}

      <div className="space-y-6">
        <div className={classNames("rounded-3xl p-5 sm:p-7", MATTE_GLASS_PANEL_CLASS)}>
          <div className="grid grid-cols-1 items-stretch gap-6 md:min-h-[300px] md:grid-cols-3">
            <form onSubmit={handleSubmit} className="flex h-full flex-col gap-4 md:col-span-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.26em] text-white/90 drop-shadow-md">Write Capsule</p>
                <h1 className="mt-3 text-3xl leading-tight text-white drop-shadow-md sm:text-4xl">Bury a message for later</h1>
              </div>

              <textarea
                value={draftContent}
                onChange={(event) => {
                  setDraftContent(event.target.value);
                }}
                rows={10}
                placeholder="Write a message your partner will open on the selected day..."
                className={classNames(
                  "min-h-[300px] w-full flex-1 resize-none rounded-2xl bg-transparent px-4 py-3 leading-relaxed text-white placeholder:text-white/60 drop-shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/65",
                  heroTextareaTextSizeClass
                )}
              />

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-white/85 drop-shadow-md">Unlock date: {toDateLabel(unlockDate)}</p>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="inline-flex h-11 items-center justify-center rounded-2xl border border-white/35 bg-white/20 px-5 text-sm font-semibold uppercase tracking-[0.1em] text-white transition-colors hover:border-emerald-300/60 hover:bg-emerald-500/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSubmitting ? "Burying..." : "Bury Capsule"}
                </button>
              </div>

              {composeError && <p className="text-sm text-rose-100 drop-shadow-md">{composeError}</p>}
              {composeSuccess && <p className="text-sm text-emerald-100 drop-shadow-md">{composeSuccess}</p>}
            </form>

            <div className="h-full md:col-span-1">
              <InboxCalendar
                activeMonth={calendarMonth}
                onMonthChange={(delta) => {
                  setCalendarMonth((previousMonth) => shiftMonth(previousMonth, delta));
                }}
                selectedDate={unlockDate}
                minSelectableDate={todayDate}
                emphasizeSelectableHover
                onSelectDate={(dateValue) => {
                  const safeDate = parseDateOrToday(dateValue);
                  setUnlockDate(safeDate);
                  setCalendarMonth(new Date(safeDate.getFullYear(), safeDate.getMonth(), 1));
                }}
                highlightedDateKeys={highlightedDateKeys}
                containerClassName={classNames("h-full w-full rounded-3xl p-3 sm:p-4", MATTE_GLASS_PANEL_CLASS)}
              />
            </div>
          </div>
        </div>

        <div className={classNames("relative z-50 overflow-visible rounded-3xl p-4 sm:p-5", MATTE_GLASS_PANEL_CLASS)}>
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-2">
              <div className="relative">
                <button
                  ref={toolbarCalendarToggleButtonRef}
                  type="button"
                  onClick={() => {
                    setShowToolbarCalendar((previousValue) => !previousValue);
                  }}
                  aria-pressed={showToolbarCalendar}
                  aria-label="Toggle sent date filter"
                  className={classNames(
                    "inline-flex h-11 w-11 items-center justify-center rounded-2xl text-white transition hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70",
                    MATTE_GLASS_PANEL_CLASS
                  )}
                >
                  <CalendarDays size={18} strokeWidth={2} />
                </button>

                {showToolbarCalendar && (
                  <div
                    ref={toolbarCalendarRef}
                    className="absolute left-0 top-full z-[100] mt-4 rounded-3xl border border-white/20 bg-stone-900/85 backdrop-blur-[64px] shadow-[0_0_40px_rgba(0,0,0,0.5)]"
                    onClick={(event) => {
                      event.stopPropagation();
                    }}
                  >
                    <InboxCalendar
                      activeMonth={toolbarCalendarMonth}
                      onMonthChange={(delta) => {
                        setToolbarCalendarMonth((previousMonth) => shiftMonth(previousMonth, delta));
                      }}
                      selectedDate={selectedFeedDate}
                      emphasizeSelectableHover
                      onSelectDate={(dateValue) => {
                        const nextDateKey = toDateKey(dateValue);
                        const currentDateKey = selectedFeedDate ? toDateKey(selectedFeedDate) : "";

                        if (currentDateKey === nextDateKey) {
                          setSelectedFeedDate(null);
                          return;
                        }

                        setSelectedFeedDate(dateValue);
                      }}
                      highlightedDateKeys={markedDates}
                      isLoading={isToolbarCalendarLoading}
                      containerClassName={classNames("w-64 rounded-3xl p-3", MATTE_GLASS_PANEL_CLASS)}
                    />
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={() => {
                  setSelectedFeedDate(null);
                }}
                className="inline-flex h-11 items-center justify-center rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white transition-colors hover:border-emerald-300/60 hover:bg-emerald-500/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
              >
                SHOW ALL
              </button>

            </div>

            <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:justify-end">
              <label className="relative block w-full max-w-sm">
                <Search
                  size={16}
                  strokeWidth={2}
                  className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-white/90"
                />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(event) => {
                    setSearchQuery(event.target.value);
                  }}
                  placeholder="Search sent capsules"
                  className={classNames(
                    "h-11 w-full rounded-2xl pl-11 pr-4 text-sm text-white placeholder:text-white/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70",
                    MATTE_GLASS_PANEL_CLASS
                  )}
                  aria-label="Search sent capsules"
                />
              </label>

              <button
                type="button"
                onClick={() => {
                  navigate("/");
                }}
                className={ROUTE_SWITCH_BUTTON_CLASS}
              >
                <Inbox size={16} strokeWidth={2.1} />
                <span>Received Messages</span>
              </button>
            </div>
          </div>
        </div>

        {selectedFeedDate && (
          <div className={classNames("rounded-2xl px-5 py-3 text-sm text-white", MATTE_GLASS_PANEL_CLASS)}>
            <p className="drop-shadow-md">Showing sent capsules for {toDateKey(selectedFeedDate)}.</p>
          </div>
        )}

        <div className="relative z-10 space-y-4">
          {isInitialFeedLoading && (
            <div className={classNames("rounded-3xl px-6 py-7", MATTE_GLASS_PANEL_CLASS)}>
              <GlassLoader compact message="Loading sent capsules..." />
            </div>
          )}

          {!isInitialFeedLoading && feedError && (
            <div className={classNames("rounded-3xl px-6 py-6 text-sm text-rose-100", MATTE_GLASS_PANEL_CLASS)}>
              <p className="drop-shadow-md">{feedError}</p>
            </div>
          )}

          {!isInitialFeedLoading && !feedError && sentMessages.length === 0 && (
            <div className={classNames("rounded-3xl px-6 py-8 text-center text-sm text-white drop-shadow-md", MATTE_GLASS_PANEL_CLASS)}>
              {debouncedSearchQuery
                ? "No sent capsules match your search."
                : "No sent capsules yet. Your buried messages will appear here."}
            </div>
          )}

          {!isInitialFeedLoading && !feedError && sentMessages.length > 0 && (
            <div className="space-y-4">
              {sentMessages.map((msg) => {
                const messageId = String(msg?.id ?? msg?.__feedKey ?? "");
                const isEditing = editingId === messageId;
                const isExpanded = expandedSentMessageIds.has(messageId);
                const messageDate = new Date(msg.unlock_date);
                messageDate.setHours(0, 0, 0, 0);

                const today = new Date();
                today.setHours(0, 0, 0, 0);

                const isModifiable = messageDate.getTime() >= today.getTime();

                return (
                  <article
                    key={msg?.__feedKey ?? messageId}
                    className={classNames("rounded-3xl px-5 py-5 sm:px-7 sm:py-6", MATTE_GLASS_PANEL_CLASS)}
                  >
                    <img
                      src={userAvatarUrl}
                      alt="Avatar"
                      className="absolute top-6 right-6 h-10 w-10 rounded-full border border-white/30 bg-stone-800 object-cover shadow-md"
                      referrerPolicy="no-referrer"
                      onLoad={(event) => {
                        handleUserAvatarLoad(event, "sent_message_card");
                      }}
                      onError={(event) => {
                        handleUserAvatarError(event, "sent_message_card");
                      }}
                    />

                    <div className="pr-16">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-white/80 drop-shadow-md">
                          Unlocks on {toDateLabel(msg?.unlock_date)}
                        </p>

                        {isModifiable && !isEditing && (
                          <div className="actions mr-12 flex items-center gap-2 sm:mr-14">
                            <button
                              type="button"
                              onClick={() => {
                                handleStartEdit(msg);
                              }}
                              className="inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-white/35 bg-white/20 px-3 text-xs font-semibold uppercase tracking-[0.08em] text-white transition hover:bg-white/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
                            >
                              <Pencil size={14} strokeWidth={2.2} />
                              <span>Edit</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                void handleDeleteMessage(msg);
                              }}
                              className="inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-rose-200/35 bg-white/20 px-3 text-xs font-semibold uppercase tracking-[0.08em] text-white transition hover:bg-rose-500/20 hover:text-red-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300/70"
                            >
                              <Trash2 size={14} strokeWidth={2.2} />
                              <span>Delete</span>
                            </button>
                          </div>
                        )}
                      </div>

                      {!isEditing && (
                        <>
                          <p className={classNames(
                            "mt-3 whitespace-pre-wrap leading-relaxed text-white drop-shadow-md",
                            messageTextSizeClass,
                            isExpanded ? "" : "line-clamp-4"
                          )}
                          >
                            {msg?.content}
                          </p>
                          <button
                            type="button"
                            onClick={() => {
                              toggleSentMessageExpanded(messageId);
                            }}
                            className="mt-2 text-sm text-white/50 transition-colors hover:text-white"
                          >
                            {isExpanded ? "Show less" : "Read more"}
                          </button>
                        </>
                      )}

                      {isEditing && (
                        <div className="mt-3 space-y-3">
                          <textarea
                            value={editingContent}
                            onChange={(event) => {
                              setEditingContent(event.target.value);
                            }}
                            rows={5}
                            className="w-full rounded-2xl border border-white/20 bg-transparent px-4 py-3 text-base leading-relaxed text-white placeholder:text-white/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
                          />

                          <div className="flex flex-wrap items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={handleCancelEdit}
                              className="inline-flex h-10 items-center justify-center rounded-xl border border-white/25 bg-white/10 px-4 text-xs font-semibold uppercase tracking-[0.08em] text-white transition hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
                            >
                              Cancel
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                void handleSaveEdit(msg);
                              }}
                              disabled={savingEditId === messageId}
                              className="inline-flex h-10 items-center justify-center rounded-xl border border-white/35 bg-white/20 px-4 text-xs font-semibold uppercase tracking-[0.08em] text-white transition hover:bg-white/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {savingEditId === messageId ? "Saving..." : "Save"}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          {!isInitialFeedLoading && hasMore && <div ref={loadMoreSentinelRef} className="h-4 w-full" aria-hidden="true" />}

          {isFetchingNextPage && (
            <div className={classNames("rounded-3xl px-6 py-7", MATTE_GLASS_PANEL_CLASS)}>
              <GlassLoader compact message="Loading more sent capsules..." />
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

export function WriteCapsulePage() {
  return (
    <DashboardLayout>
      <SentMessagesPage />
    </DashboardLayout>
  );
}

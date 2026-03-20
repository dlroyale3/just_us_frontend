import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createConsumer } from "@rails/actioncable";
import { CalendarDays, PenTool, Search } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { InboxCalendar } from "../components/dashboard/InboxCalendar";
import { useDynamicBackgroundControls } from "../components/layout/DynamicBackgroundLayout";
import { GlassLoader } from "../components/ui/GlassLoader";
import { useAuth } from "../context/AuthContext";
import { useSettings } from "../context/SettingsContext";
import {
  getFriendlyApiError,
  markScheduledMessagesRead,
  getReceivedScheduledMessageDates,
  getReceivedScheduledMessages
} from "../services/apiClient";
import { getAccessToken } from "../utils/authStorage";
import { logAvatarDebug, summarizeAvatarUrl } from "../utils/avatarDebug";

function classNames(...parts) {
  return parts.filter(Boolean).join(" ");
}

const HEAVY_MATTE_GLASS_CLASS =
  "relative isolate z-10 bg-black/30 border border-white/10 shadow-2xl ring-1 ring-white/5 glass-internal-blur";
const ROUTE_SWITCH_BUTTON_CLASS =
  "inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-white/35 bg-white/20 px-5 text-sm font-semibold uppercase tracking-[0.1em] text-white transition-colors hover:border-emerald-300/60 hover:bg-emerald-500/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70";

function toDateKey(value) {
  if (!value || typeof value !== "string") {
    return "";
  }

  if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
    return value.slice(0, 10);
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  const localYear = parsed.getFullYear();
  const localMonth = `${parsed.getMonth() + 1}`.padStart(2, "0");
  const localDay = `${parsed.getDate()}`.padStart(2, "0");
  return `${localYear}-${localMonth}-${localDay}`;
}

function dateKeyToLabel(dateKey) {
  if (!dateKey) {
    return "Unknown day";
  }

  const parsed = new Date(`${dateKey}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return dateKey;
  }

  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric"
  }).format(parsed);
}

function toSortTime(message) {
  const unlockDate = toDateKey(message?.unlock_date);

  if (unlockDate) {
    const unlockTime = new Date(`${unlockDate}T12:00:00`).getTime();
    if (!Number.isNaN(unlockTime)) {
      return unlockTime;
    }
  }

  const createdTime = new Date(message?.created_at ?? 0).getTime();
  return Number.isNaN(createdTime) ? 0 : createdTime;
}

function normalizeReceivedMessages(payload) {
  if (Array.isArray(payload?.today_messages)) {
    return payload.today_messages;
  }

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

function sameDateKey(leftValue, rightValue) {
  return toDateKey(leftValue) === toDateKey(rightValue);
}

function normalizeReceivedDateKeys(payload) {
  const rawDateList =
    payload?.dates ??
    payload?.received_dates ??
    payload?.data?.dates ??
    payload?.data?.received_dates ??
    payload?.data;

  if (!Array.isArray(rawDateList)) {
    return [];
  }

  return rawDateList
    .map((dateValue) => {
      return toDateKey(typeof dateValue === "string" ? dateValue : "");
    })
    .filter(Boolean);
}

function shiftMonth(baseDate, monthDelta) {
  return new Date(baseDate.getFullYear(), baseDate.getMonth() + monthDelta, 1);
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

export function InboxPage() {
  const { partner } = useAuth();
  const { textSize } = useSettings();
  const { clearNotificationCount } = useDynamicBackgroundControls();
  const navigate = useNavigate();
  const [todayMessages, setTodayMessages] = useState([]);
  const [isTodayLoading, setIsTodayLoading] = useState(true);
  const [todayError, setTodayError] = useState(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [showCalendar, setShowCalendar] = useState(false);
  const [selectedDate, setSelectedDate] = useState(null);
  const [calendarMonth, setCalendarMonth] = useState(() => new Date());
  const [markedDates, setMarkedDates] = useState([]);
  const [isCalendarLoading, setIsCalendarLoading] = useState(false);

  const [feedMessages, setFeedMessages] = useState([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [isInitialFeedLoading, setIsInitialFeedLoading] = useState(true);
  const [isFetchingNextPage, setIsFetchingNextPage] = useState(false);
  const [feedError, setFeedError] = useState(null);
  const [expandedFeedMessageIds, setExpandedFeedMessageIds] = useState(new Set());
  const [collapsedTodayMessageIds, setCollapsedTodayMessageIds] = useState(new Set());

  const feedRequestIdRef = useRef(0);
  const inFlightFeedRequestCountRef = useRef(0);
  const loadMoreSentinelRef = useRef(null);
  const calendarRef = useRef(null);
  const calendarToggleButtonRef = useRef(null);

  const todayDateKey = useMemo(() => {
    const currentDate = new Date();
    const year = currentDate.getFullYear();
    const month = `${currentDate.getMonth() + 1}`.padStart(2, "0");
    const day = `${currentDate.getDate()}`.padStart(2, "0");
    return `${year}-${month}-${day}`;
  }, []);

  const heroMessageTextSizeClass = textSize === "large"
    ? "text-xl"
    : textSize === "medium"
      ? "text-base"
      : "text-sm";
  const partnerAvatarFallbackUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(partner?.name || "User")}&background=random&color=fff`;
  const partnerAvatarUrl = partner?.avatar_url || partnerAvatarFallbackUrl;

  useEffect(() => {
    logAvatarDebug("inbox_avatar_resolved", {
      page: "InboxPage",
      role: "partner",
      partnerId: partner?.id ?? null,
      partnerName: partner?.name ?? null,
      hasPrimaryAvatar: Boolean(partner?.avatar_url),
      primaryAvatarSummary: summarizeAvatarUrl(partner?.avatar_url),
      selectedAvatarSummary: summarizeAvatarUrl(partnerAvatarUrl),
      fallbackAvatarSummary: summarizeAvatarUrl(partnerAvatarFallbackUrl),
      isUsingFallback: partnerAvatarUrl === partnerAvatarFallbackUrl
    });
  }, [partner?.avatar_url, partner?.id, partner?.name, partnerAvatarFallbackUrl, partnerAvatarUrl]);

  const handlePartnerAvatarError = useCallback((event, context) => {
    const failedAvatarUrl = event.currentTarget.currentSrc || event.currentTarget.src;

    logAvatarDebug("inbox_avatar_fallback_activated", {
      page: "InboxPage",
      role: "partner",
      partnerId: partner?.id ?? null,
      context,
      failedAvatarSummary: summarizeAvatarUrl(failedAvatarUrl),
      fallbackAvatarSummary: summarizeAvatarUrl(partnerAvatarFallbackUrl),
      selectedAvatarSummary: summarizeAvatarUrl(partnerAvatarUrl),
      isOnline: typeof navigator !== "undefined" ? navigator.onLine : null,
      referrerPolicy: event.currentTarget.referrerPolicy || null,
      reason: "img_onerror"
    });

    event.currentTarget.onerror = null;
    event.currentTarget.src = partnerAvatarFallbackUrl;
  }, [partner?.id, partnerAvatarFallbackUrl, partnerAvatarUrl]);

  const handlePartnerAvatarLoad = useCallback((event, context) => {
    const loadedAvatarUrl = event.currentTarget.currentSrc || event.currentTarget.src;

    logAvatarDebug("inbox_avatar_loaded", {
      page: "InboxPage",
      role: "partner",
      partnerId: partner?.id ?? null,
      context,
      loadedAvatarSummary: summarizeAvatarUrl(loadedAvatarUrl),
      isFallback: loadedAvatarUrl === partnerAvatarFallbackUrl
    });
  }, [partner?.id, partnerAvatarFallbackUrl]);

  const resolveMessageKey = useCallback((message, fallbackValue = "") => {
    if (message?.id !== undefined && message?.id !== null) {
      return String(message.id);
    }

    if (message?.__feedKey) {
      return String(message.__feedKey);
    }

    return fallbackValue;
  }, []);

  const toggleFeedMessageExpanded = useCallback((messageKey) => {
    setExpandedFeedMessageIds((previousIds) => {
      const nextIds = new Set(previousIds);

      if (nextIds.has(messageKey)) {
        nextIds.delete(messageKey);
      } else {
        nextIds.add(messageKey);
      }

      return nextIds;
    });
  }, []);

  const toggleTodayMessageCollapsed = useCallback((messageKey) => {
    setCollapsedTodayMessageIds((previousIds) => {
      const nextIds = new Set(previousIds);

      if (nextIds.has(messageKey)) {
        nextIds.delete(messageKey);
      } else {
        nextIds.add(messageKey);
      }

      return nextIds;
    });
  }, []);

  const syncScheduledReadState = useCallback(async () => {
    const accessToken = getAccessToken();

    if (!accessToken) {
      return;
    }

    try {
      await markScheduledMessagesRead(accessToken);
      clearNotificationCount("scheduled");
    } catch {
      // Non-blocking: inbox can still render even if read-sync fails.
    }
  }, [clearNotificationCount]);

  useEffect(() => {
    void syncScheduledReadState();
  }, [syncScheduledReadState]);

  useEffect(() => {
    clearNotificationCount("scheduled");
  }, [clearNotificationCount]);

  useEffect(() => {
    const handleFocus = () => {
      void syncScheduledReadState();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible") {
        return;
      }

      handleFocus();
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [syncScheduledReadState]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedSearchQuery(searchQuery.trim());
    }, 300);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [searchQuery]);

  const loadTodayMessage = useCallback(async () => {
    const accessToken = getAccessToken();

    if (!accessToken) {
      setTodayError("Your session expired. Please sign in again.");
      setIsTodayLoading(false);
      return;
    }

    setIsTodayLoading(true);
    setTodayError(null);

    try {
      const payload = await getReceivedScheduledMessages(accessToken, {
        filter: "today"
      });
      const messages = normalizeReceivedMessages(payload);
      setTodayMessages(messages);
    } catch (error) {
      setTodayError(getFriendlyApiError(error, "Could not load today's capsule."));
      setTodayMessages([]);
    } finally {
      setIsTodayLoading(false);
    }
  }, []);

  const loadFeedPage = useCallback(async (pageToLoad, options = {}) => {
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
        setFeedMessages([]);
        setPage(0);
      }
    } else {
      setIsFetchingNextPage(true);
    }

    setFeedError(null);

    const currentRequestId = feedRequestIdRef.current + 1;
    feedRequestIdRef.current = currentRequestId;

    try {
      const payload = await getReceivedScheduledMessages(accessToken, {
        page: pageToLoad,
        searchQuery: debouncedSearchQuery,
        date: selectedDate ? toDateKey(selectedDate) : ""
      });

      if (currentRequestId !== feedRequestIdRef.current) {
        return;
      }

      const incomingMessages = normalizeReceivedMessages(payload).filter((message) => {
        if (selectedDate) {
          return true;
        }

        return !sameDateKey(message?.unlock_date, todayDateKey);
      });

      let appendedCount = 0;

      setFeedMessages((previousMessages) => {
        const baseMessages = replace ? [] : previousMessages;
        const knownKeys = new Set(
          baseMessages.map((message) => {
            return message?.__feedKey ?? String(message?.id ?? "");
          })
        );
        const nextMessages = [...baseMessages];

        incomingMessages.forEach((message, index) => {
          const fallbackKey = `${pageToLoad}-${index}-${message?.unlock_date ?? ""}-${message?.content ?? ""}`;
          const messageKey = message?.id !== undefined && message?.id !== null
            ? String(message.id)
            : fallbackKey;

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

      setFeedError(getFriendlyApiError(error, "Could not load older capsules right now."));
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
  }, [debouncedSearchQuery, selectedDate, todayDateKey]);

  useEffect(() => {
    void loadTodayMessage();
  }, [loadTodayMessage]);

  useEffect(() => {
    void loadFeedPage(1, { replace: true });
  }, [loadFeedPage]);

  useEffect(() => {
    if (!showCalendar) {
      return;
    }

    const accessToken = getAccessToken();

    if (!accessToken) {
      setMarkedDates([]);
      return;
    }

    let isCancelled = false;

    const loadMarkedDates = async () => {
      setIsCalendarLoading(true);

      try {
        const payload = await getReceivedScheduledMessageDates(accessToken);
        const dateKeys = Array.isArray(payload)
          ? payload.filter((dateValue) => typeof dateValue === "string")
          : normalizeReceivedDateKeys(payload);

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
          setIsCalendarLoading(false);
        }
      }
    };

    void loadMarkedDates();

    return () => {
      isCancelled = true;
    };
  }, [showCalendar]);

  useEffect(() => {
    function handleClickOutside(event) {
      const clickedInsideCalendar = calendarRef.current?.contains(event.target);
      const clickedToggleButton = calendarToggleButtonRef.current?.contains(event.target);

      if (!clickedInsideCalendar && !clickedToggleButton) {
        setShowCalendar(false);
      }
    }

    if (showCalendar) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showCalendar]);

  useEffect(() => {
    const sentinelNode = loadMoreSentinelRef.current;

    if (!sentinelNode || !hasMore || isInitialFeedLoading || isFetchingNextPage || feedMessages.length === 0) {
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) {
          return;
        }

        void loadFeedPage(page + 1);
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
  }, [feedMessages.length, hasMore, isFetchingNextPage, isInitialFeedLoading, loadFeedPage, page]);

  const groupedFeed = useMemo(() => {
    const sortedMessages = [...feedMessages].sort((firstMessage, secondMessage) => {
      return toSortTime(secondMessage) - toSortTime(firstMessage);
    });

    const groups = [];

    sortedMessages.forEach((message) => {
      const dateKey = toDateKey(message?.unlock_date) || "unknown";
      const existingGroup = groups.find((group) => group.dateKey === dateKey);

      if (existingGroup) {
        existingGroup.messages.push(message);
        return;
      }

      groups.push({
        dateKey,
        label: dateKey === "unknown" ? "Unknown day" : dateKeyToLabel(dateKey),
        messages: [message]
      });
    });

    return groups;
  }, [feedMessages]);

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

            setTodayMessages((previousMessages) => {
              return previousMessages.filter((message) => String(message?.id ?? "") !== deletedId);
            });

            setFeedMessages((previousMessages) => {
              return previousMessages.filter((message) => String(message?.id ?? "") !== deletedId);
            });

            return;
          }

          const incomingMessage = data?.message;

          if (!incomingMessage || typeof incomingMessage !== "object") {
            return;
          }

          const incomingId = String(incomingMessage?.id ?? "");

          if (action === "message_created") {
            const isToday = new Date(incomingMessage.unlock_date).toDateString() === new Date().toDateString();

            if (isToday) {
              setTodayMessages((previousMessages) => {
                const existingIndex = previousMessages.findIndex((message) => String(message?.id ?? "") === incomingId);

                if (existingIndex >= 0) {
                  const nextMessages = [...previousMessages];
                  nextMessages[existingIndex] = {
                    ...nextMessages[existingIndex],
                    ...incomingMessage
                  };
                  return nextMessages;
                }

                return [incomingMessage, ...previousMessages];
              });
              return;
            }

            setFeedMessages((previousMessages) => {
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
            setTodayMessages((previousMessages) => {
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

            setFeedMessages((previousMessages) => {
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
      <div className="space-y-6">
        <div className={classNames("rounded-3xl p-6 sm:p-8", HEAVY_MATTE_GLASS_CLASS)}>
          <p className="text-center text-xs font-semibold uppercase tracking-[0.28em] text-white/90 drop-shadow-md">
            Today&apos;s Message
          </p>

          {isTodayLoading && <p className="mt-6 text-center text-sm text-white drop-shadow-md">Loading today's capsule...</p>}

          {!isTodayLoading && todayError && (
            <p className="mt-6 text-center text-sm text-rose-200 drop-shadow-md">{todayError}</p>
          )}

          {!isTodayLoading && !todayError && todayMessages.length > 0 && (
            <div className="mt-6 space-y-4">
              {todayMessages.map((message, index) => {
                const messageKey = resolveMessageKey(
                  message,
                  `today-${index}-${message?.unlock_date ?? ""}-${message?.content ?? ""}`
                );
                const isCollapsed = collapsedTodayMessageIds.has(messageKey);

                return (
                  <article key={messageKey} className={classNames("rounded-3xl px-6 py-7 sm:px-8", HEAVY_MATTE_GLASS_CLASS)}>
                    <img
                      src={partnerAvatarUrl}
                      alt="Avatar"
                      className="absolute top-6 right-6 h-10 w-10 rounded-full border border-white/30 bg-stone-800 object-cover shadow-md"
                      referrerPolicy="no-referrer"
                      onLoad={(event) => {
                        handlePartnerAvatarLoad(event, "today_card");
                      }}
                      onError={(event) => {
                        handlePartnerAvatarError(event, "today_card");
                      }}
                    />

                    <div className="pr-16">
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/80 drop-shadow-md">Unlocked today</p>
                      <p className={classNames(
                        "mt-3 whitespace-pre-wrap leading-tight text-white drop-shadow-md",
                        heroMessageTextSizeClass,
                        isCollapsed ? "line-clamp-4" : ""
                      )}
                      >
                        {message.content}
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          toggleTodayMessageCollapsed(messageKey);
                        }}
                        className="mt-3 text-sm text-white/50 transition-colors hover:text-white"
                      >
                        {isCollapsed ? "Expand" : "Show less"}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          {!isTodayLoading && !todayError && todayMessages.length === 0 && (
            <p className="mt-6 text-center text-sm text-white drop-shadow-md">
              No new time capsule unlocked today. Your next surprise is still sealed.
            </p>
          )}
        </div>

        <div className={classNames("relative z-50 overflow-visible rounded-3xl p-4 sm:p-5", HEAVY_MATTE_GLASS_CLASS)}>
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-2">
              <div className="relative">
                <button
                  ref={calendarToggleButtonRef}
                  type="button"
                  onClick={() => {
                    setShowCalendar((previousValue) => !previousValue);
                  }}
                  aria-pressed={showCalendar}
                  aria-label="Toggle calendar panel"
                  className={classNames(
                    "inline-flex h-11 w-11 items-center justify-center rounded-2xl text-white transition hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70",
                    HEAVY_MATTE_GLASS_CLASS
                  )}
                >
                  <CalendarDays size={18} strokeWidth={2} />
                </button>

                {showCalendar && (
                  <>
                    <div
                      ref={calendarRef}
                      className="absolute top-full mt-4 left-0 z-[100] rounded-3xl border border-white/20 bg-stone-900/85 backdrop-blur-[64px] shadow-[0_0_40px_rgba(0,0,0,0.5)]"
                      onClick={(event) => {
                        event.stopPropagation();
                      }}
                    >
                      <InboxCalendar
                        activeMonth={calendarMonth}
                        onMonthChange={(delta) => {
                          setCalendarMonth((previousMonth) => shiftMonth(previousMonth, delta));
                        }}
                        selectedDate={selectedDate}
                        emphasizeSelectableHover
                        onSelectDate={(dateValue) => {
                          const nextDateKey = toDateKey(dateValue);
                          const currentDateKey = selectedDate ? toDateKey(selectedDate) : "";

                          if (currentDateKey === nextDateKey) {
                            setSelectedDate(null);
                            return;
                          }

                          setSelectedDate(dateValue);
                        }}
                        highlightedDateKeys={markedDates}
                        isLoading={isCalendarLoading}
                        containerClassName={classNames("w-56 rounded-2xl p-2", HEAVY_MATTE_GLASS_CLASS)}
                      />
                    </div>
                  </>
                )}
              </div>

              <button
                type="button"
                onClick={() => {
                  setSelectedDate(null);
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
                  placeholder="Search received capsules"
                  className={classNames(
                    "h-11 w-full rounded-2xl pl-11 pr-4 text-sm text-white placeholder:text-white/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70",
                    HEAVY_MATTE_GLASS_CLASS
                  )}
                  aria-label="Search inbox capsules"
                />
              </label>

              <button
                type="button"
                onClick={() => {
                  navigate("/vault");
                }}
                className={classNames(ROUTE_SWITCH_BUTTON_CLASS, HEAVY_MATTE_GLASS_CLASS)}
              >
                <PenTool size={16} strokeWidth={2.2} />
                <span>Write Capsule</span>
              </button>
            </div>
          </div>
        </div>

        {selectedDate && (
          <div className={classNames("rounded-2xl px-5 py-3 text-sm text-white", HEAVY_MATTE_GLASS_CLASS)}>
            <p className="drop-shadow-md">Showing capsules for {toDateKey(selectedDate)}.</p>
          </div>
        )}

        <div className="relative z-10 space-y-5">
          {isInitialFeedLoading && (
            <div className={classNames("rounded-3xl px-6 py-7", HEAVY_MATTE_GLASS_CLASS)}>
              <GlassLoader compact message="Loading previous capsules..." />
            </div>
          )}

          {!isInitialFeedLoading && feedError && (
            <div className={classNames("rounded-3xl px-6 py-6 text-sm text-rose-100", HEAVY_MATTE_GLASS_CLASS)}>
              <p className="drop-shadow-md">{feedError}</p>
            </div>
          )}

          {!isInitialFeedLoading && !feedError && groupedFeed.length === 0 && (
            <div className={classNames("rounded-3xl px-6 py-8 text-center text-sm text-white drop-shadow-md", HEAVY_MATTE_GLASS_CLASS)}>
              {debouncedSearchQuery
                ? "No past capsules match your search."
                : "No older capsules yet. Past unlocked messages will appear here."}
            </div>
          )}

          {!isInitialFeedLoading && !feedError && groupedFeed.length > 0 && (
            <div className="space-y-6">
              {groupedFeed.map((group) => {
                return (
                  <section key={group.dateKey} className="space-y-3">
                    <header className="flex items-center gap-3">
                      <h2 className="text-xs font-semibold uppercase tracking-[0.24em] text-white/75 drop-shadow-md">
                        {group.label}
                      </h2>
                      <div className="h-px flex-1 bg-gradient-to-r from-white/35 to-transparent" />
                    </header>

                    <div className="space-y-3">
                      {group.messages.map((message) => {
                        const unlockDateKey = toDateKey(message?.unlock_date);
                        const senderLabel = partner?.name ? `From ${partner.name}` : "From your partner";
                        const messageKey = resolveMessageKey(message);
                        const isExpanded = expandedFeedMessageIds.has(messageKey);

                        return (
                          <article
                            key={message.__feedKey}
                            className={classNames("rounded-3xl px-5 py-5 sm:px-7 sm:py-6", HEAVY_MATTE_GLASS_CLASS)}
                          >
                            <img
                              src={partnerAvatarUrl}
                              alt="Avatar"
                              className="absolute top-6 right-6 h-10 w-10 rounded-full border border-white/30 bg-stone-800 object-cover shadow-md"
                              referrerPolicy="no-referrer"
                              onLoad={(event) => {
                                handlePartnerAvatarLoad(event, "history_card");
                              }}
                              onError={(event) => {
                                handlePartnerAvatarError(event, "history_card");
                              }}
                            />

                            <div className="pr-16">
                              <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-white/80 drop-shadow-md">
                                {senderLabel}
                              </p>
                              <p className={classNames(
                                "mt-2 whitespace-pre-wrap leading-relaxed text-white drop-shadow-md",
                                heroMessageTextSizeClass,
                                isExpanded ? "" : "line-clamp-4"
                              )}
                              >
                                {message.content}
                              </p>
                              <button
                                type="button"
                                onClick={() => {
                                  toggleFeedMessageExpanded(messageKey);
                                }}
                                className="mt-2 text-sm text-white/50 transition-colors hover:text-white"
                              >
                                {isExpanded ? "Show less" : "Read more"}
                              </button>
                              <p className="mt-4 text-[11px] uppercase tracking-[0.14em] text-white/75 drop-shadow-md">
                                Opened on {unlockDateKey || "Unknown date"}
                              </p>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  </section>
                );
              })}
            </div>
          )}

          {!isInitialFeedLoading && hasMore && <div ref={loadMoreSentinelRef} className="h-4 w-full" aria-hidden="true" />}

          {isFetchingNextPage && (
            <div className={classNames("relative h-24 overflow-hidden rounded-3xl", HEAVY_MATTE_GLASS_CLASS)}>
              <GlassLoader fullScreen={false} message="Loading older capsules..." />
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

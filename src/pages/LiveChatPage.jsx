import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createConsumer } from "@rails/actioncable";
import { ArrowDown, Check, CheckCheck, ChevronDown, Edit2, Reply, SendHorizontal, Trash2, X } from "lucide-react";
import { DashboardLayout } from "../components/layout/DashboardLayout";
import { useDynamicBackgroundControls } from "../components/layout/DynamicBackgroundLayout";
import { useAuth } from "../context/AuthContext";
import {
  deleteLiveMessage,
  getFriendlyApiError,
  getLiveMessages,
  markLiveMessagesRead,
  sendLiveMessage,
  updateLiveMessage
} from "../services/apiClient";
import { getAccessToken } from "../utils/authStorage";
import { logAvatarDebug, summarizeAvatarUrl } from "../utils/avatarDebug";

const SMOKED_GLASS_BAR_CLASS = "relative z-10 bg-black/40 border-white/10 shadow-2xl glass-internal-blur";

function TypingBubble() {
  return (
    <div className="flex justify-start">
      <div className="relative z-10 inline-flex items-end gap-1 rounded-2xl border border-white/10 bg-black/30 px-4 py-3 glass-internal-blur">
        <span className="chat-typing-dot h-1.5 w-1.5 rounded-full bg-white/80" />
        <span className="chat-typing-dot h-1.5 w-1.5 rounded-full bg-white/80" />
        <span className="chat-typing-dot h-1.5 w-1.5 rounded-full bg-white/80" />
      </div>
    </div>
  );
}

function classNames(...parts) {
  return parts.filter(Boolean).join(" ");
}

function toPositiveInteger(value) {
  const numericValue = Number(value);

  if (!Number.isInteger(numericValue) || numericValue <= 0) {
    return null;
  }

  return numericValue;
}

function formatLocalTime(utcDateString) {
  if (!utcDateString) {
    return "";
  }

  const parsed = new Date(utcDateString);

  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  const today = new Date();
  const isToday =
    parsed.getDate() === today.getDate() &&
    parsed.getMonth() === today.getMonth() &&
    parsed.getFullYear() === today.getFullYear();

  const timeString = parsed.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });

  if (isToday) {
    return `today at ${timeString}`;
  }

  return `${parsed.toLocaleDateString()} at ${timeString}`;
}

function formatLocalMessageTime(utcDateString) {
  if (!utcDateString) {
    return "--:--";
  }

  const parsed = new Date(utcDateString);

  if (Number.isNaN(parsed.getTime())) {
    return "--:--";
  }

  return parsed.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });
}

function normalizeLiveReplyPreview(candidate) {
  if (!candidate || typeof candidate !== "object") {
    return null;
  }

  const messageId = toPositiveInteger(candidate.id);

  if (!messageId) {
    return null;
  }

  return {
    id: messageId,
    sender_id: toPositiveInteger(candidate.sender_id),
    content: typeof candidate.content === "string" ? candidate.content : "",
    deleted_at: typeof candidate.deleted_at === "string" ? candidate.deleted_at : null
  };
}

function normalizeLiveMessage(candidate) {
  if (!candidate || typeof candidate !== "object") {
    return null;
  }

  const messageId = toPositiveInteger(candidate.id);
  const senderId = toPositiveInteger(candidate.sender_id);

  if (!messageId || !senderId) {
    return null;
  }

  const editCountRaw = Number(candidate.edit_count);
  const normalizedEditCount = Number.isFinite(editCountRaw) && editCountRaw >= 0
    ? Math.floor(editCountRaw)
    : 0;

  return {
    id: messageId,
    sender_id: senderId,
    couple_id: toPositiveInteger(candidate.couple_id),
    content: typeof candidate.content === "string" ? candidate.content : "",
    created_at: typeof candidate.created_at === "string" ? candidate.created_at : new Date().toISOString(),
    updated_at: typeof candidate.updated_at === "string" ? candidate.updated_at : candidate.created_at,
    deleted_at: typeof candidate.deleted_at === "string" ? candidate.deleted_at : null,
    edit_count: normalizedEditCount,
    reply_to_id: toPositiveInteger(candidate.reply_to_id),
    replied_to_message: normalizeLiveReplyPreview(candidate.replied_to_message)
  };
}

function normalizeLiveMessageList(payload) {
  const rawMessages =
    payload?.messages ??
    payload?.data?.messages ??
    payload?.data ??
    [];

  if (!Array.isArray(rawMessages)) {
    return [];
  }

  const uniqueMap = new Map();

  rawMessages.forEach((rawMessage) => {
    const normalizedMessage = normalizeLiveMessage(rawMessage);

    if (normalizedMessage) {
      uniqueMap.set(normalizedMessage.id, normalizedMessage);
    }
  });

  return [...uniqueMap.values()].sort((left, right) => left.id - right.id);
}

function mergeUniqueMessages(currentMessages, incomingMessages) {
  const mergedMap = new Map();

  currentMessages.forEach((message) => {
    mergedMap.set(message.id, message);
  });

  incomingMessages.forEach((message) => {
    mergedMap.set(message.id, message);
  });

  return [...mergedMap.values()].sort((left, right) => left.id - right.id);
}

function resolveHasOlderMessages(payload, fetchedCount) {
  const pagination = payload?.pagination ?? payload?.meta ?? null;

  if (typeof pagination?.has_next_page === "boolean") {
    return pagination.has_next_page;
  }

  if (typeof pagination?.has_more === "boolean") {
    return pagination.has_more;
  }

  if (typeof pagination?.next_before_id === "number") {
    return fetchedCount >= 50;
  }

  if (typeof payload?.has_more === "boolean") {
    return payload.has_more;
  }

  return fetchedCount >= 50;
}

function buildCoupleCableUrl(accessToken) {
  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000";
  const parsedUrl = new URL(apiBaseUrl);

  parsedUrl.protocol = parsedUrl.protocol === "https:" ? "wss:" : "ws:";
  parsedUrl.pathname = "/cable";
  parsedUrl.search = "";
  parsedUrl.searchParams.set("token", accessToken);

  return parsedUrl.toString();
}

function resolvePartnerState(payload) {
  const partnerState = payload?.partner_state ?? payload?.data?.partner_state ?? null;

  return {
    userId: toPositiveInteger(partnerState?.user_id),
    lastReadMessageId: toPositiveInteger(partnerState?.last_read_message_id) ?? 0,
    lastSeenAt: typeof partnerState?.last_seen_at === "string" ? partnerState.last_seen_at : null,
    isOnline: partnerState?.is_online === true
  };
}

function extractMessageFromSocketPayload(payload) {
  return normalizeLiveMessage(payload?.message ?? payload?.live_message ?? payload?.data ?? null);
}

function useAutosizedTextarea(textareaRef, value) {
  useLayoutEffect(() => {
    const textareaElement = textareaRef.current;

    if (!textareaElement) {
      return;
    }

    textareaElement.style.height = "auto";

    const computedStyle = window.getComputedStyle(textareaElement);
    const lineHeight = Number.parseFloat(computedStyle.lineHeight) || 24;
    const maxHeight = Math.max(lineHeight * 5, lineHeight);
    const nextHeight = Math.min(textareaElement.scrollHeight, maxHeight);

    textareaElement.style.height = `${nextHeight}px`;
    textareaElement.style.overflowY = textareaElement.scrollHeight > maxHeight ? "auto" : "hidden";
  }, [textareaRef, value]);
}

function LiveChatSurface() {
  const { user, partner } = useAuth();
  const { textSize, isSidebarOpen, clearNotificationCount, playNotificationSound } = useDynamicBackgroundControls();

  const [messages, setMessages] = useState([]);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isFetchingOlder, setIsFetchingOlder] = useState(false);
  const [hasOlderMessages, setHasOlderMessages] = useState(true);
  const [feedError, setFeedError] = useState(null);

  const [draft, setDraft] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [inputError, setInputError] = useState(null);

  const [isAtBottom, setIsAtBottom] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);
  const [sessionDividerId, setSessionDividerId] = useState(null);
  const [replyingToMessage, setReplyingToMessage] = useState(null);
  const [editingMessageId, setEditingMessageId] = useState(null);
  const [messageMutationId, setMessageMutationId] = useState(null);
  const [activeDropdownId, setActiveDropdownId] = useState(null);
  const [highlightedMessageId, setHighlightedMessageId] = useState(null);

  const [isPartnerOnline, setIsPartnerOnline] = useState(false);
  const [isPartnerTyping, setIsPartnerTyping] = useState(false);
  const [partnerLastSeenAt, setPartnerLastSeenAt] = useState(partner?.last_seen_at ?? null);
  const [partnerLastReadMessageId, setPartnerLastReadMessageId] = useState(
    toPositiveInteger(partner?.last_read_message_id) ?? 0
  );
  const [partnerUserId, setPartnerUserId] = useState(toPositiveInteger(partner?.id));

  const feedRef = useRef(null);
  const textareaRef = useRef(null);
  const messagesEndRef = useRef(null);

  const isFetchingOlderRef = useRef(false);
  const hasOlderMessagesRef = useRef(true);
  const isAtBottomRef = useRef(true);
  const messagesRef = useRef([]);

  const scrollRestoreRef = useRef(null);
  const pendingAutoScrollBehaviorRef = useRef(null);

  const cableSubscriptionRef = useRef(null);

  const typingStopTimeoutRef = useRef(null);
  const sentTypingStartRef = useRef(false);
  const highlightTimeoutRef = useRef(null);

  const readReceiptInFlightRef = useRef(false);
  const latestReadReceiptRef = useRef(toPositiveInteger(user?.last_read_message_id) ?? 0);
  const hasEntryReadSyncRef = useRef(false);

  const partnerAvatarFallbackUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(partner?.name || "User")}&background=random&color=fff`;
  const partnerAvatarUrl = partner?.avatar_url || partnerAvatarFallbackUrl;

  useEffect(() => {
    logAvatarDebug("live_chat_avatar_resolved", {
      page: "LiveChatPage",
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

    logAvatarDebug("live_chat_avatar_fallback_activated", {
      page: "LiveChatPage",
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

    logAvatarDebug("live_chat_avatar_loaded", {
      page: "LiveChatPage",
      role: "partner",
      partnerId: partner?.id ?? null,
      context,
      loadedAvatarSummary: summarizeAvatarUrl(loadedAvatarUrl),
      isFallback: loadedAvatarUrl === partnerAvatarFallbackUrl
    });
  }, [partner?.id, partnerAvatarFallbackUrl]);

  const messageTextSizeClass = textSize === "large"
    ? "text-lg"
    : textSize === "medium"
      ? "text-base"
      : "text-sm";

  const latestPartnerMessageId = useMemo(() => {
    const currentUserId = toPositiveInteger(user?.id);

    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index];

      if (!currentUserId || message.sender_id !== currentUserId) {
        return message.id;
      }
    }

    return 0;
  }, [messages, user?.id]);

  const messageById = useMemo(() => {
    const messageMap = new Map();

    messages.forEach((message) => {
      messageMap.set(message.id, message);
    });

    return messageMap;
  }, [messages]);

  const editingMessage = useMemo(() => {
    if (!editingMessageId) {
      return null;
    }

    return messageById.get(editingMessageId) ?? null;
  }, [editingMessageId, messageById]);

  const replyingPreviewMessage = useMemo(() => {
    if (!replyingToMessage) {
      return null;
    }

    return messageById.get(replyingToMessage.id) ?? replyingToMessage;
  }, [messageById, replyingToMessage]);

  const statusDisplay = useMemo(() => {
    if (isPartnerTyping) {
      return <span className="text-emerald-400 italic">typing...</span>;
    }

    if (isPartnerOnline) {
      return <span className="text-emerald-400">Online</span>;
    }

    if (partnerLastSeenAt) {
      const formattedLocalTime = formatLocalTime(partnerLastSeenAt);

      if (formattedLocalTime) {
        return <span className="text-white/70">Last seen {formattedLocalTime}</span>;
      }
    }

    return <span className="text-white/50">Offline</span>;
  }, [isPartnerOnline, isPartnerTyping, partnerLastSeenAt]);

  useAutosizedTextarea(textareaRef, draft);

  useEffect(() => {
    hasOlderMessagesRef.current = hasOlderMessages;
  }, [hasOlderMessages]);

  useEffect(() => {
    isAtBottomRef.current = isAtBottom;
  }, [isAtBottom]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    if (toPositiveInteger(partner?.id)) {
      setPartnerUserId(toPositiveInteger(partner.id));
    }
  }, [partner?.id]);

  useLayoutEffect(() => {
    const feedContainer = feedRef.current;

    if (!feedContainer) {
      return;
    }

    if (scrollRestoreRef.current) {
      const previousMetrics = scrollRestoreRef.current;
      feedContainer.scrollTop = feedContainer.scrollHeight - previousMetrics.scrollHeight + previousMetrics.scrollTop;
      scrollRestoreRef.current = null;
      return;
    }

    const pendingBehavior = pendingAutoScrollBehaviorRef.current;

    if (pendingBehavior) {
      messagesEndRef.current?.scrollIntoView({ block: "end", behavior: pendingBehavior });
      pendingAutoScrollBehaviorRef.current = null;
      setIsAtBottom(true);
      isAtBottomRef.current = true;
    }
  }, [messages]);

  const scrollToBottom = useCallback((behavior = "auto") => {
    messagesEndRef.current?.scrollIntoView({ block: "end", behavior });
    setIsAtBottom(true);
    isAtBottomRef.current = true;
    setUnreadCount(0);
  }, []);

  const scrollToMessage = useCallback((messageId) => {
    const normalizedMessageId = toPositiveInteger(messageId);

    if (!normalizedMessageId) {
      return;
    }

    const targetNode = document.getElementById(`message-${normalizedMessageId}`);

    targetNode?.scrollIntoView({ behavior: "smooth", block: "center" });
    setHighlightedMessageId(normalizedMessageId);

    if (highlightTimeoutRef.current !== null) {
      window.clearTimeout(highlightTimeoutRef.current);
    }

    highlightTimeoutRef.current = window.setTimeout(() => {
      setHighlightedMessageId((previousValue) => (previousValue === normalizedMessageId ? null : previousValue));
      highlightTimeoutRef.current = null;
    }, 2000);
  }, []);

  useEffect(() => {
    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;

    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;

      if (highlightTimeoutRef.current !== null) {
        window.clearTimeout(highlightTimeoutRef.current);
        highlightTimeoutRef.current = null;
      }
    };
  }, []);

  const resolveLatestPartnerMessageId = useCallback(() => {
    const currentUserId = toPositiveInteger(user?.id);
    const currentMessages = messagesRef.current;

    for (let index = currentMessages.length - 1; index >= 0; index -= 1) {
      const message = currentMessages[index];

      if (!currentUserId || message.sender_id !== currentUserId) {
        return message.id;
      }
    }

    return 0;
  }, [user?.id]);

  const markMessagesAsRead = useCallback(async (upToMessageId) => {
    const normalizedMessageId = toPositiveInteger(upToMessageId) ?? 0;

    if (!normalizedMessageId) {
      return;
    }

    if (readReceiptInFlightRef.current) {
      return;
    }

    if (normalizedMessageId <= latestReadReceiptRef.current) {
      return;
    }

    const accessToken = getAccessToken();

    if (!accessToken) {
      return;
    }

    readReceiptInFlightRef.current = true;

    try {
      const payload = await markLiveMessagesRead(accessToken, { messageId: normalizedMessageId });
      const confirmedMessageId =
        toPositiveInteger(payload?.last_read_message_id) ??
        toPositiveInteger(payload?.last_read_id) ??
        normalizedMessageId;

      latestReadReceiptRef.current = Math.max(latestReadReceiptRef.current, confirmedMessageId);
    } catch {
      // Read receipts are best-effort and should not interrupt chat flow.
    } finally {
      readReceiptInFlightRef.current = false;
    }
  }, []);

  const loadInitialMessages = useCallback(async () => {
    const accessToken = getAccessToken();

    if (!accessToken) {
      setFeedError("Your session expired. Please sign in again.");
      setIsInitialLoading(false);
      return;
    }

    setIsInitialLoading(true);
    setFeedError(null);

    try {
      const payload = await getLiveMessages(accessToken);
      const initialMessages = normalizeLiveMessageList(payload);
      const initialPartnerState = resolvePartnerState(payload);

      pendingAutoScrollBehaviorRef.current = "auto";
      setMessages(initialMessages);
      setHasOlderMessages(resolveHasOlderMessages(payload, initialMessages.length));

      if (initialPartnerState.userId) {
        setPartnerUserId(initialPartnerState.userId);
      }

      setPartnerLastReadMessageId(initialPartnerState.lastReadMessageId);
      setPartnerLastSeenAt(initialPartnerState.lastSeenAt ?? partner?.last_seen_at ?? null);
      setIsPartnerOnline(initialPartnerState.isOnline);
      setUnreadCount(0);
    } catch (error) {
      setFeedError(getFriendlyApiError(error, "Could not load live messages."));
      setMessages([]);
      setHasOlderMessages(false);
    } finally {
      setIsInitialLoading(false);
    }
  }, [partner?.last_seen_at]);

  useEffect(() => {
    void loadInitialMessages();
  }, [loadInitialMessages]);

  const fetchOlderMessages = useCallback(async () => {
    if (isInitialLoading || isFetchingOlderRef.current || !hasOlderMessagesRef.current) {
      return;
    }

    const oldestMessageId = toPositiveInteger(messagesRef.current[0]?.id);

    if (!oldestMessageId) {
      setHasOlderMessages(false);
      return;
    }

    const accessToken = getAccessToken();

    if (!accessToken) {
      return;
    }

    const feedContainer = feedRef.current;

    if (feedContainer) {
      scrollRestoreRef.current = {
        scrollHeight: feedContainer.scrollHeight,
        scrollTop: feedContainer.scrollTop
      };
    }

    isFetchingOlderRef.current = true;
    setIsFetchingOlder(true);

    try {
      const payload = await getLiveMessages(accessToken, { beforeId: oldestMessageId });
      const olderMessages = normalizeLiveMessageList(payload);

      if (olderMessages.length === 0) {
        setHasOlderMessages(false);
      } else {
        setMessages((previousMessages) => mergeUniqueMessages(previousMessages, olderMessages));
        setHasOlderMessages(resolveHasOlderMessages(payload, olderMessages.length));
      }
    } catch {
      scrollRestoreRef.current = null;
    } finally {
      isFetchingOlderRef.current = false;
      setIsFetchingOlder(false);
    }
  }, [isInitialLoading]);

  const handleScrollFeed = useCallback(() => {
    const feedContainer = feedRef.current;

    if (!feedContainer) {
      return;
    }

    const bottom = feedContainer.scrollHeight - feedContainer.scrollTop - feedContainer.clientHeight < 50;

    setIsAtBottom(bottom);
    isAtBottomRef.current = bottom;

    if (bottom && document.hasFocus()) {
      setUnreadCount(0);
      setSessionDividerId(null);
      clearNotificationCount("live");

      const latestPartnerId = resolveLatestPartnerMessageId();

      if (latestPartnerId > 0) {
        void markMessagesAsRead(latestPartnerId);
      }
    }

    if (feedContainer.scrollTop <= 20) {
      void fetchOlderMessages();
    }
  }, [clearNotificationCount, fetchOlderMessages, markMessagesAsRead, resolveLatestPartnerMessageId]);

  useEffect(() => {
    clearNotificationCount("live");
  }, [clearNotificationCount]);

  const performTypingState = useCallback((isTyping) => {
    const subscription = cableSubscriptionRef.current;

    if (!subscription) {
      return;
    }

    try {
      subscription.perform("typing", { is_typing: isTyping });
    } catch {
      // Ignore transient socket issues for typing updates.
    }
  }, []);

  const stopTypingSignal = useCallback(() => {
    if (typingStopTimeoutRef.current !== null) {
      window.clearTimeout(typingStopTimeoutRef.current);
      typingStopTimeoutRef.current = null;
    }

    if (sentTypingStartRef.current) {
      performTypingState(false);
      sentTypingStartRef.current = false;
    }
  }, [performTypingState]);

  const cancelComposerAction = useCallback(() => {
    setReplyingToMessage(null);
    setEditingMessageId(null);
    setDraft("");
    setInputError(null);
  }, []);

  const cancelReplyAction = useCallback(() => {
    setReplyingToMessage(null);
  }, []);

  const handleStartReply = useCallback((message) => {
    if (!message || message.deleted_at) {
      return;
    }

    setActiveDropdownId(null);
    setEditingMessageId(null);
    setReplyingToMessage(message);
    setInputError(null);
    textareaRef.current?.focus();
  }, []);

  const handleStartEdit = useCallback((message) => {
    if (!message || message.deleted_at) {
      return;
    }

    setActiveDropdownId(null);
    setReplyingToMessage(null);
    setEditingMessageId(message.id);
    setDraft(message.content ?? "");
    setInputError(null);

    window.requestAnimationFrame(() => {
      if (!textareaRef.current) {
        return;
      }

      textareaRef.current.focus();
      const nextLength = textareaRef.current.value.length;
      textareaRef.current.setSelectionRange(nextLength, nextLength);
    });
  }, []);

  const handleDeleteMessage = useCallback(async (message) => {
    if (!message || message.deleted_at || messageMutationId) {
      return;
    }

    const accessToken = getAccessToken();

    if (!accessToken) {
      setInputError("Your session expired. Please sign in again.");
      return;
    }

    setMessageMutationId(message.id);
    setActiveDropdownId(null);
    setInputError(null);

    try {
      const payload = await deleteLiveMessage(accessToken, message.id);
      const deletedMessage = normalizeLiveMessage(payload?.data ?? payload?.message ?? payload?.live_message ?? payload);

      setMessages((previousMessages) => {
        return previousMessages.map((existingMessage) => {
          if (existingMessage.id !== message.id) {
            return existingMessage;
          }

          if (deletedMessage && deletedMessage.id === message.id) {
            return {
              ...existingMessage,
              ...deletedMessage,
              deleted_at: deletedMessage.deleted_at ?? existingMessage.deleted_at ?? new Date().toISOString()
            };
          }

          return {
            ...existingMessage,
            deleted_at: existingMessage.deleted_at ?? new Date().toISOString()
          };
        });
      });

      if (editingMessageId === message.id) {
        setEditingMessageId(null);
        setDraft("");
      }

      if (replyingToMessage?.id === message.id) {
        setReplyingToMessage(null);
      }
    } catch (error) {
      setInputError(getFriendlyApiError(error, "Could not delete the message."));
    } finally {
      setMessageMutationId(null);
    }
  }, [editingMessageId, messageMutationId, replyingToMessage?.id]);

  const handleDraftChange = useCallback((event) => {
    const nextValue = event.target.value;
    setDraft(nextValue);

    if (!sentTypingStartRef.current && nextValue.trim().length > 0) {
      performTypingState(true);
      sentTypingStartRef.current = true;
    }

    if (typingStopTimeoutRef.current !== null) {
      window.clearTimeout(typingStopTimeoutRef.current);
    }

    typingStopTimeoutRef.current = window.setTimeout(() => {
      performTypingState(false);
      sentTypingStartRef.current = false;
      typingStopTimeoutRef.current = null;
    }, 1500);
  }, [performTypingState]);

  const appendIncomingMessage = useCallback((incomingMessage, options = {}) => {
    let isInserted = false;

    setMessages((previousMessages) => {
      const alreadyExists = previousMessages.some((message) => message.id === incomingMessage.id);

      if (alreadyExists) {
        return previousMessages;
      }

      isInserted = true;
      return [...previousMessages, incomingMessage].sort((left, right) => left.id - right.id);
    });

    if (!isInserted) {
      return;
    }

    if (options.shouldScrollToBottom) {
      pendingAutoScrollBehaviorRef.current = options.scrollBehavior ?? "auto";
    }
  }, []);

  useEffect(() => {
    const accessToken = getAccessToken();

    if (!accessToken) {
      return undefined;
    }

    let consumer;
    let subscription;

    try {
      consumer = createConsumer(buildCoupleCableUrl(accessToken));
      subscription = consumer.subscriptions.create(
        {
          channel: "CoupleChannel"
        },
        {
          received(payload) {
            const eventName = typeof payload?.event === "string" ? payload.event : "";
            const incomingUserId = toPositiveInteger(payload?.user_id);

            if (incomingUserId && partnerUserId && incomingUserId !== partnerUserId) {
              return;
            }

            if (incomingUserId && !partnerUserId) {
              setPartnerUserId(incomingUserId);
            }

            if (eventName === "new_message" || eventName === "message_created") {
              const incomingMessage = extractMessageFromSocketPayload(payload);

              if (!incomingMessage) {
                return;
              }

              const currentUserId = toPositiveInteger(user?.id);
              const isPartnerMessage = currentUserId
                ? incomingMessage.sender_id !== currentUserId
                : true;
              const isNewMessage = !messagesRef.current.some((message) => message.id === incomingMessage.id);

              if (isPartnerMessage) {
                const isUnread = !isAtBottomRef.current || !document.hasFocus();

                if (isAtBottomRef.current) {
                  appendIncomingMessage(incomingMessage, {
                    shouldScrollToBottom: true,
                    scrollBehavior: "auto"
                  });

                  messagesEndRef.current?.scrollIntoView({ block: "end", behavior: "auto" });
                  window.requestAnimationFrame(() => {
                    messagesEndRef.current?.scrollIntoView({ block: "end", behavior: "auto" });
                  });
                } else {
                  appendIncomingMessage(incomingMessage, {
                    shouldScrollToBottom: false
                  });
                }

                if (isNewMessage && isUnread) {
                  setUnreadCount((previousCount) => previousCount + 1);
                  setSessionDividerId((previousId) => (previousId === null ? incomingMessage.id : previousId));
                }

                if (isNewMessage && !isUnread) {
                  setUnreadCount(0);
                  setSessionDividerId(null);
                  clearNotificationCount("live");
                  void markMessagesAsRead(incomingMessage.id);
                }

                setIsPartnerTyping(false);
                setIsPartnerOnline(true);
                return;
              }

              appendIncomingMessage(incomingMessage, {
                shouldScrollToBottom: true,
                scrollBehavior: "auto"
              });
              return;
            }

            if (eventName === "message_updated") {
              const updatedMessage = extractMessageFromSocketPayload(payload);

              if (!updatedMessage) {
                return;
              }

              setMessages((previousMessages) => {
                return previousMessages.map((existingMessage) => {
                  if (existingMessage.id !== updatedMessage.id) {
                    return existingMessage;
                  }

                  return {
                    ...existingMessage,
                    ...updatedMessage
                  };
                });
              });

              if (editingMessageId === updatedMessage.id) {
                setDraft(updatedMessage.content ?? "");
              }

              return;
            }

            if (eventName === "message_deleted") {
              const deletedMessage = extractMessageFromSocketPayload(payload);
              const deletedMessageId =
                deletedMessage?.id ??
                toPositiveInteger(payload?.message_id) ??
                toPositiveInteger(payload?.id);

              if (!deletedMessageId) {
                return;
              }

              setMessages((previousMessages) => {
                return previousMessages.map((existingMessage) => {
                  if (existingMessage.id !== deletedMessageId) {
                    return existingMessage;
                  }

                  return {
                    ...existingMessage,
                    ...(deletedMessage ?? {}),
                    deleted_at: deletedMessage?.deleted_at ?? existingMessage.deleted_at ?? new Date().toISOString()
                  };
                });
              });

              if (editingMessageId === deletedMessageId) {
                setEditingMessageId(null);
                setDraft("");
              }

              if (replyingToMessage?.id === deletedMessageId) {
                setReplyingToMessage(null);
              }

              return;
            }

            if (eventName === "typing" || eventName === "typing_start" || eventName === "typing_stop") {
              if (eventName === "typing_start") {
                setIsPartnerTyping(true);
                setIsPartnerOnline(true);
                return;
              }

              if (eventName === "typing_stop") {
                setIsPartnerTyping(false);
                return;
              }

              const nextIsTyping = Boolean(payload?.is_typing);
              setIsPartnerTyping(nextIsTyping);

              if (nextIsTyping) {
                setIsPartnerOnline(true);
              }

              return;
            }

            if (eventName === "presence" || eventName === "presence_update") {
              const status = typeof payload?.status === "string" ? payload.status.toLowerCase() : "";
              const isOnline = status === "online" || Boolean(payload?.online);

              setIsPartnerOnline(isOnline);

              if (!isOnline) {
                if (typeof payload?.last_seen_at === "string") {
                  setPartnerLastSeenAt(payload.last_seen_at);
                } else {
                  setPartnerLastSeenAt(new Date().toISOString());
                }
                setIsPartnerTyping(false);
              }

              return;
            }

            if (eventName === "read_receipt") {
              const readMessageId =
                toPositiveInteger(payload?.last_read_id) ??
                toPositiveInteger(payload?.last_read_message_id) ??
                toPositiveInteger(payload?.message_id) ??
                0;

              if (readMessageId > 0) {
                setPartnerLastReadMessageId((previousValue) => Math.max(previousValue, readMessageId));
              }
            }
          }
        }
      );

      cableSubscriptionRef.current = subscription;
    } catch {
      return undefined;
    }

    return () => {
      stopTypingSignal();

      if (subscription && consumer) {
        consumer.subscriptions.remove(subscription);
      }

      cableSubscriptionRef.current = null;
      consumer?.disconnect();
    };
  }, [
    appendIncomingMessage,
    clearNotificationCount,
    editingMessageId,
    markMessagesAsRead,
    partnerUserId,
    replyingToMessage?.id,
    stopTypingSignal,
    user?.id
  ]);

  useEffect(() => {
    const handleFocus = () => {
      if (!isAtBottomRef.current) {
        return;
      }

      setUnreadCount(0);
      setSessionDividerId(null);

      const latestPartnerId = resolveLatestPartnerMessageId();

      if (latestPartnerId > 0) {
        void markMessagesAsRead(latestPartnerId);
      }

      clearNotificationCount("live");
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        handleFocus();
      }
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [clearNotificationCount, markMessagesAsRead, resolveLatestPartnerMessageId]);

  useEffect(() => {
    if (!isAtBottom || !document.hasFocus()) {
      return;
    }

    setUnreadCount(0);
    setSessionDividerId(null);
  }, [isAtBottom]);

  useEffect(() => {
    if (!isPartnerTyping || !isAtBottomRef.current) {
      return;
    }

    window.requestAnimationFrame(() => {
      messagesEndRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
    });
  }, [isPartnerTyping]);

  useEffect(() => {
    if (isInitialLoading || hasEntryReadSyncRef.current) {
      return;
    }

    hasEntryReadSyncRef.current = true;

    if (latestPartnerMessageId > 0) {
      void markMessagesAsRead(latestPartnerMessageId);
    }

    clearNotificationCount("live");
  }, [clearNotificationCount, isInitialLoading, latestPartnerMessageId, markMessagesAsRead]);

  const handleSendMessage = useCallback(async () => {
    const trimmedDraft = draft.trim();

    if (!trimmedDraft || isSending) {
      return;
    }

    const accessToken = getAccessToken();

    if (!accessToken) {
      setInputError("Your session expired. Please sign in again.");
      return;
    }

    setIsSending(true);
    setInputError(null);

    try {
      if (editingMessageId) {
        const payload = await updateLiveMessage(accessToken, editingMessageId, {
          content: trimmedDraft
        });
        const updatedMessage = normalizeLiveMessage(payload?.data ?? payload?.message ?? payload?.live_message ?? payload);

        if (updatedMessage) {
          setMessages((previousMessages) => {
            return previousMessages.map((existingMessage) => {
              if (existingMessage.id !== editingMessageId) {
                return existingMessage;
              }

              return {
                ...existingMessage,
                ...updatedMessage
              };
            });
          });
        }

        setEditingMessageId(null);
        setDraft("");
        stopTypingSignal();
        return;
      }

      playNotificationSound("send-live");

      const payload = await sendLiveMessage(accessToken, {
        content: trimmedDraft,
        replyToId: replyingToMessage?.id
      });
      const createdMessage = normalizeLiveMessage(payload?.data ?? payload?.message ?? payload);

      if (createdMessage) {
        appendIncomingMessage(createdMessage, {
          shouldScrollToBottom: true,
          scrollBehavior: "auto"
        });
      }

      messagesEndRef.current?.scrollIntoView({ behavior: "auto" });

      setReplyingToMessage(null);
      setDraft("");
      stopTypingSignal();
    } catch (error) {
      setInputError(getFriendlyApiError(error, editingMessageId ? "Could not edit the message." : "Could not send the message."));
    } finally {
      setIsSending(false);
    }
  }, [appendIncomingMessage, draft, editingMessageId, isSending, playNotificationSound, replyingToMessage?.id, stopTypingSignal]);

  const handleTextareaKeyDown = useCallback((event) => {
    if (event.key !== "Enter") {
      return;
    }

    if (event.shiftKey) {
      return;
    }

    event.preventDefault();
    void handleSendMessage();
  }, [handleSendMessage]);

  const liveChatSurfaceInsetClass = isSidebarOpen ? "left-64" : "left-20";

  return (
    <section
      className={classNames(
        "fixed top-0 right-0 bottom-0 z-40 flex h-[100dvh] flex-col",
        "transition-[left] duration-300 ease-in-out",
        liveChatSurfaceInsetClass
      )}
    >
      {activeDropdownId && (
        <div
          className="fixed inset-0 z-40"
          onClick={(event) => {
            event.stopPropagation();
            setActiveDropdownId(null);
          }}
        />
      )}

      <div className="relative flex h-full min-h-0 flex-col bg-transparent">
        <header className={classNames("shrink-0 border-b px-5 py-4 sm:px-6", SMOKED_GLASS_BAR_CLASS)}>
          <div className="flex items-center gap-3">
            <img
              src={partnerAvatarUrl}
              alt="Avatar"
              className="h-11 w-11 rounded-full border border-white/30 bg-stone-800 object-cover shadow-md"
              referrerPolicy="no-referrer"
              onLoad={(event) => {
                handlePartnerAvatarLoad(event, "chat_header");
              }}
              onError={(event) => {
                handlePartnerAvatarError(event, "chat_header");
              }}
            />

            <div className="min-w-0">
              <p className="truncate text-sm font-semibold uppercase tracking-[0.12em] text-white">
                {partner?.name || "Partner"}
              </p>
              <p className="mt-0.5 truncate text-xs font-medium">
                {statusDisplay}
              </p>
            </div>
          </div>
        </header>

        <div
          ref={feedRef}
          onScroll={handleScrollFeed}
          className="chat-scrollbar min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6"
        >
          {isFetchingOlder && (
            <div className="mb-4 flex justify-center">
              <div className="rounded-full border border-white/15 bg-black/30 px-3 py-1 text-[11px] uppercase tracking-[0.14em] text-white/75">
                Loading older messages...
              </div>
            </div>
          )}

          {isInitialLoading && (
            <div className="flex h-full items-center justify-center">
              <p className="rounded-2xl border border-white/15 bg-black/30 px-4 py-2 text-sm text-white/85">
                Loading conversation...
              </p>
            </div>
          )}

          {!isInitialLoading && feedError && (
            <div className="mx-auto max-w-xl rounded-2xl border border-rose-200/30 bg-rose-500/20 px-4 py-3 text-sm text-rose-100">
              {feedError}
            </div>
          )}

          {!isInitialLoading && !feedError && (
            <div className="space-y-3 pb-2">
              {messages.map((message, index) => {
                const currentUserId = toPositiveInteger(user?.id);
                const isOwnMessage = currentUserId ? message.sender_id === currentUserId : false;
                const isLastMessage = index === messages.length - 1;
                const isReadByPartner = isOwnMessage && message.id <= partnerLastReadMessageId;
                const isDeletedMessage = Boolean(message.deleted_at);
                const hasBeenEdited = Number(message.edit_count) > 0;
                const isDeletingThisMessage = messageMutationId === message.id;
                const replyPreviewMessage = message.replied_to_message ?? (message.reply_to_id ? messageById.get(message.reply_to_id) : null);
                const hasReplyPreview = Boolean(message.reply_to_id || message.replied_to_message);
                const replyPreviewSenderId = toPositiveInteger(replyPreviewMessage?.sender_id);
                const replyPreviewAuthor = replyPreviewSenderId && currentUserId && replyPreviewSenderId === currentUserId
                  ? "You"
                  : (partner?.name || "Partner");
                const replyPreviewIsDeleted = Boolean(replyPreviewMessage?.deleted_at);
                const replyPreviewContent = replyPreviewIsDeleted
                  ? "deleted message"
                  : (typeof replyPreviewMessage?.content === "string" && replyPreviewMessage.content.trim().length > 0
                    ? replyPreviewMessage.content
                    : "message");
                const isDropdownOpen = activeDropdownId === message.id;
                const isHighlightedMessage = highlightedMessageId === message.id;

                return (
                  <div key={message.id} id={`message-${message.id}`}>
                    {message.id === sessionDividerId && (
                      <div className="w-full flex items-center justify-center my-6">
                        <span className="bg-emerald-900/80 text-emerald-300 text-xs px-3 py-1 rounded-full border border-emerald-500/30">
                          {unreadCount > 0 ? `${unreadCount} UNREAD MESSAGES` : "UNREAD MESSAGES"}
                        </span>
                      </div>
                    )}

                    <article className={classNames("group flex w-full", isOwnMessage ? "justify-end" : "justify-start")}>
                      <div
                        className={classNames(
                          "relative max-w-[85%] rounded-2xl border px-4 py-3 shadow-xl glass-internal-blur sm:max-w-[72%]",
                          isDropdownOpen ? "z-50" : "z-10",
                          isHighlightedMessage ? "ring-2 ring-emerald-300/65" : "",
                          isOwnMessage
                            ? "border-emerald-200/25 bg-emerald-600/80 text-white"
                            : "border-white/10 bg-black/30 text-white"
                        )}
                      >
                        {hasReplyPreview && (
                          <button
                            type="button"
                            onClick={() => {
                              scrollToMessage(replyPreviewMessage?.id);
                            }}
                            className="mb-2 w-full rounded-xl border border-white/20 bg-black/25 px-3 py-2 text-left transition hover:bg-black/35"
                          >
                            <p className="text-[10px] uppercase tracking-[0.12em] text-white/65">{replyPreviewAuthor}</p>
                            <p className={classNames("mt-1 line-clamp-2 text-xs", replyPreviewIsDeleted ? "italic text-white/55" : "text-white/80")}>
                              {replyPreviewContent}
                            </p>
                          </button>
                        )}

                        <p
                          className={classNames(
                            "whitespace-pre-wrap break-words leading-relaxed",
                            messageTextSizeClass,
                            isDeletedMessage ? "italic text-white/55" : ""
                          )}
                        >
                          {isDeletedMessage ? "deleted message" : message.content}
                        </p>

                        <div
                          className={classNames(
                            "mt-2 flex items-center gap-1 text-[11px]",
                            isOwnMessage ? "justify-end text-emerald-100/80" : "justify-start text-white/60"
                          )}
                        >
                          <span>{formatLocalMessageTime(message.created_at)}</span>
                          {hasBeenEdited && <span className="ml-1 text-[10px] lowercase text-white/55">edited</span>}

                          {isOwnMessage && (
                            <span className="ml-1 inline-flex items-center" aria-label={isReadByPartner ? "Read" : "Sent"}>
                              {isReadByPartner ? <CheckCheck size={12} strokeWidth={2.4} /> : <Check size={12} strokeWidth={2.4} />}
                            </span>
                          )}
                        </div>

                        {!isDeletedMessage && (
                          <div className="absolute top-1 right-1" data-livechat-dropdown="true">
                            <div className="relative" data-livechat-dropdown="true">
                              <button
                                type="button"
                                onMouseDown={(event) => {
                                  event.stopPropagation();
                                }}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setActiveDropdownId((previousValue) => (previousValue === message.id ? null : message.id));
                                }}
                                className={classNames(
                                  "inline-flex h-6 w-6 items-center justify-center rounded-full border border-white/15 bg-black/45 text-white/80 transition-opacity duration-200 hover:bg-white/15 hover:text-white z-10",
                                  isDropdownOpen ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                                )}
                                aria-label="Open message actions"
                                data-livechat-dropdown="true"
                              >
                                <ChevronDown size={12} strokeWidth={2.4} />
                              </button>

                              {isDropdownOpen && (
                                <div
                                  onMouseDown={(event) => {
                                    event.stopPropagation();
                                  }}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                  }}
                                  className={classNames(
                                    "absolute z-50 w-36 rounded-lg border border-white/10 bg-stone-900/90 shadow-2xl animate-in fade-in zoom-in-95 duration-200",
                                    isLastMessage ? "bottom-full mb-1" : "top-full mt-1",
                                    isOwnMessage
                                      ? (isLastMessage ? "right-0 origin-bottom-right" : "right-0 origin-top-right")
                                      : (isLastMessage ? "left-0 origin-bottom-left" : "left-0 origin-top-left")
                                  )}
                                  data-livechat-dropdown="true"
                                >
                                <button
                                  type="button"
                                  onClick={() => {
                                    handleStartReply(message);
                                  }}
                                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-white/90 transition hover:bg-white/10"
                                >
                                  <Reply size={12} strokeWidth={2.3} />
                                  <span>Reply</span>
                                </button>

                                {isOwnMessage && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      handleStartEdit(message);
                                    }}
                                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-white/90 transition hover:bg-white/10"
                                  >
                                    <Edit2 size={12} strokeWidth={2.3} />
                                    <span>Edit</span>
                                  </button>
                                )}

                                {isOwnMessage && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      void handleDeleteMessage(message);
                                    }}
                                    disabled={isDeletingThisMessage}
                                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-white/90 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
                                  >
                                    <Trash2 size={12} strokeWidth={2.3} />
                                    <span>Delete</span>
                                  </button>
                                )}
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </article>
                  </div>
                );
              })}
            </div>
          )}

          {isPartnerTyping && <TypingBubble />}

          <div ref={messagesEndRef} className="shrink-0" aria-hidden="true" />
        </div>

        {!isAtBottom && (
          <button
            type="button"
            onClick={() => {
              scrollToBottom("smooth");
            }}
            className="absolute bottom-24 right-6 z-50 inline-flex h-11 w-11 items-center justify-center rounded-full border border-emerald-300/45 bg-emerald-500/80 text-white shadow-xl transition hover:bg-emerald-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200/70"
            aria-label="Scroll to latest messages"
          >
            <ArrowDown size={17} strokeWidth={2.4} />

            {unreadCount > 0 && (
              <span className="absolute -right-1 -top-1 inline-flex min-h-5 min-w-5 items-center justify-center rounded-full border border-emerald-200/60 bg-emerald-400 px-1 text-[10px] font-semibold text-emerald-950">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </button>
        )}

        <footer className={classNames("shrink-0 border-t px-4 py-3 sm:px-6 sm:py-4", SMOKED_GLASS_BAR_CLASS)}>
          {replyingPreviewMessage && (
            <button
              type="button"
              onClick={() => {
                scrollToMessage(replyingPreviewMessage.id);
              }}
              className="mb-2 flex w-full items-center justify-between gap-3 rounded-2xl border border-white/15 bg-black/30 px-3 py-2 text-left"
            >
              <div className="min-w-0 border-l-4 border-emerald-500 pl-3">
                <p className="truncate text-xs font-semibold text-white/85">
                  Replying to {replyingPreviewMessage.sender_id === toPositiveInteger(user?.id) ? "You" : (partner?.name || "Partner")}
                </p>
                <p className={classNames("truncate text-xs", replyingPreviewMessage.deleted_at ? "italic text-white/55" : "text-white/70")}>
                  {replyingPreviewMessage.deleted_at ? "deleted message" : (replyingPreviewMessage.content || "message")}
                </p>
              </div>

              <span
                role="button"
                tabIndex={0}
                onClick={(event) => {
                  event.stopPropagation();
                  cancelReplyAction();
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    event.stopPropagation();
                    cancelReplyAction();
                  }
                }}
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white/80 transition hover:bg-white/20"
                aria-label="Cancel reply"
              >
                <X size={13} strokeWidth={2.4} />
              </span>
            </button>
          )}

          {editingMessage && !replyingPreviewMessage && (
            <div className="mb-2 flex items-center justify-between gap-3 rounded-2xl border border-white/15 bg-black/30 px-3 py-2">
              <p className="truncate text-xs font-medium text-white/80">Editing message...</p>

              <button
                type="button"
                onClick={cancelComposerAction}
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white/80 transition hover:bg-white/20"
                aria-label="Cancel editing"
              >
                <X size={13} strokeWidth={2.4} />
              </button>
            </div>
          )}

          <div className="flex items-end gap-3">
            <textarea
              ref={textareaRef}
              value={draft}
              onChange={handleDraftChange}
              onKeyDown={handleTextareaKeyDown}
              placeholder="Type a message..."
              rows={1}
              className="chat-scrollbar min-h-[44px] w-full resize-none rounded-2xl border border-white/20 bg-black/30 px-4 py-3 text-sm text-white placeholder:text-white/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/70"
            />

            <button
              type="button"
              onClick={() => {
                void handleSendMessage();
              }}
              disabled={isSending || draft.trim().length === 0}
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-emerald-300/45 bg-emerald-500/70 text-white shadow-lg transition hover:bg-emerald-500/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200/70 disabled:cursor-not-allowed disabled:opacity-55"
              aria-label="Send message"
            >
              <SendHorizontal size={17} strokeWidth={2.2} />
            </button>
          </div>

          {inputError && <p className="mt-2 text-xs text-rose-200">{inputError}</p>}
        </footer>
      </div>
    </section>
  );
}

export function LiveChatPage() {
  return (
    <DashboardLayout isFullscreenApp>
      <LiveChatSurface />
    </DashboardLayout>
  );
}

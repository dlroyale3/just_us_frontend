import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createConsumer } from "@rails/actioncable";
import { Outlet } from "react-router-dom";
import { SpringLandingShell } from "../landing/SpringLandingShell";
import { BackgroundFireworks } from "../relax/BackgroundFireworks";
import { useAuth } from "../../context/AuthContext";
import { useSettings } from "../../context/SettingsContext";
import { getNotifications } from "../../services/apiClient";
import { getAccessToken } from "../../utils/authStorage";

const DynamicBackgroundControlsContext = createContext(null);

const seasons = ["spring", "summer", "autumn", "winter"];
const weatherModes = ["clear", "rainy", "stormy"];
const timesOfDay = ["morning", "noon", "evening", "night"];
const AUTO_PLAY_SLIDER_MIN = 0;
const AUTO_PLAY_SLIDER_MAX = 100;
const AUTO_PLAY_SPEED_SLOW_MS = 180000;
const AUTO_PLAY_SPEED_FAST_MS = 5000;
const AMBIENT_VOLUME_SLIDER_DEFAULT = 50;
const AMBIENT_FADE_DURATION_MS = 1000;
const NOTIFICATION_VOLUME_CURVE_POWER = 1.7;
const FIREWORKS_INTENSITY_MIN = 1;
const FIREWORKS_INTENSITY_MAX = 100;
const RECEIVE_LIVE_SOUND_URL = "/sounds/receive-live.mp3";
const SEND_LIVE_SOUND_URL = "/sounds/send-live.mp3";
const SCHEDULED_MESSAGE_SOUND_URL = "/sounds/scheduled-message.mp3";

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function sliderValueToNotificationGain(sliderValue) {
  const safeSliderValue = clamp(Number(sliderValue), 0, 100);
  const normalizedValue = safeSliderValue / 100;

  return Math.pow(normalizedValue, NOTIFICATION_VOLUME_CURVE_POWER);
}

function playNotificationSoundByType(type, notificationVolume) {
  const audioFiles = {
    "receive-live": RECEIVE_LIVE_SOUND_URL,
    "send-live": SEND_LIVE_SOUND_URL,
    scheduled: SCHEDULED_MESSAGE_SOUND_URL
  };
  const sourceUrl = audioFiles[type];

  if (!sourceUrl) {
    return;
  }

  const audioTrack = new Audio(sourceUrl);
  audioTrack.volume = sliderValueToNotificationGain(notificationVolume);

  const playPromise = audioTrack.play();

  if (playPromise && typeof playPromise.catch === "function") {
    playPromise.catch(() => {});
  }
}

function sliderValueToIntervalMs(sliderValue) {
  const normalized =
    (clamp(Number(sliderValue), AUTO_PLAY_SLIDER_MIN, AUTO_PLAY_SLIDER_MAX) - AUTO_PLAY_SLIDER_MIN) /
    (AUTO_PLAY_SLIDER_MAX - AUTO_PLAY_SLIDER_MIN);
  const intervalSpan = AUTO_PLAY_SPEED_SLOW_MS - AUTO_PLAY_SPEED_FAST_MS;

  return Math.round(AUTO_PLAY_SPEED_SLOW_MS - normalized * intervalSpan);
}

function getAudioTrack(currentSeason, currentWeather, currentTimeOfDay) {
  if (currentSeason === "winter") {
    if (currentWeather === "clear") {
      return "/sounds/clear_snow_day_night.mp3";
    }

    if (currentWeather === "rainy") {
      return "/sounds/medium_snow_day_night.mp3";
    }

    if (currentWeather === "stormy") {
      return "/sounds/heavy_snow_day_night.mp3";
    }
  }

  if (currentWeather === "clear" && currentTimeOfDay === "night") {
    return "/sounds/clear_night.mp3";
  }

  if (currentWeather === "clear" && currentTimeOfDay !== "night") {
    return "/sounds/clear_day.mp3";
  }

  if (currentWeather === "rainy") {
    return "/sounds/medium_rain_day_night.mp3";
  }

  if (currentWeather === "stormy") {
    return "/sounds/heavy_rain_day_night.mp3";
  }

  return null;
}

function sliderValueToAmbientGain(sliderValue) {
  const safeSliderValue = clamp(Number(sliderValue), 0, 100);
  return Math.pow(safeSliderValue / 100, 3);
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

function toNotificationCount(value) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }

  return Math.floor(parsed);
}

function resolveNotificationCounts(payload, fallback = { live: 0, scheduled: 0 }) {
  const source =
    payload?.notifications ??
    payload?.data?.notifications ??
    payload?.counts ??
    payload?.data ??
    payload ??
    {};

  const liveCandidate =
    source?.live ??
    source?.live_messages ??
    source?.live_unread ??
    source?.chat;
  const scheduledCandidate =
    source?.scheduled ??
    source?.scheduled_messages ??
    source?.scheduled_unread ??
    source?.inbox;

  return {
    live: liveCandidate === undefined ? fallback.live : toNotificationCount(liveCandidate),
    scheduled: scheduledCandidate === undefined ? fallback.scheduled : toNotificationCount(scheduledCandidate)
  };
}

function toPositiveInteger(value) {
  const numericValue = Number(value);

  if (!Number.isInteger(numericValue) || numericValue <= 0) {
    return null;
  }

  return numericValue;
}

function resolveIncomingLiveSenderId(payload) {
  const messageCandidate = payload?.message ?? payload?.live_message ?? payload?.data ?? null;

  if (!messageCandidate || typeof messageCandidate !== "object") {
    return null;
  }

  if (typeof messageCandidate?.unlock_date === "string") {
    return null;
  }

  return toPositiveInteger(messageCandidate?.sender_id ?? payload?.sender_id);
}

export function DynamicBackgroundLayout({ children }) {
  const { logout, status, user } = useAuth();
  const {
    season,
    setSeason,
    weather,
    setWeather,
    timeOfDay,
    setTimeOfDay,
    isAutoPlay,
    autoPlaySpeed,
    isSoundMuted,
    setIsSoundMuted,
    soundVolume,
    setSoundVolume,
    textSize,
    setTextSize,
    notificationVolume,
    setNotificationVolume,
    isNotificationMuted,
    setIsNotificationMuted,
    isCelebrateMode,
    setIsCelebrateMode,
    fireworksIntensity,
    setFireworksIntensity,
    applySyncSettings,
    resetSettings
  } = useSettings();
  const isPaired = status === "paired";
  const previousAuthStatusRef = useRef(status);
  const [isControlPanelOpen, setIsControlPanelOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [controlsPresentation, setControlsPresentation] = useState("fixed");
  const [notificationCounts, setNotificationCounts] = useState({ live: 0, scheduled: 0 });
  const [ambientRetryTick, setAmbientRetryTick] = useState(0);
  const [isAmbientPlaybackBlocked, setIsAmbientPlaybackBlocked] = useState(false);
  const activeAmbientAudioRef = useRef(null);
  const fadeAnimationFrameByTrackRef = useRef(new Map());
  const knownAudioTracksRef = useRef(new Set());
  const trackTransitionTokenRef = useRef(0);
  const hasAutoUnmutedOnFirstInteractionRef = useRef(false);
  const ambientVolume = sliderValueToAmbientGain(soundVolume);

  useEffect(() => {
    const previousStatus = previousAuthStatusRef.current;
    previousAuthStatusRef.current = status;
    const didLeaveAuthenticatedState = previousStatus === "paired" || previousStatus === "unpaired";

    if (status !== "logged_out" || !didLeaveAuthenticatedState) {
      return;
    }

    setIsControlPanelOpen(false);
    setIsSidebarOpen(false);
    setControlsPresentation("fixed");
    setNotificationCounts({ live: 0, scheduled: 0 });
    resetSettings();
    hasAutoUnmutedOnFirstInteractionRef.current = false;
  }, [resetSettings, status]);

  const registerAudioTrack = (audioTrack) => {
    if (audioTrack) {
      knownAudioTracksRef.current.add(audioTrack);
    }
  };

  const cancelAudioFade = (audioTrack) => {
    if (!audioTrack) {
      return;
    }

    const animationFrameId = fadeAnimationFrameByTrackRef.current.get(audioTrack);

    if (animationFrameId) {
      window.cancelAnimationFrame(animationFrameId);
      fadeAnimationFrameByTrackRef.current.delete(audioTrack);
    }
  };

  const clearAmbientFadeAnimations = () => {
    fadeAnimationFrameByTrackRef.current.forEach((animationFrameId) => {
      window.cancelAnimationFrame(animationFrameId);
    });
    fadeAnimationFrameByTrackRef.current.clear();
  };

  const stopAudioTrack = (audioTrack) => {
    if (!audioTrack) {
      return;
    }

    cancelAudioFade(audioTrack);
    audioTrack.pause();
    audioTrack.currentTime = 0;
    audioTrack.volume = 0;
    knownAudioTracksRef.current.delete(audioTrack);

    if (activeAmbientAudioRef.current === audioTrack) {
      activeAmbientAudioRef.current = null;
    }
  };

  const stopInactiveAudioTracks = (activeTrack) => {
    Array.from(knownAudioTracksRef.current).forEach((audioTrack) => {
      if (audioTrack !== activeTrack) {
        stopAudioTrack(audioTrack);
      }
    });
  };

  const animateAudioVolume = (audioTrack, targetVolume, duration, onComplete) => {
    if (!audioTrack) {
      if (onComplete) {
        onComplete();
      }
      return;
    }

    const safeTargetVolume = clamp(targetVolume, 0, 1);
    const startVolume = clamp(Number(audioTrack.volume) || 0, 0, 1);
    const delta = safeTargetVolume - startVolume;

    cancelAudioFade(audioTrack);

    if (Math.abs(delta) < 0.01 || duration <= 0) {
      audioTrack.volume = safeTargetVolume;
      if (onComplete) {
        onComplete();
      }
      return;
    }

    const animationStartTs = performance.now();

    const step = (timestamp) => {
      const progress = clamp((timestamp - animationStartTs) / duration, 0, 1);
      audioTrack.volume = clamp(startVolume + delta * progress, 0, 1);

      if (progress >= 1) {
        fadeAnimationFrameByTrackRef.current.delete(audioTrack);
        if (onComplete) {
          onComplete();
        }
        return;
      }

      const nextAnimationFrameId = window.requestAnimationFrame(step);
      fadeAnimationFrameByTrackRef.current.set(audioTrack, nextAnimationFrameId);
    };

    const firstAnimationFrameId = window.requestAnimationFrame(step);
    fadeAnimationFrameByTrackRef.current.set(audioTrack, firstAnimationFrameId);
  };

  useEffect(() => {
    if (!isAutoPlay) {
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      setTimeOfDay((previousTimeOfDay) => {
        const timeIndex = timesOfDay.indexOf(previousTimeOfDay);
        const safeTimeIndex = timeIndex === -1 ? 0 : timeIndex;

        if (safeTimeIndex < timesOfDay.length - 1) {
          return timesOfDay[safeTimeIndex + 1];
        }

        setSeason((previousSeason) => {
          const seasonIndex = seasons.indexOf(previousSeason);
          const safeSeasonIndex = seasonIndex === -1 ? 0 : seasonIndex;

          if (safeSeasonIndex < seasons.length - 1) {
            return seasons[safeSeasonIndex + 1];
          }

          setWeather((previousWeather) => {
            const weatherIndex = weatherModes.indexOf(previousWeather);
            const safeWeatherIndex = weatherIndex === -1 ? 0 : weatherIndex;
            return weatherModes[(safeWeatherIndex + 1) % weatherModes.length];
          });

          return seasons[0];
        });

        return timesOfDay[0];
      });
    }, sliderValueToIntervalMs(autoPlaySpeed));

    return () => {
      window.clearInterval(intervalId);
    };
  }, [autoPlaySpeed, isAutoPlay, setSeason, setTimeOfDay, setWeather]);

  useEffect(() => {
    const activeAudio = activeAmbientAudioRef.current;
    clearAmbientFadeAnimations();
    registerAudioTrack(activeAudio);
    stopInactiveAudioTracks(activeAudio);

    if (isSoundMuted) {
      trackTransitionTokenRef.current += 1;

      if (activeAudio) {
        animateAudioVolume(activeAudio, 0, AMBIENT_FADE_DURATION_MS, () => {
          stopAudioTrack(activeAudio);
        });
      }

      return undefined;
    }

    const nextTrackUrl = getAudioTrack(season, weather, timeOfDay);

    if (!nextTrackUrl) {
      trackTransitionTokenRef.current += 1;

      if (activeAudio) {
        animateAudioVolume(activeAudio, 0, AMBIENT_FADE_DURATION_MS, () => {
          stopAudioTrack(activeAudio);
        });
      }

      return undefined;
    }

    const resolvedTrackUrl = new URL(nextTrackUrl, window.location.origin).href;

    if (activeAudio && activeAudio.src === resolvedTrackUrl) {
      registerAudioTrack(activeAudio);
      const resumePromise = activeAudio.play();
      if (resumePromise && typeof resumePromise.catch === "function") {
        resumePromise.catch(() => {});
      }

      animateAudioVolume(activeAudio, ambientVolume, AMBIENT_FADE_DURATION_MS);
      return undefined;
    }

    const nextAudio = new Audio(nextTrackUrl);
    nextAudio.loop = true;
    nextAudio.preload = "auto";
    nextAudio.volume = 0;
    registerAudioTrack(nextAudio);

    const transitionToken = trackTransitionTokenRef.current + 1;
    trackTransitionTokenRef.current = transitionToken;
    activeAmbientAudioRef.current = nextAudio;

    const crossfadeFromPrevious = () => {
      if (trackTransitionTokenRef.current !== transitionToken) {
        stopAudioTrack(nextAudio);
        return;
      }

      animateAudioVolume(nextAudio, ambientVolume, AMBIENT_FADE_DURATION_MS);

      if (!activeAudio || activeAudio === nextAudio) {
        return;
      }

      animateAudioVolume(activeAudio, 0, AMBIENT_FADE_DURATION_MS, () => {
        stopAudioTrack(activeAudio);
      });
    };

    const playPromise = nextAudio.play();

    if (playPromise && typeof playPromise.then === "function") {
      playPromise
        .then(() => {
          setIsAmbientPlaybackBlocked(false);
          crossfadeFromPrevious();
        })
        .catch(() => {
          setIsAmbientPlaybackBlocked(true);
          stopAudioTrack(nextAudio);

          if (trackTransitionTokenRef.current === transitionToken) {
            activeAmbientAudioRef.current = activeAudio ?? null;

            if (activeAudio) {
              registerAudioTrack(activeAudio);
              const resumePromise = activeAudio.play();

              if (resumePromise && typeof resumePromise.catch === "function") {
                resumePromise.catch(() => {});
              }

              animateAudioVolume(activeAudio, ambientVolume, AMBIENT_FADE_DURATION_MS);
            }
          }
        });
    } else {
      crossfadeFromPrevious();
    }

    return undefined;
  }, [season, weather, timeOfDay, isSoundMuted, ambientVolume, ambientRetryTick]);

  useEffect(() => {
    if (isSoundMuted || !isAmbientPlaybackBlocked) {
      return undefined;
    }

    const retryAmbientPlayback = () => {
      setIsAmbientPlaybackBlocked(false);
      setAmbientRetryTick((previousValue) => previousValue + 1);
      window.removeEventListener("pointerdown", retryAmbientPlayback);
      window.removeEventListener("click", retryAmbientPlayback);
      window.removeEventListener("keydown", retryAmbientPlayback);
    };

    window.addEventListener("pointerdown", retryAmbientPlayback);
    window.addEventListener("click", retryAmbientPlayback);
    window.addEventListener("keydown", retryAmbientPlayback);

    return () => {
      window.removeEventListener("pointerdown", retryAmbientPlayback);
      window.removeEventListener("click", retryAmbientPlayback);
      window.removeEventListener("keydown", retryAmbientPlayback);
    };
  }, [isAmbientPlaybackBlocked, isSoundMuted]);

  useEffect(() => {
    if (!isSoundMuted || hasAutoUnmutedOnFirstInteractionRef.current) {
      return undefined;
    }

    const handleFirstUserInteraction = () => {
      if (hasAutoUnmutedOnFirstInteractionRef.current) {
        return;
      }

      hasAutoUnmutedOnFirstInteractionRef.current = true;
      setSoundVolume(AMBIENT_VOLUME_SLIDER_DEFAULT);
      setIsSoundMuted(false);
      window.removeEventListener("pointerdown", handleFirstUserInteraction);
      window.removeEventListener("click", handleFirstUserInteraction);
    };

    window.addEventListener("pointerdown", handleFirstUserInteraction);
    window.addEventListener("click", handleFirstUserInteraction);

    return () => {
      window.removeEventListener("pointerdown", handleFirstUserInteraction);
      window.removeEventListener("click", handleFirstUserInteraction);
    };
  }, [isSoundMuted, setIsSoundMuted, setSoundVolume]);

  useEffect(() => {
    return () => {
      clearAmbientFadeAnimations();
      Array.from(knownAudioTracksRef.current).forEach((audioTrack) => {
        stopAudioTrack(audioTrack);
      });
      knownAudioTracksRef.current.clear();
      activeAmbientAudioRef.current = null;
    };
  }, []);

  const handleNotificationVolumeChange = useCallback((nextVolume) => {
    const parsedVolume = Number(nextVolume);

    if (!Number.isFinite(parsedVolume)) {
      return;
    }

    setNotificationVolume(clamp(parsedVolume, 0, 100));
  }, [setNotificationVolume]);

  const handleToggleNotificationMuted = useCallback(() => {
    setIsNotificationMuted((previousValue) => !previousValue);
  }, [setIsNotificationMuted]);

  const handleToggleCelebrateMode = useCallback(() => {
    setIsCelebrateMode((previousValue) => !previousValue);
  }, [setIsCelebrateMode]);

  const handleFireworksIntensityChange = useCallback((nextIntensity) => {
    const parsedIntensity = Number(nextIntensity);

    if (!Number.isFinite(parsedIntensity)) {
      return;
    }

    setFireworksIntensity(clamp(parsedIntensity, FIREWORKS_INTENSITY_MIN, FIREWORKS_INTENSITY_MAX));
  }, [setFireworksIntensity]);

  const toggleControlPanel = useCallback(() => {
    setIsControlPanelOpen((previousValue) => !previousValue);
  }, []);

  const closeControlPanel = useCallback(() => {
    setIsControlPanelOpen(false);
  }, []);

  useEffect(() => {
    const isTextEditingElement = (node) => {
      if (!(node instanceof Element)) {
        return false;
      }

      const closestEditable = node.closest("input, textarea, [contenteditable='true'], [contenteditable='']");

      if (!closestEditable) {
        return false;
      }

      const tagName = closestEditable.tagName.toLowerCase();

      if (tagName === "textarea") {
        return true;
      }

      if (tagName === "input") {
        const inputType = (closestEditable.getAttribute("type") || "text").toLowerCase();
        const textLikeInputTypes = new Set([
          "text",
          "search",
          "email",
          "password",
          "url",
          "tel",
          "number"
        ]);

        return textLikeInputTypes.has(inputType);
      }

      return closestEditable.hasAttribute("contenteditable");
    };

    const handleEscapeKey = (event) => {
      if (event.key === "Escape") {
        setIsControlPanelOpen((previousValue) => !previousValue);
        return;
      }

      if (event.key === "Tab") {
        const focusedElement = event.target;

        if (isTextEditingElement(focusedElement)) {
          return;
        }

        event.preventDefault();
        setIsSidebarOpen((previousValue) => !previousValue);
      }
    };

    window.addEventListener("keydown", handleEscapeKey);

    return () => {
      window.removeEventListener("keydown", handleEscapeKey);
    };
  }, [isControlPanelOpen, isSidebarOpen, setIsControlPanelOpen, setIsSidebarOpen]);

  const clearNotificationCount = useCallback((type) => {
    if (type !== "live" && type !== "scheduled") {
      return;
    }

    setNotificationCounts((previousCounts) => ({
      ...previousCounts,
      [type]: 0
    }));
  }, []);

  const playNotificationSound = useCallback((type) => {
    if (isNotificationMuted) {
      return;
    }

    playNotificationSoundByType(type, notificationVolume);
  }, [isNotificationMuted, notificationVolume]);

  const playScheduledNotificationSound = useCallback(() => {
    playNotificationSound("scheduled");
  }, [playNotificationSound]);

  const playReceiveLiveSound = useCallback(() => {
    playNotificationSound("receive-live");
  }, [playNotificationSound]);

  const setNotificationCountsFromPayload = useCallback((payload, options = {}) => {
    const replace = options.replace === true;
    const playScheduledSound = options.playScheduledSound === true;

    setNotificationCounts((previousCounts) => {
      const fallbackCounts = replace ? { live: 0, scheduled: 0 } : previousCounts;
      const nextCounts = resolveNotificationCounts(payload, fallbackCounts);

      if (playScheduledSound && nextCounts.scheduled > previousCounts.scheduled) {
        playScheduledNotificationSound();
      }

      return nextCounts;
    });
  }, [playScheduledNotificationSound]);

  useEffect(() => {
    if (!isPaired) {
      setNotificationCounts({ live: 0, scheduled: 0 });
      return undefined;
    }

    const accessToken = getAccessToken();

    if (!accessToken) {
      setNotificationCounts({ live: 0, scheduled: 0 });
      return undefined;
    }

    let isCancelled = false;

    void getNotifications(accessToken)
      .then((payload) => {
        if (isCancelled) {
          return;
        }

        setNotificationCountsFromPayload(payload, { replace: true });
      })
      .catch(() => {});

    return () => {
      isCancelled = true;
    };
  }, [isPaired, setNotificationCountsFromPayload, status]);

  useEffect(() => {
    if (!isPaired) {
      return undefined;
    }

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

            if (eventName === "new_message" || eventName === "message_created") {
              const senderId = resolveIncomingLiveSenderId(payload);
              const currentUserId = toPositiveInteger(user?.id);

              if (senderId && currentUserId && senderId !== currentUserId) {
                playReceiveLiveSound();
              }
            }

            if (eventName !== "notification_update") {
              return;
            }

            setNotificationCountsFromPayload(payload, { playScheduledSound: true });
          }
        }
      );
    } catch {
      return undefined;
    }

    return () => {
      if (subscription && consumer) {
        consumer.subscriptions.remove(subscription);
      }

      consumer?.disconnect();
    };
  }, [isPaired, playReceiveLiveSound, setNotificationCountsFromPayload, status, user?.id]);

  const controlsContextValue = useMemo(() => ({
    isControlPanelOpen,
    setIsControlPanelOpen,
    toggleControlPanel,
    closeControlPanel,
    controlsPresentation,
    setControlsPresentation,
    isSidebarOpen,
    setIsSidebarOpen,
    textSize,
    setTextSize,
    notificationVolume,
    setNotificationVolume,
    isNotificationMuted,
    setIsNotificationMuted,
    toggleNotificationMuted: handleToggleNotificationMuted,
    isCelebrateMode,
    setIsCelebrateMode,
    toggleCelebrateMode: handleToggleCelebrateMode,
    fireworksIntensity,
    setFireworksIntensity,
    applySyncSettings,
    playNotificationSound,
    notificationCounts,
    clearNotificationCount
  }), [
    applySyncSettings,
    clearNotificationCount,
    closeControlPanel,
    controlsPresentation,
    fireworksIntensity,
    handleToggleNotificationMuted,
    handleToggleCelebrateMode,
    isControlPanelOpen,
    isCelebrateMode,
    isNotificationMuted,
    isSidebarOpen,
    notificationVolume,
    notificationCounts,
    playNotificationSound,
    setNotificationVolume,
    setIsNotificationMuted,
    textSize,
    toggleControlPanel
  ]);

  console.log("[Background] Randare activa. Stare Celebrate Mode:", isCelebrateMode);
  console.log("[layout:render_children]", {
    status,
    isServerDown: false,
    hasChildren: Boolean(children),
    willRenderOutlet: !children,
    path: typeof window !== "undefined" ? window.location.pathname : null,
    isControlPanelOpen,
    isSidebarOpen,
    controlsPresentation
  });

  return (
    <DynamicBackgroundControlsContext.Provider value={controlsContextValue}>
      <SpringLandingShell
        isControlPanelOpen={isControlPanelOpen}
        controlsPresentation={controlsPresentation}
        isSidebarOpen={isSidebarOpen}
        onCloseControlPanel={closeControlPanel}
        onLogout={logout}
      >
        {isCelebrateMode && (
          <BackgroundFireworks
            intensity={fireworksIntensity}
            notificationVolume={notificationVolume}
            isNotificationMuted={isNotificationMuted}
          />
        )}
        {console.log("[layout:children_mount]", {
          path: typeof window !== "undefined" ? window.location.pathname : null,
          renderedNode: children ? "children" : "outlet"
        })}
        {children ?? <Outlet />}
      </SpringLandingShell>
    </DynamicBackgroundControlsContext.Provider>
  );
}

export function useDynamicBackgroundControls() {
  const context = useContext(DynamicBackgroundControlsContext);

  if (!context) {
    throw new Error("useDynamicBackgroundControls must be used within DynamicBackgroundLayout");
  }

  return context;
}

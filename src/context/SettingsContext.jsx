import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

const SETTINGS_STORAGE_KEY = "justus.settings.v1";
const SEASON_OPTIONS = ["spring", "summer", "autumn", "winter"];
const WEATHER_OPTIONS = ["clear", "rainy", "stormy"];
const TIME_OF_DAY_OPTIONS = ["morning", "noon", "evening", "night"];
const TEXT_SIZE_OPTIONS = ["small", "medium", "large"];

const DEFAULT_SETTINGS = {
  season: "spring",
  weather: "clear",
  timeOfDay: "morning",
  isAutoPlay: true,
  autoPlaySpeed: 100,
  isSoundMuted: true,
  soundVolume: 50,
  isNotificationMuted: false,
  notificationVolume: 50,
  isCelebrateMode: false,
  fireworksIntensity: 55,
  textSize: "small"
};

const SettingsContext = createContext(null);

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function normalizeSettings(candidate) {
  if (!candidate || typeof candidate !== "object") {
    return DEFAULT_SETTINGS;
  }

  const nextSeason = SEASON_OPTIONS.includes(candidate.season)
    ? candidate.season
    : DEFAULT_SETTINGS.season;

  const nextWeather = WEATHER_OPTIONS.includes(candidate.weather)
    ? candidate.weather
    : DEFAULT_SETTINGS.weather;

  const nextTimeOfDay = TIME_OF_DAY_OPTIONS.includes(candidate.timeOfDay)
    ? candidate.timeOfDay
    : DEFAULT_SETTINGS.timeOfDay;

  const nextTextSize = TEXT_SIZE_OPTIONS.includes(candidate.textSize)
    ? candidate.textSize
    : DEFAULT_SETTINGS.textSize;

  const nextAutoPlaySpeed = Number.isFinite(Number(candidate.autoPlaySpeed))
    ? clamp(Number(candidate.autoPlaySpeed), 0, 100)
    : DEFAULT_SETTINGS.autoPlaySpeed;

  const nextSoundVolume = Number.isFinite(Number(candidate.soundVolume))
    ? clamp(Number(candidate.soundVolume), 0, 100)
    : DEFAULT_SETTINGS.soundVolume;

  const nextNotificationVolume = Number.isFinite(Number(candidate.notificationVolume))
    ? clamp(Number(candidate.notificationVolume), 0, 100)
    : DEFAULT_SETTINGS.notificationVolume;

  const nextFireworksIntensity = Number.isFinite(Number(candidate.fireworksIntensity))
    ? clamp(Number(candidate.fireworksIntensity), 1, 100)
    : DEFAULT_SETTINGS.fireworksIntensity;

  return {
    season: nextSeason,
    weather: nextWeather,
    timeOfDay: nextTimeOfDay,
    isAutoPlay: Boolean(candidate.isAutoPlay),
    autoPlaySpeed: nextAutoPlaySpeed,
    isSoundMuted: Boolean(candidate.isSoundMuted),
    soundVolume: nextSoundVolume,
    isNotificationMuted: Boolean(candidate.isNotificationMuted),
    notificationVolume: nextNotificationVolume,
    isCelebrateMode: Boolean(candidate.isCelebrateMode),
    fireworksIntensity: nextFireworksIntensity,
    textSize: nextTextSize
  };
}

function resolveNextValue(nextValueOrUpdater, previousValue) {
  return typeof nextValueOrUpdater === "function"
    ? nextValueOrUpdater(previousValue)
    : nextValueOrUpdater;
}

function areSettingsEqual(left, right) {
  if (left === right) {
    return true;
  }

  return (
    left.season === right.season &&
    left.weather === right.weather &&
    left.timeOfDay === right.timeOfDay &&
    left.isAutoPlay === right.isAutoPlay &&
    left.autoPlaySpeed === right.autoPlaySpeed &&
    left.isSoundMuted === right.isSoundMuted &&
    left.soundVolume === right.soundVolume &&
    left.isNotificationMuted === right.isNotificationMuted &&
    left.notificationVolume === right.notificationVolume &&
    left.isCelebrateMode === right.isCelebrateMode &&
    left.fireworksIntensity === right.fireworksIntensity &&
    left.textSize === right.textSize
  );
}

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(() => {
    if (typeof window === "undefined") {
      return DEFAULT_SETTINGS;
    }

    const saved = window.localStorage.getItem(SETTINGS_STORAGE_KEY);

    if (!saved) {
      return DEFAULT_SETTINGS;
    }

    try {
      return normalizeSettings(JSON.parse(saved));
    } catch {
      return DEFAULT_SETTINGS;
    }
  });

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // Best-effort persistence.
    }
  }, [settings]);

  const setSeason = useCallback((nextValueOrUpdater) => {
    setSettings((previous) => {
      const rawNextValue = resolveNextValue(nextValueOrUpdater, previous.season);
      const nextSeason = SEASON_OPTIONS.includes(rawNextValue) ? rawNextValue : previous.season;

      return {
        ...previous,
        season: nextSeason
      };
    });
  }, []);

  const setWeather = useCallback((nextValueOrUpdater) => {
    setSettings((previous) => {
      const rawNextValue = resolveNextValue(nextValueOrUpdater, previous.weather);
      const nextWeather = WEATHER_OPTIONS.includes(rawNextValue) ? rawNextValue : previous.weather;

      return {
        ...previous,
        weather: nextWeather
      };
    });
  }, []);

  const setTimeOfDay = useCallback((nextValueOrUpdater) => {
    setSettings((previous) => {
      const rawNextValue = resolveNextValue(nextValueOrUpdater, previous.timeOfDay);
      const nextTimeOfDay = TIME_OF_DAY_OPTIONS.includes(rawNextValue)
        ? rawNextValue
        : previous.timeOfDay;

      return {
        ...previous,
        timeOfDay: nextTimeOfDay
      };
    });
  }, []);

  const setIsAutoPlay = useCallback((nextValueOrUpdater) => {
    setSettings((previous) => {
      const nextValue = resolveNextValue(nextValueOrUpdater, previous.isAutoPlay);

      return {
        ...previous,
        isAutoPlay: Boolean(nextValue)
      };
    });
  }, []);

  const setAutoPlaySpeed = useCallback((nextValueOrUpdater) => {
    setSettings((previous) => {
      const rawNextValue = resolveNextValue(nextValueOrUpdater, previous.autoPlaySpeed);
      const nextAutoPlaySpeed = Number.isFinite(Number(rawNextValue))
        ? clamp(Number(rawNextValue), 0, 100)
        : previous.autoPlaySpeed;

      return {
        ...previous,
        autoPlaySpeed: nextAutoPlaySpeed
      };
    });
  }, []);

  const setIsSoundMuted = useCallback((nextValueOrUpdater) => {
    setSettings((previous) => {
      const nextValue = resolveNextValue(nextValueOrUpdater, previous.isSoundMuted);

      return {
        ...previous,
        isSoundMuted: Boolean(nextValue)
      };
    });
  }, []);

  const setSoundVolume = useCallback((nextValueOrUpdater) => {
    setSettings((previous) => {
      const rawNextValue = resolveNextValue(nextValueOrUpdater, previous.soundVolume);
      const nextSoundVolume = Number.isFinite(Number(rawNextValue))
        ? clamp(Number(rawNextValue), 0, 100)
        : previous.soundVolume;

      return {
        ...previous,
        soundVolume: nextSoundVolume
      };
    });
  }, []);

  const setIsCelebrateMode = useCallback((nextValueOrUpdater) => {
    setSettings((previous) => {
      const nextValue = resolveNextValue(nextValueOrUpdater, previous.isCelebrateMode);

      return {
        ...previous,
        isCelebrateMode: Boolean(nextValue)
      };
    });
  }, []);

  const setFireworksIntensity = useCallback((nextValueOrUpdater) => {
    setSettings((previous) => {
      const rawNextValue = resolveNextValue(nextValueOrUpdater, previous.fireworksIntensity);

      const nextFireworksIntensity = Number.isFinite(Number(rawNextValue))
        ? clamp(Number(rawNextValue), 1, 100)
        : previous.fireworksIntensity;

      return {
        ...previous,
        fireworksIntensity: nextFireworksIntensity
      };
    });
  }, []);

  const setNotificationVolume = useCallback((nextValueOrUpdater) => {
    setSettings((previous) => {
      const rawNextValue = resolveNextValue(nextValueOrUpdater, previous.notificationVolume);

      const nextNotificationVolume = Number.isFinite(Number(rawNextValue))
        ? clamp(Number(rawNextValue), 0, 100)
        : previous.notificationVolume;

      return {
        ...previous,
        notificationVolume: nextNotificationVolume
      };
    });
  }, []);

  const setIsNotificationMuted = useCallback((nextValueOrUpdater) => {
    setSettings((previous) => {
      const nextValue = resolveNextValue(nextValueOrUpdater, previous.isNotificationMuted);

      return {
        ...previous,
        isNotificationMuted: Boolean(nextValue)
      };
    });
  }, []);

  const setTextSize = useCallback((nextValueOrUpdater) => {
    setSettings((previous) => {
      const rawNextValue = resolveNextValue(nextValueOrUpdater, previous.textSize);

      const nextTextSize = TEXT_SIZE_OPTIONS.includes(rawNextValue)
        ? rawNextValue
        : previous.textSize;

      return {
        ...previous,
        textSize: nextTextSize
      };
    });
  }, []);

  const applySyncSettings = useCallback((newSettingsObject = {}) => {
    if (!newSettingsObject || typeof newSettingsObject !== "object") {
      return;
    }

    setSettings((previous) => normalizeSettings({
      ...previous,
      ...newSettingsObject
    }));
  }, []);

  const resetSettings = useCallback(() => {
    setSettings(DEFAULT_SETTINGS);
  }, []);

  const updateSettings = useCallback((nextSettingsOrUpdater) => {
    setSettings((previous) => {
      const partialUpdate =
        typeof nextSettingsOrUpdater === "function"
          ? nextSettingsOrUpdater(previous)
          : nextSettingsOrUpdater;

      if (!partialUpdate || typeof partialUpdate !== "object") {
        return previous;
      }

      const nextSettings = normalizeSettings({
        ...previous,
        ...partialUpdate
      });

      return areSettingsEqual(previous, nextSettings) ? previous : nextSettings;
    });
  }, []);

  const toggleSoundMuted = useCallback(() => {
    setIsSoundMuted((previous) => !previous);
  }, [setIsSoundMuted]);

  const toggleNotificationMuted = useCallback(() => {
    setIsNotificationMuted((previous) => !previous);
  }, [setIsNotificationMuted]);

  const toggleCelebrateMode = useCallback(() => {
    setIsCelebrateMode((previous) => !previous);
  }, [setIsCelebrateMode]);

  const contextValue = useMemo(() => ({
    season: settings.season,
    setSeason,
    weather: settings.weather,
    setWeather,
    timeOfDay: settings.timeOfDay,
    setTimeOfDay,
    isAutoPlay: settings.isAutoPlay,
    setIsAutoPlay,
    autoPlaySpeed: settings.autoPlaySpeed,
    setAutoPlaySpeed,
    isSoundMuted: settings.isSoundMuted,
    setIsSoundMuted,
    toggleSoundMuted,
    soundVolume: settings.soundVolume,
    setSoundVolume,
    isNotificationMuted: settings.isNotificationMuted,
    setIsNotificationMuted,
    toggleNotificationMuted,
    notificationVolume: settings.notificationVolume,
    setNotificationVolume,
    isCelebrateMode: settings.isCelebrateMode,
    setIsCelebrateMode,
    toggleCelebrateMode,
    fireworksIntensity: settings.fireworksIntensity,
    setFireworksIntensity,
    textSize: settings.textSize,
    setTextSize,
    updateSettings,
    applySyncSettings,
    resetSettings
  }), [
    settings,
    setSeason,
    setWeather,
    setTimeOfDay,
    setIsAutoPlay,
    setAutoPlaySpeed,
    setIsSoundMuted,
    toggleSoundMuted,
    setSoundVolume,
    setIsCelebrateMode,
    toggleCelebrateMode,
    setFireworksIntensity,
    setNotificationVolume,
    setIsNotificationMuted,
    toggleNotificationMuted,
    setTextSize,
    updateSettings,
    applySyncSettings,
    resetSettings
  ]);

  return <SettingsContext.Provider value={contextValue}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const context = useContext(SettingsContext);

  if (!context) {
    throw new Error("useSettings must be used within SettingsProvider");
  }

  return context;
}

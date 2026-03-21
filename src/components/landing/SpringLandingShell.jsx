import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import {
  Bell,
  BellOff,
  CloudLightning,
  CloudRain,
  Flower,
  Leaf,
  LogOut,
  MoonStar,
  Snowflake,
  Sparkles,
  Sun,
  SunMedium,
  Sunrise,
  Sunset,
  Type,
  Volume2,
  VolumeX
} from "lucide-react";
import { useSettings } from "../../context/SettingsContext";

const seasonOrder = ["spring", "summer", "autumn", "winter"];
const weatherOrder = ["clear", "rainy", "stormy"];
const timeOfDayOrder = ["morning", "noon", "evening", "night"];
const LIGHTNING_MIN_DELAY_MS = 2 * 60 * 1000;
const LIGHTNING_MAX_DELAY_MS = 3 * 60 * 1000;
const LIGHTNING_MIN_FLASH_MS = 100;
const LIGHTNING_MAX_FLASH_MS = 200;

const seasonPalette = {
  spring: {
    skyTint: "#bef264",
    terrain: {
      hillBack: "#9fd39a",
      hillMid: "#79b77d",
      hillFront: "#4e9566",
      wave1: "#76b57f",
      wave2: "#669f73",
      wave3: "#5f8f68"
    },
    trunk: "#7a553d",
    canopy: ["#f9c3d8", "#f7b5cb", "#f4adc4", "#ffdbe8"],
    canopyOpacity: 1,
    widgetAccent: "text-emerald-700",
    widgetRing: "ring-emerald-200/90",
    seasonalParticleClass: "bg-pink-200/60",
    seasonalParticleRadius: "rounded-[60%_40%_55%_45%]",
    scrollbarBase: "#5b9c6d"
  },
  summer: {
    skyTint: "#22d3ee",
    terrain: {
      hillBack: "#4ea36f",
      hillMid: "#2f8157",
      hillFront: "#1f6b4a",
      wave1: "#267552",
      wave2: "#216647",
      wave3: "#1a563d"
    },
    trunk: "#704b31",
    canopy: ["#2f9f68", "#1d8a5b", "#198552", "#44b77c"],
    canopyOpacity: 1,
    widgetAccent: "text-cyan-700",
    widgetRing: "ring-cyan-200/90",
    seasonalParticleClass: "bg-green-400/60",
    seasonalParticleRadius: "rounded-[30%_70%_45%_55%]",
    scrollbarBase: "#2f8157"
  },
  autumn: {
    skyTint: "#fdba74",
    terrain: {
      hillBack: "#b58457",
      hillMid: "#9a6a44",
      hillFront: "#7f5638",
      wave1: "#8f603f",
      wave2: "#7d5639",
      wave3: "#6a4a32"
    },
    trunk: "#6d4631",
    canopy: ["#d6884f", "#ca7541", "#e4a64c", "#b96d36"],
    canopyOpacity: 0.98,
    widgetAccent: "text-orange-700",
    widgetRing: "ring-orange-200/90",
    seasonalParticleClass: "bg-orange-400/60",
    seasonalParticleRadius: "rounded-[25%_75%_40%_60%]",
    scrollbarBase: "#c46f39"
  },
  winter: {
    skyTint: "#93c5fd",
    terrain: {
      hillBack: "#d7dde8",
      hillMid: "#c5cedc",
      hillFront: "#b8c2d4",
      wave1: "#c8d1df",
      wave2: "#bbc6d7",
      wave3: "#aeb9cd"
    },
    trunk: "#8790a1",
    canopy: ["#ffffff", "#f2f6ff", "#e8eef9", "#ffffff"],
    canopyOpacity: 0.34,
    widgetAccent: "text-sky-700",
    widgetRing: "ring-sky-200/90",
    seasonalParticleClass: "bg-white/80",
    seasonalParticleRadius: "rounded-full",
    scrollbarBase: "#90a2c5"
  }
};

const timePalette = {
  morning: {
    skyTop: "#f9a8d4",
    skyBottom: "#bae6fd",
    sunColor: "#ffe4a8",
    sunX: 320,
    sunY: 500,
    sunRadius: 84,
    sunCoreOpacity: 0.86,
    glowSoft: 0.6,
    glowMid: 0.52,
    glowOuter: 0.42,
    moonOpacity: 0,
    starsOpacity: 0,
    skyBlend: 0.2,
    scrollbarTint: "#fb7185"
  },
  noon: {
    skyTop: "#38bdf8",
    skyBottom: "#dbeafe",
    sunColor: "#fef08a",
    sunX: 1220,
    sunY: 145,
    sunRadius: 104,
    sunCoreOpacity: 0.96,
    glowSoft: 0.88,
    glowMid: 0.8,
    glowOuter: 0.62,
    moonOpacity: 0,
    starsOpacity: 0,
    skyBlend: 0.32,
    scrollbarTint: "#0ea5e9"
  },
  evening: {
    skyTop: "#7c3aed",
    skyBottom: "#fb923c",
    sunColor: "#f97316",
    sunX: 900,
    sunY: 535,
    sunRadius: 142,
    sunCoreOpacity: 0.9,
    glowSoft: 0.86,
    glowMid: 0.76,
    glowOuter: 0.68,
    moonOpacity: 0,
    starsOpacity: 0,
    skyBlend: 0.24,
    scrollbarTint: "#f97316"
  },
  night: {
    skyTop: "#0f172a",
    skyBottom: "#1e1b4b",
    sunColor: "#ffffff",
    sunX: 1220,
    sunY: 145,
    sunRadius: 92,
    sunCoreOpacity: 0,
    glowSoft: 0.16,
    glowMid: 0.1,
    glowOuter: 0.06,
    moonOpacity: 0.96,
    starsOpacity: 0.96,
    skyBlend: 0.08,
    scrollbarTint: "#334155"
  }
};

const weatherTuning = {
  clear: {
    terrainDarken: 0,
    skyDesaturate: 0,
    rainIntensity: 0,
    snowIntensity: 0,
    stormFlash: 0,
    scrollbarShift: "#0f766e",
    scrollbarWeight: 0.1
  },
  rainy: {
    terrainDarken: 0.12,
    skyDesaturate: 0.56,
    rainIntensity: 0.5,
    snowIntensity: 0.62,
    stormFlash: 0,
    scrollbarShift: "#0f4c81",
    scrollbarWeight: 0.38
  },
  stormy: {
    terrainDarken: 0.2,
    skyDesaturate: 0.72,
    rainIntensity: 1,
    snowIntensity: 1,
    stormFlash: 1,
    scrollbarShift: "#1e293b",
    scrollbarWeight: 0.56
  }
};

const seasonalParticles = [
  { left: "5%", top: "-8%", size: 10, duration: 10.5, delay: -1.2, drift: 24, spin: 120 },
  { left: "12%", top: "-12%", size: 8, duration: 12.2, delay: -3.1, drift: -18, spin: -130 },
  { left: "19%", top: "-10%", size: 11, duration: 11.6, delay: -0.9, drift: 30, spin: 140 },
  { left: "27%", top: "-9%", size: 9, duration: 9.8, delay: -4.4, drift: -20, spin: -110 },
  { left: "35%", top: "-14%", size: 12, duration: 12.8, delay: -2.2, drift: 26, spin: 150 },
  { left: "43%", top: "-7%", size: 7, duration: 9.5, delay: -5.2, drift: -14, spin: -160 },
  { left: "52%", top: "-11%", size: 10, duration: 10.2, delay: -1.7, drift: 20, spin: 120 },
  { left: "60%", top: "-9%", size: 9, duration: 11.3, delay: -3.8, drift: -22, spin: -150 },
  { left: "67%", top: "-15%", size: 13, duration: 13.4, delay: -0.6, drift: 32, spin: 170 },
  { left: "74%", top: "-8%", size: 8, duration: 9.3, delay: -2.9, drift: -16, spin: -115 },
  { left: "81%", top: "-13%", size: 12, duration: 12.6, delay: -4.8, drift: 18, spin: 130 },
  { left: "88%", top: "-10%", size: 9, duration: 10.4, delay: -2.5, drift: -20, spin: -140 },
  { left: "93%", top: "-6%", size: 11, duration: 11.9, delay: -1.1, drift: 24, spin: 145 }
];

const calmRainParticles = Array.from({ length: 20 }, (_, index) => ({
  left: `${4 + index * 4.8}%`,
  top: `${20 + (index % 4) * 3}%`,
  width: 1.3 + (index % 3) * 0.3,
  height: 28 + (index % 4) * 8,
  duration: 2.2 + (index % 5) * 0.3,
  delay: -index * 0.35,
  drift: -8 - (index % 3) * 3
}));

const snowyRainParticles = Array.from({ length: 30 }, (_, index) => ({
  left: `${3 + index * 3.2}%`,
  top: `${18 + (index % 5) * 2.8}%`,
  size: 3 + (index % 4) * 1.2,
  duration: 6 + (index % 6) * 0.9,
  delay: -index * 0.32,
  drift: 14 + (index % 4) * 8,
  spin: 130 + (index % 5) * 22
}));

const stars = [
  { x: 110, y: 100, r: 1.7 },
  { x: 230, y: 160, r: 1.2 },
  { x: 340, y: 88, r: 1.5 },
  { x: 510, y: 130, r: 1.8 },
  { x: 620, y: 95, r: 1.4 },
  { x: 760, y: 140, r: 1.3 },
  { x: 860, y: 90, r: 1.6 },
  { x: 980, y: 150, r: 1.3 },
  { x: 1090, y: 98, r: 1.5 },
  { x: 1200, y: 132, r: 1.8 },
  { x: 1320, y: 88, r: 1.4 },
  { x: 1430, y: 120, r: 1.6 }
];

const seasonItems = [
  { key: "spring", icon: Flower, label: "Spring" },
  { key: "summer", icon: Sun, label: "Summer" },
  { key: "autumn", icon: Leaf, label: "Autumn" },
  { key: "winter", icon: Snowflake, label: "Winter" }
];

const weatherItems = [
  { key: "clear", icon: SunMedium, label: "Clear" },
  { key: "rainy", icon: CloudRain, label: "Rainy" },
  { key: "stormy", icon: CloudLightning, label: "Stormy" }
];

const timeItems = [
  { key: "morning", icon: Sunrise, label: "Morning" },
  { key: "noon", icon: Sun, label: "Noon" },
  { key: "evening", icon: Sunset, label: "Evening" },
  { key: "night", icon: MoonStar, label: "Night" }
];

function classNames(...parts) {
  return parts.filter(Boolean).join(" ");
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function hexToRgb(hex) {
  const sanitized = hex.replace("#", "");
  const normalized =
    sanitized.length === 3
      ? sanitized
          .split("")
          .map((char) => char + char)
          .join("")
      : sanitized;

  const parsed = Number.parseInt(normalized, 16);
  return {
    r: (parsed >> 16) & 255,
    g: (parsed >> 8) & 255,
    b: parsed & 255
  };
}

function rgbToHex({ r, g, b }) {
  const toHex = (channel) => Math.round(clamp(channel, 0, 255)).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function mixHex(base, overlay, ratio) {
  const safeRatio = clamp(ratio, 0, 1);
  const start = hexToRgb(base);
  const end = hexToRgb(overlay);

  return rgbToHex({
    r: start.r + (end.r - start.r) * safeRatio,
    g: start.g + (end.g - start.g) * safeRatio,
    b: start.b + (end.b - start.b) * safeRatio
  });
}

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function getParticleMode(weather, season) {
  if (weather === "stormy") {
    return season === "winter" ? "blizzard" : "storm-rain";
  }

  if (weather === "rainy") {
    return season === "winter" ? "snow-rainy" : "rain-calm";
  }

  return "seasonal";
}

function IndicatorRow({ items, activeKey, onSelect, accentClass, ringClass }) {
  return (
    <div className="grid w-full grid-cols-4 justify-items-start gap-2">
      {items.map((item) => {
        const Icon = item.icon;
        const isActive = item.key === activeKey;

        return (
          <button
            key={item.key}
            type="button"
            title={item.label}
            onClick={() => onSelect?.(item.key)}
            className={classNames(
              "inline-flex h-8 w-8 items-center justify-center justify-self-start rounded-full transition-all duration-500 focus-visible:outline-none focus-visible:ring-2",
              isActive
                ? classNames("scale-110 bg-white/90 opacity-100 ring-1", accentClass, ringClass)
                : "scale-100 bg-white/45 text-stone-500 opacity-40 ring-transparent"
            )}
            aria-label={`Switch to ${item.label}`}
            aria-pressed={isActive}
          >
            <Icon size={16} strokeWidth={2} />
          </button>
        );
      })}
    </div>
  );
}

function ControlPill({ children, className }) {
  return (
    <div
      className={classNames(
        "w-full rounded-full border border-white/70 bg-white/45 px-3 py-2 shadow-[0_12px_30px_rgba(15,23,42,0.1)] backdrop-blur-xl",
        className
      )}
    >
      {children}
    </div>
  );
}

function CloudCluster({ x, y, scale = 1, fill, opacity, filter = undefined }) {
  return (
    <g
      transform={`translate(${x} ${y}) scale(${scale})`}
      style={{ opacity, transition: "opacity 3000ms ease-in-out, transform 3000ms ease-in-out" }}
      filter={filter}
    >
      <circle cx="0" cy="0" r="26" fill={fill} />
      <circle cx="28" cy="-10" r="22" fill={fill} />
      <circle cx="54" cy="0" r="24" fill={fill} />
      <ellipse cx="28" cy="14" rx="50" ry="18" fill={fill} />
    </g>
  );
}

export function SpringLandingShell({
  children,
  isControlPanelOpen = true,
  controlsPresentation = "fixed",
  isSidebarOpen = false,
  onCloseControlPanel,
  onLogout
}) {
  const {
    season: selectedSeason,
    setSeason,
    weather: selectedWeather,
    setWeather,
    timeOfDay: selectedTimeOfDay,
    setTimeOfDay,
    isAutoPlay: isAutoPlayEnabled,
    setIsAutoPlay,
    autoPlaySpeed: autoPlaySpeedValue,
    setAutoPlaySpeed,
    isSoundMuted,
    setIsSoundMuted,
    soundVolume,
    setSoundVolume,
    isCelebrateMode,
    setIsCelebrateMode,
    fireworksIntensity,
    setFireworksIntensity,
    notificationVolume,
    setNotificationVolume,
    isNotificationMuted,
    setIsNotificationMuted,
    textSize,
    setTextSize
  } = useSettings();

  const safeSeason = seasonOrder.includes(selectedSeason) ? selectedSeason : "spring";
  const location = useLocation();
  const isPairingRoute = location.pathname === "/pairing";
  const isRelaxRoute = location.pathname === "/relax";
  const safeWeather = weatherOrder.includes(selectedWeather) ? selectedWeather : "clear";
  const safeTimeOfDay = timeOfDayOrder.includes(selectedTimeOfDay) ? selectedTimeOfDay : "morning";
  const safeTextSize = ["small", "medium", "large"].includes(textSize)
    ? textSize
    : "small";

  const season = seasonPalette[safeSeason];
  const time = timePalette[safeTimeOfDay];
  const weather = weatherTuning[safeWeather];
  const safeAmbientVolumeSliderValue = clamp(Number(soundVolume) || 0, 0, 100);
  const safeNotificationVolumeSliderValue = clamp(Number(notificationVolume) || 0, 0, 100);
  const safeFireworksIntensity = clamp(Number(fireworksIntensity) || 55, 1, 100);

  const baseSkyTop = mixHex(time.skyTop, season.skyTint, time.skyBlend);
  const baseSkyBottom = mixHex(time.skyBottom, season.skyTint, time.skyBlend * 0.78);

  const rainySkyTop = mixHex(baseSkyTop, "#64748b", weather.skyDesaturate * 0.68);
  const rainySkyBottom = mixHex(baseSkyBottom, "#334155", weather.skyDesaturate * 0.82);

  const stormToneTop = mixHex(time.skyTop, "#1e293b", 0.86);
  const stormToneBottom = mixHex(time.skyBottom, "#0f172a", 0.9);

  const skyTop = safeWeather === "stormy" ? stormToneTop : rainySkyTop;
  const skyBottom = safeWeather === "stormy" ? stormToneBottom : rainySkyBottom;

  const hillBack = mixHex(season.terrain.hillBack, "#0f172a", weather.terrainDarken * 0.45);
  const hillMid = mixHex(season.terrain.hillMid, "#0f172a", weather.terrainDarken * 0.5);
  const hillFront = mixHex(season.terrain.hillFront, "#0f172a", weather.terrainDarken * 0.56);
  const wave1 = mixHex(season.terrain.wave1, "#0f172a", weather.terrainDarken * 0.54);
  const wave2 = mixHex(season.terrain.wave2, "#0f172a", weather.terrainDarken * 0.58);
  const wave3 = mixHex(season.terrain.wave3, "#0f172a", weather.terrainDarken * 0.62);

  const trunkColor = mixHex(season.trunk, "#111827", weather.terrainDarken * 0.34);
  const canopyColors = season.canopy.map((color) => mixHex(color, "#0f172a", weather.terrainDarken * 0.24));

  const sunColor = mixHex(time.sunColor, "#fff8cc", safeTimeOfDay === "evening" ? 0.08 : 0.2);
  const cloudLightColor = mixHex(skyTop, "#ffffff", 0.72);
  const cloudRainColor = mixHex("#94a3b8", "#cbd5e1", 0.45);
  const cloudStormColor = mixHex("#334155", "#0f172a", 0.72);

  const cloudOpacity = {
    clear: { light: 0.3, rain: 0.1, storm: 0.03, canopy: 0.04 },
    rainy: { light: 0.2, rain: 0.62, storm: 0.34, canopy: 0.72 },
    stormy: { light: 0.08, rain: 0.38, storm: 0.92, canopy: 0.96 }
  }[safeWeather];

  const canopyCloudClass = classNames(
    "transition-all duration-[4000ms] ease-in-out",
    safeWeather === "clear"
      ? "opacity-0 -translate-y-10 scale-95 pointer-events-none"
      : "opacity-100 translate-y-0 scale-100"
  );

  const stormCloudClass = classNames(
    "transition-all duration-[4000ms] ease-in-out",
    safeWeather === "stormy"
      ? "opacity-100 translate-y-0 scale-100"
      : "opacity-0 -translate-y-10 scale-95 pointer-events-none"
  );

  const moonTrajectory = {
    morning: { x: 1380, y: 92, opacity: 0.08 },
    noon: { x: 1450, y: 74, opacity: 0 },
    evening: { x: 1320, y: 100, opacity: 0.12 },
    night: { x: 1180, y: 124, opacity: 1 }
  };

  const activeMoon = moonTrajectory[safeTimeOfDay];
  const sunTranslateX = time.sunX - 1220;
  const sunTranslateY = time.sunY - 145;
  const sunScale = time.sunRadius / 104;
  const moonTranslateX = activeMoon.x - 1260;
  const moonTranslateY = activeMoon.y - 145;
  const scenicTransitionStyle = { transition: "all 3000ms ease-in-out" };

  const particleMode = getParticleMode(safeWeather, safeSeason);

  const dynamicStormRainParticles = useMemo(() => {
    if (particleMode !== "storm-rain") {
      return [];
    }

    return Array.from({ length: 84 }, () => ({
      left: `${randomBetween(0, 100)}%`,
      top: `${randomBetween(8, 26)}%`,
      width: randomBetween(1, 2.2),
      height: randomBetween(26, 46),
      duration: randomBetween(0.75, 1.5),
      delay: -randomBetween(0, 5),
      drift: randomBetween(-34, -12),
      tilt: randomBetween(-18, 12)
    }));
  }, [particleMode]);

  const dynamicBlizzardParticles = useMemo(() => {
    if (particleMode !== "blizzard") {
      return [];
    }

    return Array.from({ length: 104 }, () => ({
      left: `${randomBetween(0, 100)}%`,
      top: `${randomBetween(7, 25)}%`,
      size: randomBetween(2.2, 5.2),
      duration: randomBetween(2.5, 4.8),
      delay: -randomBetween(0, 5),
      drift: randomBetween(30, 72),
      spin: randomBetween(120, 260),
      tilt: randomBetween(-16, 20)
    }));
  }, [particleMode]);

  const dominantScrollbar = mixHex(
    mixHex(season.scrollbarBase, time.scrollbarTint, 0.46),
    weather.scrollbarShift,
    weather.scrollbarWeight
  );
  const scrollbarTrack = mixHex("#f8fafc", dominantScrollbar, 0.22);
  const scrollbarHover = mixHex(dominantScrollbar, "#0f172a", 0.24);

  const themeClass = `theme-${safeSeason}-${safeWeather}-${safeTimeOfDay}`;
  const isLightningAllowed = safeWeather === "stormy" && safeSeason !== "winter";

  const [isLightningFlashVisible, setIsLightningFlashVisible] = useState(false);
  const [isCompactSettingsViewport, setIsCompactSettingsViewport] = useState(false);
  const settingsPopoverRef = useRef(null);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const mediaQuery = window.matchMedia("(max-width: 1024px)");

    const handleViewportChange = () => {
      setIsCompactSettingsViewport(mediaQuery.matches);
    };

    handleViewportChange();
    mediaQuery.addEventListener("change", handleViewportChange);

    return () => {
      mediaQuery.removeEventListener("change", handleViewportChange);
    };
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    const previousThumb = root.style.getPropertyValue("--app-scrollbar-thumb");
    const previousTrack = root.style.getPropertyValue("--app-scrollbar-track");
    const previousHover = root.style.getPropertyValue("--app-scrollbar-thumb-hover");

    root.style.setProperty("--app-scrollbar-thumb", dominantScrollbar);
    root.style.setProperty("--app-scrollbar-track", scrollbarTrack);
    root.style.setProperty("--app-scrollbar-thumb-hover", scrollbarHover);
    document.body.dataset.theme = themeClass;

    return () => {
      root.style.setProperty("--app-scrollbar-thumb", previousThumb || "#6b7280");
      root.style.setProperty("--app-scrollbar-track", previousTrack || "#e5e7eb");
      root.style.setProperty("--app-scrollbar-thumb-hover", previousHover || "#4b5563");
      delete document.body.dataset.theme;
    };
  }, [dominantScrollbar, scrollbarTrack, scrollbarHover, themeClass]);

  useEffect(() => {
    if (!isLightningAllowed) {
      setIsLightningFlashVisible(false);
      return;
    }

    let flashTimeoutId;
    let hideTimeoutId;
    let cancelled = false;

    const scheduleFlash = () => {
      const nextDelay = Math.random() * (LIGHTNING_MAX_DELAY_MS - LIGHTNING_MIN_DELAY_MS) + LIGHTNING_MIN_DELAY_MS;

      flashTimeoutId = window.setTimeout(() => {
        if (cancelled) {
          return;
        }

        setIsLightningFlashVisible(true);

        hideTimeoutId = window.setTimeout(() => {
          if (!cancelled) {
            setIsLightningFlashVisible(false);
          }
        }, Math.random() * (LIGHTNING_MAX_FLASH_MS - LIGHTNING_MIN_FLASH_MS) + LIGHTNING_MIN_FLASH_MS);

        scheduleFlash();
      }, nextDelay);
    };

    scheduleFlash();

    return () => {
      cancelled = true;
      window.clearTimeout(flashTimeoutId);
      window.clearTimeout(hideTimeoutId);
    };
  }, [isLightningAllowed]);

  useEffect(() => {
    if (!isControlPanelOpen || controlsPresentation !== "sidebar-popover") {
      return undefined;
    }

    const handlePointerDownOutside = (event) => {
      const eventTarget = event.target;

      if (!(eventTarget instanceof Element)) {
        return;
      }

      if (eventTarget.closest("[data-settings-toggle='true']")) {
        return;
      }

      if (settingsPopoverRef.current?.contains(eventTarget)) {
        return;
      }

      onCloseControlPanel?.();
    };

    window.addEventListener("pointerdown", handlePointerDownOutside);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDownOutside);
    };
  }, [controlsPresentation, isControlPanelOpen, onCloseControlPanel]);

  const isSidebarPopoverMode = controlsPresentation === "sidebar-popover";
  const isCompactSidebarPopoverLayout = isSidebarPopoverMode && isCompactSettingsViewport;
  const settingsPopoverPositionStyle = isSidebarPopoverMode
    ? isCompactSidebarPopoverLayout
      ? undefined
      : {
        left: `${isSidebarOpen ? 272 : 96}px`,
        bottom: "16px"
      }
    : undefined;
  const settingsControlsContainerClassName = classNames(
    "z-40 transition-transform transition-opacity duration-300 ease-out",
    isCompactSidebarPopoverLayout
      ? "fixed inset-x-0 bottom-3 flex justify-center px-2"
      : isSidebarPopoverMode
      ? "fixed origin-bottom-left animate-in slide-in-from-left-4 fade-in duration-300"
      : "fixed right-4 top-4 sm:right-8 sm:top-8",
    isCompactSidebarPopoverLayout
      ? (isControlPanelOpen
      ? "pointer-events-auto opacity-100 scale-100"
      : "pointer-events-none opacity-0 scale-95")
      : isControlPanelOpen
      ? "pointer-events-auto translate-x-0 opacity-100"
      : "pointer-events-none -translate-x-4 opacity-0"
  );

  return (
    <div
      className={classNames(
        "relative min-h-screen text-teal-950",
        !isPairingRoute && "overflow-x-hidden",
        "transition-colors duration-[2500ms] ease-in-out",
        themeClass
      )}
    >
      <div className="pointer-events-none fixed inset-0 z-[-1] overflow-hidden">
        <svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" className="h-full w-full">
          <defs>
            <linearGradient id="skyGradient" x1="0" y1="0" x2="0" y2="1">
              <stop
                offset="0%"
                stopColor={mixHex(skyTop, "#f8fafc", weather.skyDesaturate * 0.08)}
                style={{ transition: "stop-color 3000ms ease-in-out" }}
              />
              <stop
                offset="100%"
                stopColor={mixHex(skyBottom, "#f8fafc", weather.skyDesaturate * 0.12)}
                style={{ transition: "stop-color 3000ms ease-in-out" }}
              />
            </linearGradient>

            <filter id="sunBlurOuter" x="-200%" y="-200%" width="500%" height="500%">
              <feGaussianBlur stdDeviation="40" />
            </filter>

            <filter id="sunBlurMid" x="-160%" y="-160%" width="420%" height="420%">
              <feGaussianBlur stdDeviation="22" />
            </filter>

            <filter id="moonBlur" x="-180%" y="-180%" width="460%" height="460%">
              <feGaussianBlur stdDeviation="16" />
            </filter>

            <radialGradient id="cozyCoreGradient" cx="50%" cy="45%" r="58%">
              <stop offset="0%" stopColor="rgba(252,211,77,0.5)" />
              <stop offset="60%" stopColor="rgba(245,158,11,0.18)" />
              <stop offset="100%" stopColor="rgba(245,158,11,0)" />
            </radialGradient>

            <filter id="cloudBlur" x="-60%" y="-60%" width="220%" height="220%">
              <feGaussianBlur stdDeviation="4" />
            </filter>
          </defs>

          <rect
            x="0"
            y="0"
            width="1600"
            height="900"
            fill="url(#skyGradient)"
            className="transition-all duration-[3000ms] ease-in-out"
          />

          <g opacity={time.starsOpacity}>
            {stars.map((star) => (
              <circle key={`${star.x}-${star.y}`} cx={star.x} cy={star.y} r={star.r} fill="#ffffff" />
            ))}
          </g>

          <g
            style={{
              transform: `translate(${sunTranslateX}px, ${sunTranslateY}px) scale(${sunScale})`,
              transformOrigin: "1220px 145px",
              opacity: time.sunCoreOpacity * (1 - weather.terrainDarken * 0.42),
              transition: "all 3000ms ease-in-out"
            }}
          >
            <circle
              cx="1220"
              cy="145"
              r={104 * 2.9}
              fill={sunColor}
              filter="url(#sunBlurOuter)"
              opacity={time.glowOuter}
              style={{ transition: "all 3000ms ease-in-out" }}
            />
            <circle
              cx="1220"
              cy="145"
              r={104 * 2.05}
              fill={sunColor}
              filter="url(#sunBlurMid)"
              opacity={time.glowMid}
              style={{ transition: "all 3000ms ease-in-out" }}
            />
            <circle
              cx="1220"
              cy="145"
              r={104 * 1.35}
              fill={sunColor}
              opacity={time.glowSoft}
              style={{ transition: "all 3000ms ease-in-out" }}
            />
            <circle
              cx="1220"
              cy="145"
              r="104"
              fill={sunColor}
              opacity={0.92}
              style={{ transition: "all 3000ms ease-in-out" }}
            />
          </g>

          <g
            style={{
              transform: `translate(${moonTranslateX}px, ${moonTranslateY}px)`,
              transformOrigin: "1260px 145px",
              opacity: activeMoon.opacity * (time.moonOpacity + weather.terrainDarken * 0.05),
              transition: "all 3000ms ease-in-out"
            }}
          >
            <circle cx="1260" cy="145" r="58" fill="#ffffff" filter="url(#moonBlur)" opacity="0.35" />
            <circle cx="1260" cy="145" r="35" fill="#f8fafc" />
            <circle cx="1273" cy="141" r="29" fill={skyTop} opacity="0.82" />
          </g>

          <g style={scenicTransitionStyle}>
            <CloudCluster
              x={120}
              y={122}
              scale={1.1}
              fill={cloudLightColor}
              opacity={cloudOpacity.light}
              filter="url(#cloudBlur)"
            />
            <CloudCluster
              x={1260}
              y={108}
              scale={1.08}
              fill={cloudLightColor}
              opacity={cloudOpacity.light * 0.95}
              filter="url(#cloudBlur)"
            />

            <g className={canopyCloudClass} opacity={cloudOpacity.canopy} filter="url(#cloudBlur)">
              <path
                d="M0 0 H1600 V300 C1460 282 1280 332 1110 300 C900 260 690 340 460 300 C290 270 130 308 0 292 Z"
                fill={cloudRainColor}
              />
              <ellipse cx="260" cy="238" rx="250" ry="86" fill={cloudRainColor} />
              <ellipse cx="760" cy="226" rx="290" ry="98" fill={cloudRainColor} />
              <ellipse cx="1250" cy="242" rx="300" ry="92" fill={cloudRainColor} />
            </g>

            <g className={stormCloudClass} opacity={cloudOpacity.storm} filter="url(#cloudBlur)">
              <path
                d="M0 0 H1600 V262 C1450 236 1240 278 1010 250 C780 220 560 300 330 270 C220 258 102 274 0 262 Z"
                fill={cloudStormColor}
              />
              <ellipse cx="390" cy="196" rx="300" ry="96" fill={cloudStormColor} />
              <ellipse cx="900" cy="188" rx="340" ry="108" fill={cloudStormColor} />
              <ellipse cx="1360" cy="214" rx="250" ry="92" fill={cloudStormColor} />
            </g>
          </g>

          <path
            d="M0 515 C220 430, 450 610, 730 528 C980 452, 1230 595, 1600 520 L1600 900 L0 900 Z"
            fill={hillBack}
            opacity="0.9"
            style={scenicTransitionStyle}
          />
          <path
            d="M0 585 C250 515, 470 680, 760 605 C1030 540, 1260 695, 1600 620 L1600 900 L0 900 Z"
            fill={hillMid}
            opacity="0.95"
            style={scenicTransitionStyle}
          />
          <path
            d="M0 660 C230 612, 520 745, 790 690 C1060 640, 1310 760, 1600 700 L1600 900 L0 900 Z"
            fill={hillFront}
            opacity="0.98"
            style={scenicTransitionStyle}
          />

          <path
            d="M0 735 C230 700, 480 785, 760 742 C1050 700, 1320 790, 1600 748 L1600 900 L0 900 Z"
            fill={wave1}
            opacity="0.95"
            style={scenicTransitionStyle}
          />
          <path
            d="M0 790 C190 765, 450 835, 760 800 C1060 770, 1300 845, 1600 812 L1600 900 L0 900 Z"
            fill={wave2}
            opacity="0.95"
            style={scenicTransitionStyle}
          />
          <path
            d="M0 842 C210 825, 470 880, 760 852 C1030 828, 1315 885, 1600 860 L1600 900 L0 900 Z"
            fill={wave3}
            opacity="0.98"
            style={scenicTransitionStyle}
          />

          <g style={scenicTransitionStyle}>
            <rect x="1240" y="430" width="56" height="265" rx="24" fill={trunkColor} />
            <path d="M1268 510 C1216 488, 1192 446, 1205 394 C1224 402, 1249 445, 1268 482 Z" fill={trunkColor} opacity="0.86" />
            <path d="M1268 566 C1320 550, 1358 510, 1374 462 C1348 468, 1312 506, 1288 546 Z" fill={trunkColor} opacity="0.9" />
          </g>

          <g opacity={season.canopyOpacity} style={scenicTransitionStyle}>
            <circle cx="1265" cy="360" r="64" fill={canopyColors[0]} />
            <circle cx="1215" cy="395" r="56" fill={canopyColors[1]} />
            <circle cx="1328" cy="396" r="59" fill={canopyColors[2]} />
            <circle cx="1278" cy="438" r="60" fill={canopyColors[3]} />
            <circle cx="1200" cy="338" r="40" fill={canopyColors[2]} opacity="0.9" />
            <circle cx="1347" cy="336" r="44" fill={canopyColors[1]} opacity="0.88" />
          </g>

          <rect
            x="0"
            y="0"
            width="1600"
            height="900"
            fill="url(#cozyCoreGradient)"
            opacity={safeWeather === "stormy" ? 0.44 : 0}
            style={scenicTransitionStyle}
          />
        </svg>
      </div>

      <div className="pointer-events-none fixed inset-x-0 top-0 z-[1] h-[60vh] overflow-hidden">
        {particleMode === "seasonal" &&
          seasonalParticles.map((particle, index) => (
            <span
              key={`seasonal-${particle.left}-${index}`}
              className={classNames(
                "sky-particle absolute inline-block",
                season.seasonalParticleClass,
                season.seasonalParticleRadius,
                safeSeason === "summer" || safeSeason === "autumn" ? "origin-center" : ""
              )}
              style={{
                left: particle.left,
                top: particle.top,
                width: `${particle.size}px`,
                height: `${safeSeason === "winter" ? particle.size : particle.size * 1.4}px`,
                transform:
                  safeSeason === "summer" || safeSeason === "autumn" ? "skewX(-10deg)" : "none",
                "--particle-duration": `${particle.duration}s`,
                "--particle-delay": `${particle.delay}s`,
                "--particle-drift": `${particle.drift}px`,
                "--particle-spin": `${particle.spin}deg`
              }}
            />
          ))}

        {particleMode === "rain-calm" &&
          calmRainParticles.map((particle, index) => (
            <span
              key={`rain-calm-${particle.left}-${index}`}
              className="rain-particle absolute inline-block rounded-full bg-gradient-to-b from-sky-100/85 to-cyan-200/20"
              style={{
                left: particle.left,
                top: particle.top,
                width: `${particle.width}px`,
                height: `${particle.height}px`,
                opacity: 0.74,
                "--rain-duration": `${particle.duration}s`,
                "--rain-delay": `${particle.delay}s`,
                "--rain-drift": `${particle.drift}px`
              }}
            />
          ))}

        {particleMode === "storm-rain" &&
          dynamicStormRainParticles.map((particle, index) => (
            <span
              key={`rain-storm-${particle.left}-${index}`}
              className="rain-particle absolute inline-block rounded-full bg-gradient-to-b from-slate-50/95 to-cyan-300/35"
              style={{
                left: particle.left,
                top: particle.top,
                width: `${particle.width}px`,
                height: `${particle.height}px`,
                opacity: 0.95,
                "--rain-duration": `${particle.duration}s`,
                "--rain-delay": `${particle.delay}s`,
                "--rain-drift": `${particle.drift}px`,
                transform: `rotate(${particle.tilt}deg)`
              }}
            />
          ))}

        {particleMode === "snow-rainy" &&
          snowyRainParticles.map((particle, index) => (
            <span
              key={`snow-rainy-${particle.left}-${index}`}
              className="snow-particle absolute inline-block rounded-full bg-white/85"
              style={{
                left: particle.left,
                top: particle.top,
                width: `${particle.size}px`,
                height: `${particle.size}px`,
                "--snow-duration": `${particle.duration}s`,
                "--snow-delay": `${particle.delay}s`,
                "--snow-drift": `${particle.drift}px`,
                "--snow-spin": `${particle.spin}deg`
              }}
            />
          ))}

        {particleMode === "blizzard" &&
          dynamicBlizzardParticles.map((particle, index) => (
            <span
              key={`blizzard-${particle.left}-${index}`}
              className="blizzard-particle absolute inline-block rounded-full bg-white/90"
              style={{
                left: particle.left,
                top: particle.top,
                width: `${particle.size}px`,
                height: `${particle.size * 0.9}px`,
                "--blizzard-duration": `${particle.duration}s`,
                "--blizzard-delay": `${particle.delay}s`,
                "--blizzard-drift": `${particle.drift}px`,
                "--blizzard-spin": `${particle.spin}deg`,
                transform: `rotate(${particle.tilt}deg)`
              }}
            />
          ))}
      </div>

      <div
        className={classNames(
          "pointer-events-none fixed inset-0 z-50 transition-opacity duration-100",
          isLightningAllowed && isLightningFlashVisible ? "opacity-100" : "opacity-0"
        )}
      >
        <svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 h-full w-full">
          <defs>
            <filter id="lightningGlow" x="-200%" y="-200%" width="500%" height="500%">
              <feGaussianBlur stdDeviation="3" result="coloredBlur" />
              <feMerge>
                <feMergeNode in="coloredBlur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <path
            d="M1038 138 L1012 208 L1042 208 L997 332 L1030 332 L972 478"
            fill="none"
            stroke="rgba(255,255,255,0.96)"
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
            filter="url(#lightningGlow)"
          />
          <path
            d="M1014 248 L972 298"
            fill="none"
            stroke="rgba(255,248,210,0.92)"
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
            filter="url(#lightningGlow)"
          />
          <path
            d="M1024 290 L1066 336"
            fill="none"
            stroke="rgba(255,248,210,0.9)"
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
            filter="url(#lightningGlow)"
          />
        </svg>
        <div className="h-full w-full bg-gradient-to-b from-white/80 via-white/35 to-transparent" />
      </div>

      <div
        ref={settingsPopoverRef}
        className={settingsControlsContainerClassName}
        style={settingsPopoverPositionStyle}
      >
        <div className={classNames(
          "glass-internal-blur max-h-[calc(100dvh-1.5rem)] overflow-y-auto rounded-3xl border border-white/10 bg-black/40 shadow-[0_20px_60px_rgba(0,0,0,0.45)] md:max-h-none md:overflow-visible",
          isCompactSidebarPopoverLayout
            ? "w-full max-w-[34rem] p-4"
            : "w-[min(95vw,46rem)] p-5 sm:p-6"
        )}>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-4">
            <div className="space-y-3">
              <div className="space-y-2 rounded-2xl border border-white/10 bg-black/25 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/65">Season</p>
              <ControlPill className="border-white/20 bg-white/10">
                <IndicatorRow
                  items={seasonItems}
                  activeKey={safeSeason}
                  onSelect={setSeason}
                  accentClass={season.widgetAccent}
                  ringClass={season.widgetRing}
                />
              </ControlPill>
              </div>

              <div className="space-y-2 rounded-2xl border border-white/10 bg-black/25 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/65">Weather</p>
              <ControlPill className="border-white/20 bg-white/10">
                <IndicatorRow
                  items={weatherItems}
                  activeKey={safeWeather}
                  onSelect={setWeather}
                  accentClass={safeWeather === "stormy" ? "text-indigo-800" : "text-teal-800"}
                  ringClass={safeWeather === "stormy" ? "ring-indigo-200/90" : "ring-teal-200/90"}
                />
              </ControlPill>
              </div>

              <div className="space-y-2 rounded-2xl border border-white/10 bg-black/25 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/65">Time</p>
              <ControlPill className="border-white/20 bg-white/10">
                <IndicatorRow
                  items={timeItems}
                  activeKey={safeTimeOfDay}
                  onSelect={setTimeOfDay}
                  accentClass={safeTimeOfDay === "night" ? "text-indigo-900" : "text-amber-700"}
                  ringClass={safeTimeOfDay === "night" ? "ring-indigo-200/90" : "ring-amber-200/90"}
                />
              </ControlPill>
              </div>

              <div className="space-y-2 rounded-2xl border border-white/10 bg-black/25 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/65">Text Size</p>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { key: "small", label: "Small", iconSize: 14 },
                  { key: "medium", label: "Medium", iconSize: 22 },
                  { key: "large", label: "Large", iconSize: 32 }
                ].map((sizeOption) => {
                  const isActive = safeTextSize === sizeOption.key;

                  return (
                    <button
                      key={sizeOption.key}
                      type="button"
                      onClick={() => {
                        setTextSize(sizeOption.key);
                      }}
                      aria-pressed={isActive}
                      aria-label={`Set text size to ${sizeOption.label}`}
                      className={classNames(
                        "inline-flex h-10 items-center justify-center rounded-xl border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60",
                        isActive
                          ? "border-white/40 bg-white/20 text-white"
                          : "border-white/15 bg-white/5 text-white/65 hover:bg-white/10"
                      )}
                    >
                      <Type size={sizeOption.iconSize} strokeWidth={2.2} />
                    </button>
                  );
                })}
              </div>
              </div>
            </div>

            <div className="space-y-3">
              <div className="space-y-3 rounded-2xl border border-white/10 bg-black/25 p-3">
              <div className="flex items-center justify-between gap-3">
                <span className="whitespace-nowrap text-xs font-semibold uppercase tracking-[0.18em] text-white/75">
                  Auto Play
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setIsAutoPlay((previousValue) => !previousValue);
                  }}
                  className={classNames(
                    "inline-flex h-6 w-11 shrink-0 items-center rounded-full border p-0.5 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50",
                    isAutoPlayEnabled
                      ? "border-white/45 bg-white/70"
                      : "border-white/20 bg-white/10 hover:bg-white/20"
                  )}
                  role="switch"
                  aria-checked={isAutoPlayEnabled}
                  aria-label={isAutoPlayEnabled ? "Pause auto-play" : "Resume auto-play"}
                >
                  <span
                    className={classNames(
                      "h-5 w-5 rounded-full bg-black/70 shadow-[0_2px_8px_rgba(15,23,42,0.35)] transition-transform duration-300",
                      isAutoPlayEnabled ? "translate-x-5" : "translate-x-0"
                    )}
                  />
                </button>
              </div>

              {isAutoPlayEnabled && (
                <div className="flex w-full items-center gap-2">
                  <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-white/55">Slow</span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={autoPlaySpeedValue}
                    onChange={(event) => {
                      const parsedValue = Number(event.target.value);

                      if (!Number.isFinite(parsedValue)) {
                        return;
                      }

                      setAutoPlaySpeed(clamp(parsedValue, 0, 100));
                    }}
                    className="ambient-speed-slider flex-1"
                    aria-label="Auto-play speed"
                  />
                  <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-white/55">Fast</span>
                </div>
              )}

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsSoundMuted((previousValue) => !previousValue);
                  }}
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white/80 shadow-[0_8px_20px_rgba(15,23,42,0.18)] transition hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                  aria-pressed={!isSoundMuted}
                  aria-label={isSoundMuted ? "Unmute ambient sound" : "Mute ambient sound"}
                >
                  {isSoundMuted ? <VolumeX size={15} strokeWidth={2.2} /> : <Volume2 size={15} strokeWidth={2.2} />}
                </button>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={safeAmbientVolumeSliderValue}
                  onChange={(event) => {
                    const parsedValue = Number(event.target.value);

                    if (!Number.isFinite(parsedValue)) {
                      return;
                    }

                    setSoundVolume(clamp(parsedValue, 0, 100));
                  }}
                  className={classNames("ambient-speed-slider flex-1", isSoundMuted ? "opacity-70" : "opacity-100")}
                  aria-label="Ambient volume"
                />
                <span className="w-8 text-right font-mono text-[10px] tabular-nums text-white/55">
                  {`${Math.round(safeAmbientVolumeSliderValue)}%`}
                </span>
              </div>
              </div>

              <div className="space-y-3 rounded-2xl border border-white/10 bg-black/25 p-3">
              <div className="flex items-center justify-between gap-3">
                <span className="whitespace-nowrap text-xs font-semibold uppercase tracking-[0.18em] text-white/75">
                  Notifications
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsNotificationMuted((previousValue) => !previousValue);
                  }}
                  className="inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full border border-white/20 bg-white/10 text-white/80 shadow-[0_8px_20px_rgba(15,23,42,0.18)] transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                  aria-pressed={!isNotificationMuted}
                  aria-label={isNotificationMuted ? "Unmute notifications" : "Mute notifications"}
                >
                  {isNotificationMuted
                    ? <BellOff size={15} strokeWidth={2.2} />
                    : <Bell size={15} strokeWidth={2.2} />}
                </button>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={safeNotificationVolumeSliderValue}
                  onChange={(event) => {
                    const parsedValue = Number(event.target.value);
                    if (!Number.isFinite(parsedValue)) {
                      return;
                    }

                    setNotificationVolume(clamp(parsedValue, 0, 100));
                  }}
                  className={classNames(
                    "ambient-speed-slider flex-1",
                    isNotificationMuted ? "opacity-70" : "opacity-100"
                  )}
                  aria-label="Notification volume"
                />
                <span className="w-8 text-right font-mono text-[10px] tabular-nums text-white/55">
                  {`${Math.round(safeNotificationVolumeSliderValue)}%`}
                </span>
              </div>
              </div>

              <div className="space-y-2 rounded-2xl border border-white/10 bg-black/25 p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-white/75">
                  <Sparkles size={14} strokeWidth={2.1} />
                  <span>Celebrate Mode</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    console.log(
                      "[SettingsUI] TOGGLE APĂSAT - Valoare context existenta:",
                      isCelebrateMode,
                      "-> Schimb in:",
                      !isCelebrateMode
                    );
                    setIsCelebrateMode(!isCelebrateMode);
                  }}
                  className={classNames(
                    "inline-flex h-6 w-11 shrink-0 items-center rounded-full border p-0.5 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50",
                    isCelebrateMode
                      ? "border-white/45 bg-white/70"
                      : "border-white/20 bg-white/10 hover:bg-white/20"
                  )}
                  role="switch"
                  aria-checked={isCelebrateMode}
                  aria-label={isCelebrateMode ? "Disable Celebrate Mode" : "Enable Celebrate Mode"}
                >
                  <span
                    className={classNames(
                      "h-5 w-5 rounded-full bg-black/70 shadow-[0_2px_8px_rgba(15,23,42,0.35)] transition-transform duration-300",
                      isCelebrateMode ? "translate-x-5" : "translate-x-0"
                    )}
                  />
                </button>
              </div>

              {isCelebrateMode && (
                <div className="flex w-full items-center gap-2 rounded-xl border border-white/10 bg-black/20 p-2.5">
                  <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-white/55">Rare</span>
                  <input
                    type="range"
                    min={1}
                    max={100}
                    step={1}
                    value={safeFireworksIntensity}
                    onChange={(event) => {
                      const parsedValue = Number(event.target.value);
                      if (!Number.isFinite(parsedValue)) {
                        return;
                      }

                      setFireworksIntensity(clamp(parsedValue, 1, 100));
                    }}
                    className="ambient-speed-slider flex-1"
                    aria-label="Celebrate fireworks intensity"
                  />
                  <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-white/55">Wild</span>
                  <span className="w-9 text-right font-mono text-[10px] tabular-nums text-white/55">
                    {`${Math.round(safeFireworksIntensity)}%`}
                  </span>
                </div>
              )}
              </div>
            </div>

            <div className="border-t border-white/10 pt-4 md:col-span-2">
              <button
                type="button"
                onClick={() => {
                  onLogout?.();
                }}
                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-semibold uppercase tracking-[0.1em] text-white/80 transition hover:bg-red-500/20 hover:text-red-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300/60"
              >
                <LogOut size={15} strokeWidth={2.2} />
                <span>Logout</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <div
        className={classNames(
          "relative z-10 mx-auto w-full max-w-6xl",
          isPairingRoute || isRelaxRoute
            ? "h-[100dvh] px-0 py-0"
            : "px-4 py-10 sm:px-8 sm:py-14 lg:py-16"
        )}
      >
        {children}
      </div>
    </div>
  );
}

const FIREWORK_SOUND_URLS = {
  launch: "/sounds/firework_launch.mp3",
  explodeFizzle: "/sounds/firework_explode_fizzle.mp3"
};

let audioContext = null;
let unlockHandlersBound = false;

const decodedBufferByUrl = new Map();
const loadingPromiseByUrl = new Map();

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function sliderValueToNotificationGain(sliderValue) {
  const safeSliderValue = clamp(Number(sliderValue), 0, 100);
  const normalizedValue = safeSliderValue / 100;

  return Math.pow(normalizedValue, 1.7);
}

function getAudioContext() {
  if (typeof window === "undefined") {
    return null;
  }

  if (audioContext) {
    return audioContext;
  }

  const AudioContextClass = window.AudioContext || window.webkitAudioContext;

  if (!AudioContextClass) {
    return null;
  }

  audioContext = new AudioContextClass({ latencyHint: "interactive" });
  return audioContext;
}

async function loadDecodedBuffer(url) {
  if (decodedBufferByUrl.has(url)) {
    return decodedBufferByUrl.get(url);
  }

  if (loadingPromiseByUrl.has(url)) {
    return loadingPromiseByUrl.get(url);
  }

  const ctx = getAudioContext();

  if (!ctx) {
    return null;
  }

  const loadPromise = fetch(url)
    .then((response) => {
      if (!response.ok) {
        throw new Error(`Failed to fetch audio file: ${url}`);
      }

      return response.arrayBuffer();
    })
    .then((arrayBuffer) => {
      return new Promise((resolve, reject) => {
        ctx.decodeAudioData(arrayBuffer.slice(0), resolve, reject);
      });
    })
    .then((decodedBuffer) => {
      decodedBufferByUrl.set(url, decodedBuffer);
      loadingPromiseByUrl.delete(url);
      return decodedBuffer;
    })
    .catch(() => {
      loadingPromiseByUrl.delete(url);
      return null;
    });

  loadingPromiseByUrl.set(url, loadPromise);
  return loadPromise;
}

async function unlockAndPrimeAudioContext() {
  const ctx = getAudioContext();

  if (!ctx) {
    return;
  }

  if (ctx.state === "suspended") {
    try {
      await ctx.resume();
    } catch {
      // Ignore rejected resume calls from browser policies.
    }
  }

  await Promise.all(Object.values(FIREWORK_SOUND_URLS).map((url) => loadDecodedBuffer(url)));
}

export function registerFireworksAudioUnlockHandlers() {
  if (unlockHandlersBound || typeof window === "undefined") {
    return;
  }

  unlockHandlersBound = true;

  const unlockAudio = () => {
    unlockAndPrimeAudioContext().catch(() => {
      // Best effort warm-up.
    });
  };

  window.addEventListener("pointerdown", unlockAudio, { passive: true });
  window.addEventListener("touchstart", unlockAudio, { passive: true });
  window.addEventListener("keydown", unlockAudio);
}

export function primeFireworksAudio() {
  unlockAndPrimeAudioContext().catch(() => {
    // Best effort warm-up.
  });
}

export function prepareFireworksSound(type) {
  const sourceUrl = FIREWORK_SOUND_URLS[type];

  if (!sourceUrl) {
    return;
  }

  const ctx = getAudioContext();

  if (ctx && ctx.state === "suspended") {
    void ctx.resume().catch(() => {
      // Resume may fail until user gesture.
    });
  }

  void loadDecodedBuffer(sourceUrl);
}

export function getFireworksAudioCompensationMs() {
  const ctx = getAudioContext();

  if (!ctx) {
    return 0;
  }

  const baseLatencyMs = Number.isFinite(ctx.baseLatency) ? ctx.baseLatency * 1000 : 0;
  const outputLatencyMs = Number.isFinite(ctx.outputLatency) ? ctx.outputLatency * 1000 : 0;

  return clamp(baseLatencyMs + outputLatencyMs, 0, 180);
}

export function playFireworksSound(type, {
  notificationVolume = 50,
  isNotificationMuted = false,
  volumeMultiplier = 1,
  scheduledPerformanceTimeMs,
  latencyCompensationMs = 0
} = {}) {
  if (isNotificationMuted) {
    return;
  }

  const sourceUrl = FIREWORK_SOUND_URLS[type];

  if (!sourceUrl) {
    return;
  }

  const playDecoded = () => {
    const ctx = getAudioContext();

    if (!ctx) {
      return;
    }

    const decodedBuffer = decodedBufferByUrl.get(sourceUrl);

    if (!decodedBuffer) {
      void loadDecodedBuffer(sourceUrl);
      return;
    }

    if (ctx.state === "suspended") {
      void ctx.resume().then(() => {
        playFireworksSound(type, {
          notificationVolume,
          isNotificationMuted,
          volumeMultiplier
        });
      });
      return;
    }

    const gainNode = ctx.createGain();
    const sourceNode = ctx.createBufferSource();
    const baseGain = sliderValueToNotificationGain(notificationVolume);
    const hasScheduledTime = Number.isFinite(scheduledPerformanceTimeMs);
    const delayMs = hasScheduledTime
      ? Number(scheduledPerformanceTimeMs) - performance.now() - clamp(Number(latencyCompensationMs), 0, 250)
      : 0;
    const startTime = ctx.currentTime + Math.max(delayMs, 0) / 1000;

    gainNode.gain.value = clamp(baseGain * volumeMultiplier, 0, 1);
    sourceNode.buffer = decodedBuffer;
    sourceNode.connect(gainNode);
    gainNode.connect(ctx.destination);

    sourceNode.start(startTime);
  };

  if (decodedBufferByUrl.has(sourceUrl)) {
    playDecoded();
    return;
  }

  void loadDecodedBuffer(sourceUrl).then(() => {
    playDecoded();
  });
}

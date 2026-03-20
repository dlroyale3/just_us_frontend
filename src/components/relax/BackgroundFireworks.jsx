import { useCallback, useEffect, useRef } from "react";
import {
  getFireworksAudioCompensationMs,
  playFireworksSound,
  prepareFireworksSound,
  primeFireworksAudio,
  registerFireworksAudioUnlockHandlers
} from "../../utils/fireworksAudio";

const PROJECTILE_GRAVITY = 0.05;
const PARTICLE_GRAVITY = 0.02;
const AIR_FRICTION = 0.98;
const PROJECTILE_HISTORY_LIMIT = 15;
const INTENSITY_MIN = 1;
const INTENSITY_MAX = 100;
const LAUNCH_INTERVAL_SLOW_MS = 3000;
const LAUNCH_INTERVAL_FAST_MS = 300;
const AUTO_LAUNCH_SECTORS = 5;
const LAUNCH_AUDIO_PREP_LOOKAHEAD_MS = 220;
const LAUNCH_SOUND_VOLUME_MULTIPLIER = 0.25;
const CELEBRATE_LAUNCH_AUDIO_ADVANCE_MS = 102;
const AUTO_LAUNCH_FALLBACK_VISUAL_DELAY_FACTOR = 0.9;
const AUTO_LAUNCH_FALLBACK_MAX_VISUAL_DELAY_MS = 145;
const SHELL_TYPES = [
  { name: "RedGreenPeony", colors: [0, 120], hasCrackle: false },
  { name: "SolidRed", colors: [0], hasCrackle: false },
  { name: "PurpleKamuro", colors: [280], trailColor: "hsl(45, 100%, 75%)", hasCrackle: false },
  { name: "TitaniumSalute", colors: [-1], hasCrackle: true, crackleIntensity: 0.9 },
  { name: "ClassicBlue", colors: [220], hasCrackle: false },
  { name: "PurpleWhite", colors: [280, -1], hasCrackle: true, crackleIntensity: 0.4 }
];

function randomInRange(min, max) {
  return Math.random() * (max - min) + min;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function randomInt(min, max) {
  return Math.floor(randomInRange(min, max + 1));
}

function intensityToLaunchIntervalMs(intensity) {
  const safeIntensity = clamp(Number(intensity), INTENSITY_MIN, INTENSITY_MAX);
  const normalized = (safeIntensity - INTENSITY_MIN) / (INTENSITY_MAX - INTENSITY_MIN);
  return Math.round(LAUNCH_INTERVAL_SLOW_MS - normalized * (LAUNCH_INTERVAL_SLOW_MS - LAUNCH_INTERVAL_FAST_MS));
}

function pickBurstTargetY(height) {
  const roll = Math.random();

  // 74% around the middle of the sky, using a bell curve for smoother clustering.
  if (roll < 0.74) {
    const bell = (Math.random() + Math.random() + Math.random()) / 3;
    return height * (0.22 + bell * 0.16);
  }

  // 21% slightly above sky middle.
  if (roll < 0.95) {
    const aboveBias = Math.sqrt(Math.random());
    return height * (0.12 + aboveBias * 0.12);
  }

  // 5% below sky middle (rare).
  const lowBias = Math.pow(Math.random(), 1.8);
  return height * (0.38 + lowBias * 0.1);
}

class Projectile {
  constructor({ x, y, vx, vy, targetBurstY }) {
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.targetBurstY = targetBurstY;
    this.apexVelocityThreshold = -0.08;
    this.burstWindowPx = 12;
    this.history = [];
    this.dead = false;
    this.shouldExplode = false;
  }

  update() {
    this.history.push({ x: this.x, y: this.y });

    if (this.history.length > PROJECTILE_HISTORY_LIMIT) {
      this.history.shift();
    }

    this.x += this.vx;
    this.y += this.vy;
    this.vx *= AIR_FRICTION;
    this.vy += PROJECTILE_GRAVITY;

    // Burst at apex, but only once shell has reached its target altitude band.
    const isInsideTargetBand = this.y <= this.targetBurstY + this.burstWindowPx;
    const isNearApex = this.vy >= this.apexVelocityThreshold;

    if (isInsideTargetBand && isNearApex) {
      this.dead = true;
      this.shouldExplode = true;
    }
  }

  draw(ctx) {
    if (this.history.length > 1) {
      ctx.strokeStyle = "#fffdee";
      ctx.lineWidth = 3.6;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(this.history[0].x, this.history[0].y);

      for (let index = 1; index < this.history.length; index += 1) {
        const point = this.history[index];
        ctx.lineTo(point.x, point.y);
      }

      ctx.stroke();
    }

    ctx.fillStyle = "hsl(45, 100%, 92%)";
    ctx.globalAlpha = 0.95;
    ctx.beginPath();
    ctx.arc(this.x, this.y, 3.3, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = 0.45;
    ctx.beginPath();
    ctx.arc(this.x, this.y, 7.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

class Particle {
  constructor({ x, y, vx, vy, size, life, colorCode, profile }) {
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.size = size;
    this.life = life;
    this.maxLife = life;
    this.profile = profile;
    this.baseColor = colorCode === -1 ? "hsl(0, 0%, 100%)" : `hsl(${colorCode}, 100%, 65%)`;
    this.currentColor = this.baseColor;
    this.baseHue = colorCode === -1 ? 0 : colorCode;
    this.initialSpeed = Math.max(Math.hypot(vx, vy), 0.001);
    this.speed = this.initialSpeed;
    this.isSparkling = false;
    this.alpha = 1;
    this.drag = Math.random() * 0.04 + 0.94;
  }

  update(width, height) {
    this.vx *= this.drag;
    this.vy *= this.drag;
    this.vy += PARTICLE_GRAVITY;
    this.x += this.vx;
    this.y += this.vy;
    this.speed = Math.hypot(this.vx, this.vy);
    this.life -= 1;

    if (this.life <= 0) {
      return false;
    }

    const lifeRatio = clamp(this.life / this.maxLife, 0, 1);

    this.isSparkling = this.speed < this.initialSpeed * 0.35 || lifeRatio < 0.6;

    if (this.profile?.trailColor && this.speed < this.initialSpeed * 0.5) {
      this.currentColor = this.profile.trailColor;
      this.alpha = Math.max(lifeRatio, 0.3);
    } else {
      this.currentColor = this.baseColor;
    }

    if (this.isSparkling && Math.random() > 0.1) {
      this.alpha = lifeRatio * (Math.random() * 0.8 + 0.2);
    } else if (!this.profile?.trailColor || this.speed >= this.initialSpeed * 0.5) {
      this.alpha = lifeRatio;
    }

    if (this.x < -140 || this.x > width + 140 || this.y > height + 180) {
      return false;
    }

    return true;
  }

  draw(ctx) {
    if (this.alpha <= 0) {
      return;
    }

    if (this.isSparkling && this.profile?.hasCrackle) {
      if (Math.random() < (this.profile.crackleIntensity ?? 0.4)) {
        ctx.globalAlpha = this.alpha;
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size * 2.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      return;
    }

    if (this.isSparkling && Math.random() < 0.2) {
      ctx.globalAlpha = this.alpha;
      ctx.fillStyle = Math.random() > 0.5 ? "white" : "transparent";
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.size * (Math.random() * 1.5 + 0.5), 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      return;
    }

    ctx.globalCompositeOperation = "lighter";

    // Glow halo pass.
    ctx.globalAlpha = this.alpha * 0.3;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size * 3, 0, Math.PI * 2);
    ctx.fillStyle = `hsla(${this.baseHue}, 100%, 60%, ${this.alpha * 0.3})`;
    ctx.fill();

    // Core pass.
    ctx.globalAlpha = this.alpha;
    ctx.fillStyle = `rgba(255, 255, 255, ${this.alpha})`;

    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

export function BackgroundFireworks({ intensity = 55, notificationVolume = 50, isNotificationMuted = false }) {
  const canvasRef = useRef(null);
  const contextRef = useRef(null);
  const rafIdRef = useRef(0);
  const dimensionsRef = useRef({ width: 0, height: 0 });
  const projectilesRef = useRef([]);
  const particlesRef = useRef([]);
  const flashesRef = useRef([]);
  const lastSectorRef = useRef(-1);
  const isLaunchAudioPreparedRef = useRef(false);
  const isLaunchAudioScheduledRef = useRef(false);
  const scheduledLaunchPerfTimeRef = useRef(0);
  const pendingLaunchTimeoutsRef = useRef([]);
  const intensityRef = useRef(clamp(Number(intensity), INTENSITY_MIN, INTENSITY_MAX));
  const notificationVolumeRef = useRef(clamp(Number(notificationVolume), 0, 100));
  const isNotificationMutedRef = useRef(Boolean(isNotificationMuted));

  useEffect(() => {
    intensityRef.current = clamp(Number(intensity), INTENSITY_MIN, INTENSITY_MAX);
  }, [intensity]);

  useEffect(() => {
    notificationVolumeRef.current = clamp(Number(notificationVolume), 0, 100);
  }, [notificationVolume]);

  useEffect(() => {
    isNotificationMutedRef.current = Boolean(isNotificationMuted);
  }, [isNotificationMuted]);

  useEffect(() => {
    registerFireworksAudioUnlockHandlers();
    primeFireworksAudio();
  }, []);

  const playEffectSound = useCallback((type, volumeMultiplier = 1, playbackOptions = {}) => {
    playFireworksSound(type, {
      notificationVolume: notificationVolumeRef.current,
      isNotificationMuted: isNotificationMutedRef.current,
      volumeMultiplier,
      ...playbackOptions
    });
  }, []);

  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = contextRef.current;

    if (!canvas || !ctx) {
      return;
    }

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = window.innerWidth;
    const height = window.innerHeight;

    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    dimensionsRef.current = { width, height };
  }, []);

  const createExplosion = useCallback((projectile) => {
    // The combined clip contains both the detonation and natural fizzle tail,
    // so it must start exactly when the shell physically bursts.
    playEffectSound("explodeFizzle", 1);
    const profile = SHELL_TYPES[randomInt(0, SHELL_TYPES.length - 1)];

    flashesRef.current.push({
      x: projectile.x,
      y: projectile.y,
      radius: randomInRange(40, 50),
      alpha: 0.8,
      life: 1
    });

    const rand = Math.random();
    let particleCount;
    let explosionForce;

    if (rand > 0.95) {
      particleCount = 400;
      explosionForce = 11;
    } else if (rand > 0.8) {
      particleCount = 250;
      explosionForce = 8;
    } else if (rand > 0.4) {
      particleCount = 150;
      explosionForce = 5;
    } else {
      particleCount = 80;
      explosionForce = 3;
    }

    const nextParticles = [];

    for (let index = 0; index < particleCount; index += 1) {
      const angle = randomInRange(0, Math.PI * 2);
      const sparkBase = randomInRange(0.62, 1.26) * explosionForce;
      const spread = randomInRange(0.74, 1.24);
      const colorCode = profile.colors[randomInt(0, profile.colors.length - 1)];

      const vx = projectile.vx + sparkBase * Math.sin(angle) * spread;
      const vy = projectile.vy + sparkBase * Math.cos(angle) * spread;

      nextParticles.push(
        new Particle({
          x: projectile.x,
          y: projectile.y,
          vx,
          vy,
          size: randomInRange(1.1, 2.8),
          life: randomInt(200, 300),
          colorCode,
          profile
        })
      );
    }

    particlesRef.current.push(...nextParticles);
  }, [playEffectSound]);

  const autoLaunch = useCallback((options = {}) => {
    const { shouldPlayLaunchSound = true } = options;
    const { width, height } = dimensionsRef.current;

    if (!width || !height) {
      return;
    }

    let sector;

    do {
      sector = randomInt(0, AUTO_LAUNCH_SECTORS - 1);
    } while (AUTO_LAUNCH_SECTORS > 1 && sector === lastSectorRef.current);

    lastSectorRef.current = sector;

    const sectorWidth = width / AUTO_LAUNCH_SECTORS;
    const startX = sector * sectorWidth + Math.random() * sectorWidth;
    const startY = height - (Math.random() * height * 0.15);
    const targetBurstY = pickBurstTargetY(height);
    // Occasionally boost horizontal drift so the show includes more pronounced arcs.
    const wideAngleBoost = Math.random() < 0.35 ? 1.45 : 1;
    const vx = (Math.random() - 0.5) * (Math.random() * 6) * wideAngleBoost;
    const deltaY = Math.max(startY - targetBurstY, 40);
    const ballisticVy = -Math.sqrt(2 * PROJECTILE_GRAVITY * deltaY);
    const vy = ballisticVy;

    const nextProjectile = new Projectile({
      x: startX,
      y: startY,
      vx,
      vy,
      targetBurstY
    });

    if (shouldPlayLaunchSound) {
      playEffectSound("launch", LAUNCH_SOUND_VOLUME_MULTIPLIER);

      const hasAudibleFireworksSound = !isNotificationMutedRef.current && notificationVolumeRef.current > 0;
      const visualDelayMs = hasAudibleFireworksSound
        ? clamp(
          Math.round(getFireworksAudioCompensationMs() * AUTO_LAUNCH_FALLBACK_VISUAL_DELAY_FACTOR),
          0,
          AUTO_LAUNCH_FALLBACK_MAX_VISUAL_DELAY_MS
        )
        : 0;

      if (visualDelayMs > 0) {
        const timeoutId = window.setTimeout(() => {
          projectilesRef.current.push(nextProjectile);
          pendingLaunchTimeoutsRef.current = pendingLaunchTimeoutsRef.current.filter((id) => id !== timeoutId);
        }, visualDelayMs);

        pendingLaunchTimeoutsRef.current.push(timeoutId);
      } else {
        projectilesRef.current.push(nextProjectile);
      }
    } else {
      projectilesRef.current.push(nextProjectile);
    }

    isLaunchAudioPreparedRef.current = false;
    isLaunchAudioScheduledRef.current = false;
    scheduledLaunchPerfTimeRef.current = 0;
  }, [playEffectSound]);

  useEffect(() => {
    const canvas = canvasRef.current;

    if (!canvas) {
      return undefined;
    }

    const ctx = canvas.getContext("2d", { alpha: true, desynchronized: true });

    if (!ctx) {
      return undefined;
    }

    contextRef.current = ctx;
    resizeCanvas();
    let lastLaunchTime = performance.now();

    const handleVisibilityChange = () => {
      const currentTime = performance.now();
      lastLaunchTime = currentTime;

      if (!document.hidden) {
        return;
      }

      projectilesRef.current = [];
      particlesRef.current = [];
      flashesRef.current = [];

      const drawingContext = contextRef.current;
      const canvasNode = canvasRef.current;

      if (drawingContext && canvasNode) {
        drawingContext.clearRect(0, 0, canvasNode.width, canvasNode.height);
      }
    };

    const render = () => {
      const drawingContext = contextRef.current;
      const { width, height } = dimensionsRef.current;

      if (!drawingContext || width === 0 || height === 0) {
        rafIdRef.current = window.requestAnimationFrame(render);
        return;
      }

      const currentTime = performance.now();

      if (document.hidden) {
        lastLaunchTime = currentTime;
        const canvasNode = canvasRef.current;

        if (canvasNode) {
          drawingContext.clearRect(0, 0, canvasNode.width, canvasNode.height);
        }

        rafIdRef.current = window.requestAnimationFrame(render);
        return;
      }

      const currentInterval = intensityToLaunchIntervalMs(intensityRef.current);
      const elapsedSinceLastLaunch = currentTime - lastLaunchTime;
      const remainingUntilLaunch = currentInterval - elapsedSinceLastLaunch;
      const predictedLaunchPerfTime = lastLaunchTime + currentInterval;

      if (
        remainingUntilLaunch <= LAUNCH_AUDIO_PREP_LOOKAHEAD_MS
        && remainingUntilLaunch > 0
        && !isLaunchAudioPreparedRef.current
      ) {
        prepareFireworksSound("launch");
        isLaunchAudioPreparedRef.current = true;
      }

      if (
        remainingUntilLaunch <= LAUNCH_AUDIO_PREP_LOOKAHEAD_MS
        && remainingUntilLaunch > 0
        && !isLaunchAudioScheduledRef.current
      ) {
        const latencyCompensationMs = getFireworksAudioCompensationMs();

        playEffectSound("launch", LAUNCH_SOUND_VOLUME_MULTIPLIER, {
          scheduledPerformanceTimeMs: predictedLaunchPerfTime - CELEBRATE_LAUNCH_AUDIO_ADVANCE_MS,
          latencyCompensationMs
        });

        isLaunchAudioScheduledRef.current = true;
        scheduledLaunchPerfTimeRef.current = predictedLaunchPerfTime;
      }

      if (elapsedSinceLastLaunch > currentInterval) {
        const shouldSkipImmediateLaunchSound = isLaunchAudioScheduledRef.current
          && Math.abs(scheduledLaunchPerfTimeRef.current - predictedLaunchPerfTime) <= 20;

        autoLaunch({
          shouldPlayLaunchSound: !shouldSkipImmediateLaunchSound
        });
        lastLaunchTime = currentTime;
      }

      drawingContext.globalCompositeOperation = "destination-out";
      drawingContext.fillStyle = "rgba(0, 0, 0, 0.3)";
      drawingContext.fillRect(0, 0, width, height);
      drawingContext.globalCompositeOperation = "lighter";

      for (let index = flashesRef.current.length - 1; index >= 0; index -= 1) {
        const flash = flashesRef.current[index];
        drawingContext.globalAlpha = flash.alpha;
        drawingContext.fillStyle = "#ffffff";
        drawingContext.beginPath();
        drawingContext.arc(flash.x, flash.y, flash.radius, 0, Math.PI * 2);
        drawingContext.fill();

        flash.life -= 1;
        if (flash.life <= 0) {
          flashesRef.current.splice(index, 1);
        }
      }

      for (let index = projectilesRef.current.length - 1; index >= 0; index -= 1) {
        const projectile = projectilesRef.current[index];
        projectile.update();
        projectile.draw(drawingContext);

        if (!projectile.dead) {
          continue;
        }

        projectilesRef.current.splice(index, 1);

        if (projectile.shouldExplode) {
          createExplosion(projectile);
        }
      }

      for (let index = particlesRef.current.length - 1; index >= 0; index -= 1) {
        const particle = particlesRef.current[index];
        const isAlive = particle.update(width, height);
        particle.draw(drawingContext);

        if (!isAlive) {
          particlesRef.current.splice(index, 1);
        }
      }

      if (projectilesRef.current.length === 0 && particlesRef.current.length === 0 && flashesRef.current.length === 0) {
        const canvasNode = canvasRef.current;

        if (canvasNode) {
          drawingContext.clearRect(0, 0, canvasNode.width, canvasNode.height);
        }
      }

      drawingContext.globalAlpha = 1;
      rafIdRef.current = window.requestAnimationFrame(render);
    };

    rafIdRef.current = window.requestAnimationFrame(render);

    window.addEventListener("resize", resizeCanvas);
    window.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.cancelAnimationFrame(rafIdRef.current);
      window.removeEventListener("resize", resizeCanvas);
      window.removeEventListener("visibilitychange", handleVisibilityChange);

      projectilesRef.current = [];
      particlesRef.current = [];
      flashesRef.current = [];
      pendingLaunchTimeoutsRef.current.forEach((timeoutId) => {
        window.clearTimeout(timeoutId);
      });
      pendingLaunchTimeoutsRef.current = [];
      lastSectorRef.current = -1;
      isLaunchAudioPreparedRef.current = false;
      isLaunchAudioScheduledRef.current = false;
      scheduledLaunchPerfTimeRef.current = 0;
    };
  }, [autoLaunch, createExplosion, playEffectSound, resizeCanvas]);

  return <canvas ref={canvasRef} className="fixed inset-0 pointer-events-none z-[-1]" aria-hidden="true" />;
}

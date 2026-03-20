import { useCallback, useEffect, useRef } from "react";
import {
  getFireworksAudioCompensationMs,
  playFireworksSound,
  prepareFireworksSound,
  primeFireworksAudio,
  registerFireworksAudioUnlockHandlers
} from "../../utils/fireworksAudio";

const GLOBAL_GRAVITY = 0.02;
const AIR_FRICTION = 0.98;
const MAX_GESTURE_POINTS = 3;
const HISTORY_WINDOW_MS = 100;
const CLICK_THRESHOLD = 15;
const PROJECTILE_HISTORY_LIMIT = 15;
const LAUNCH_SOUND_VOLUME_MULTIPLIER = 0.42;
const MANUAL_LAUNCH_BASE_VISUAL_DELAY_MS = 122;
const MANUAL_LAUNCH_VISUAL_DELAY_FACTOR = 0.95;
const MANUAL_LAUNCH_MAX_VISUAL_DELAY_MS = 280;
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

class Projectile {
  constructor({ x, y, vx, vy }) {
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.life = randomInRange(40, 60);
    this.history = [];
    this.dead = false;
    this.shouldExplode = false;
  }

  update() {
    this.history.push({ x: this.x, y: this.y });

    if (this.history.length > PROJECTILE_HISTORY_LIMIT) {
      this.history.shift();
    }

    this.vx *= AIR_FRICTION;
    this.vy *= AIR_FRICTION;
    this.vy += GLOBAL_GRAVITY;
    this.y += this.vy;
    this.x += this.vx;
    this.life -= 1;

    if (this.life <= 0) {
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
    this.vy += GLOBAL_GRAVITY;
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

export function RelaxFireworks({ notificationVolume = 50, isNotificationMuted = false }) {
  const canvasRef = useRef(null);
  const contextRef = useRef(null);
  const rafIdRef = useRef(0);
  const dimensionsRef = useRef({ width: 0, height: 0 });
  const projectilesRef = useRef([]);
  const particlesRef = useRef([]);
  const flashesRef = useRef([]);
  const gestureRef = useRef({
    isPressing: false,
    startPoint: null,
    points: [],
    mouseHistory: []
  });
  const notificationVolumeRef = useRef(clamp(Number(notificationVolume), 0, 100));
  const isNotificationMutedRef = useRef(Boolean(isNotificationMuted));
  const pendingLaunchTimeoutsRef = useRef([]);

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

  const launchProjectileWithCompensation = useCallback((projectile) => {
    const hasAudibleFireworksSound = !isNotificationMutedRef.current && notificationVolumeRef.current > 0;
    const shouldUseVisualDelay = hasAudibleFireworksSound;
    const rawCompensationMs = shouldUseVisualDelay
      ? getFireworksAudioCompensationMs()
      : 0;
    const visualDelayMs = clamp(
      Math.round(
        MANUAL_LAUNCH_BASE_VISUAL_DELAY_MS
        + rawCompensationMs * MANUAL_LAUNCH_VISUAL_DELAY_FACTOR
      ),
      0,
      MANUAL_LAUNCH_MAX_VISUAL_DELAY_MS
    );

    // For manual launches, immediate audio plus a small visual delay yields
    // a more natural midpoint sync than additional scheduling layers.
    playEffectSound("launch", LAUNCH_SOUND_VOLUME_MULTIPLIER);

    if (visualDelayMs <= 0) {
      projectilesRef.current.push(projectile);
      return;
    }

    const timeoutId = window.setTimeout(() => {
      projectilesRef.current.push(projectile);
      pendingLaunchTimeoutsRef.current = pendingLaunchTimeoutsRef.current.filter((id) => id !== timeoutId);
    }, visualDelayMs);

    pendingLaunchTimeoutsRef.current.push(timeoutId);
  }, [playEffectSound]);

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

  const getCanvasPoint = useCallback((clientX, clientY) => {
    const canvas = canvasRef.current;

    if (!canvas) {
      return null;
    }

    const rect = canvas.getBoundingClientRect();

    return {
      x: clamp(clientX - rect.left, 0, rect.width),
      y: clamp(clientY - rect.top, 0, rect.height),
      time: performance.now()
    };
  }, []);

  const createExplosion = useCallback((projectile) => {
    // The combined clip includes explosion plus decay tail and should begin
    // at the exact physics burst moment.
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

  const startGesture = useCallback((point) => {
    gestureRef.current = {
      isPressing: true,
      startPoint: point,
      points: [point],
      mouseHistory: [point]
    };
  }, []);

  const pushGesturePoint = useCallback((point) => {
    const current = gestureRef.current;

    if (!current.isPressing) {
      return;
    }

    current.points = [...current.points, point].slice(-MAX_GESTURE_POINTS);
    current.mouseHistory = [...current.mouseHistory, point].filter((entry) => {
      return point.time - entry.time <= HISTORY_WINDOW_MS;
    });
  }, []);

  const launchFromGesture = useCallback((endPoint) => {
    const current = gestureRef.current;

    if (!current.isPressing || !current.startPoint) {
      return;
    }

    const startPoint = current.startPoint;
    const fallbackEndPoint = current.points[current.points.length - 1] ?? startPoint;
    const resolvedEndPoint = endPoint ?? fallbackEndPoint;

    const dx = resolvedEndPoint.x - startPoint.x;
    const dy = resolvedEndPoint.y - startPoint.y;
    const dist = Math.hypot(dx, dy);
    const { height } = dimensionsRef.current;

    if (dist < CLICK_THRESHOLD) {
      if (startPoint.y > height * 0.6) {
        const projectile = new Projectile({
          x: startPoint.x,
          y: startPoint.y,
          vx: randomInRange(-0.8, 0.8),
          vy: randomInRange(-13.5, -10)
        });

        launchProjectileWithCompensation(projectile);
      } else {
        createExplosion({ x: startPoint.x, y: startPoint.y, vx: 0, vy: 0 });
      }
    } else {
      const projectile = new Projectile({
        x: startPoint.x,
        y: startPoint.y,
        vx: dx * 0.08,
        vy: dy * 0.08
      });

      launchProjectileWithCompensation(projectile);
    }

    gestureRef.current = {
      isPressing: false,
      startPoint: null,
      points: [],
      mouseHistory: []
    };
  }, [createExplosion, launchProjectileWithCompensation, playEffectSound]);

  const handleMouseDown = useCallback((event) => {
    const point = getCanvasPoint(event.clientX, event.clientY);

    if (!point) {
      return;
    }

    gestureRef.current = {
      isPressing: false,
      startPoint: null,
      points: [],
      mouseHistory: []
    };

    prepareFireworksSound("launch");
    startGesture(point);
  }, [getCanvasPoint, startGesture]);

  const handleMouseMove = useCallback((event) => {
    if (!gestureRef.current.isPressing) {
      return;
    }

    const point = getCanvasPoint(event.clientX, event.clientY);

    if (!point) {
      return;
    }

    pushGesturePoint(point);
  }, [getCanvasPoint, pushGesturePoint]);

  const handleMouseUp = useCallback((event) => {
    const point = getCanvasPoint(event.clientX, event.clientY);
    launchFromGesture(point);
  }, [getCanvasPoint, launchFromGesture]);

  const handleTouchStart = useCallback((event) => {
    const touch = event.touches[0];

    if (!touch) {
      return;
    }

    const point = getCanvasPoint(touch.clientX, touch.clientY);

    if (!point) {
      return;
    }

    event.preventDefault();

    gestureRef.current = {
      isPressing: false,
      startPoint: null,
      points: [],
      mouseHistory: []
    };

    prepareFireworksSound("launch");
    startGesture(point);
  }, [getCanvasPoint, startGesture]);

  const handleTouchMove = useCallback((event) => {
    if (!gestureRef.current.isPressing) {
      return;
    }

    const touch = event.touches[0];

    if (!touch) {
      return;
    }

    const point = getCanvasPoint(touch.clientX, touch.clientY);

    if (!point) {
      return;
    }

    event.preventDefault();
    pushGesturePoint(point);
  }, [getCanvasPoint, pushGesturePoint]);

  const handleTouchEnd = useCallback((event) => {
    const touch = event.changedTouches[0];

    if (!touch) {
      launchFromGesture(null);
      return;
    }

    const point = getCanvasPoint(touch.clientX, touch.clientY);
    launchFromGesture(point);
    event.preventDefault();
  }, [getCanvasPoint, launchFromGesture]);

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

    const render = () => {
      const drawingContext = contextRef.current;
      const { width, height } = dimensionsRef.current;

      if (!drawingContext || width === 0 || height === 0) {
        rafIdRef.current = window.requestAnimationFrame(render);
        return;
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
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    window.addEventListener("touchmove", handleTouchMove, { passive: false });
    window.addEventListener("touchend", handleTouchEnd, { passive: false });
    window.addEventListener("touchcancel", handleTouchEnd, { passive: false });

    return () => {
      window.cancelAnimationFrame(rafIdRef.current);
      window.removeEventListener("resize", resizeCanvas);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handleTouchEnd);
      window.removeEventListener("touchcancel", handleTouchEnd);

      projectilesRef.current = [];
      particlesRef.current = [];
      flashesRef.current = [];
      pendingLaunchTimeoutsRef.current.forEach((timeoutId) => {
        window.clearTimeout(timeoutId);
      });
      pendingLaunchTimeoutsRef.current = [];
      gestureRef.current = {
        isPressing: false,
        startPoint: null,
        points: [],
        mouseHistory: []
      };
    };
  }, [
    createExplosion,
    handleMouseMove,
    handleMouseUp,
    handleTouchEnd,
    handleTouchMove,
    playEffectSound,
    resizeCanvas
  ]);

  return (
    <canvas
      ref={canvasRef}
      onMouseDown={handleMouseDown}
      onTouchStart={handleTouchStart}
      className="fixed inset-0 z-40 pointer-events-auto touch-none select-none"
      aria-hidden="true"
    />
  );
}

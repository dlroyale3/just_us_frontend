import { useEffect, useReducer, useRef } from "react";

const FPS_SESSION_STORAGE_KEY = "justus_debug_show_fps";

function readStoredVisibility() {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    return window.sessionStorage.getItem(FPS_SESSION_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function writeStoredVisibility(isVisible) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.setItem(FPS_SESSION_STORAGE_KEY, isVisible ? "1" : "0");
  } catch {
    // Non-blocking persistence.
  }
}

export function FPSMonitor() {
  const [, forceRender] = useReducer((value) => value + 1, 0);
  const isVisibleRef = useRef(false);
  const labelRef = useRef(null);
  const rafIdRef = useRef(0);
  const lastSampleTimeRef = useRef(0);
  const frameCountRef = useRef(0);

  useEffect(() => {
    const nextVisibility = readStoredVisibility();

    if (isVisibleRef.current !== nextVisibility) {
      isVisibleRef.current = nextVisibility;
      forceRender();
    }

    const setVisibility = (nextVisible) => {
      const normalizedVisibility = Boolean(nextVisible);

      if (isVisibleRef.current === normalizedVisibility) {
        return;
      }

      isVisibleRef.current = normalizedVisibility;
      writeStoredVisibility(normalizedVisibility);
      forceRender();
    };

    const toggleVisibility = () => {
      setVisibility(!isVisibleRef.current);
    };

    window.showFPS = () => {
      setVisibility(true);
    };

    window.toggleFPS = toggleVisibility;

    const handleSecretHotkey = (event) => {
      if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === "f") {
        event.preventDefault();
        toggleVisibility();
      }
    };

    window.addEventListener("keydown", handleSecretHotkey);

    return () => {
      window.removeEventListener("keydown", handleSecretHotkey);

      if (window.showFPS) {
        delete window.showFPS;
      }

      if (window.toggleFPS) {
        delete window.toggleFPS;
      }
    };
  }, []);

  useEffect(() => {
    if (!isVisibleRef.current) {
      if (rafIdRef.current) {
        window.cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = 0;
      }
      return undefined;
    }

    lastSampleTimeRef.current = performance.now();
    frameCountRef.current = 0;

    const tick = (timestamp) => {
      frameCountRef.current += 1;
      const elapsed = timestamp - lastSampleTimeRef.current;

      if (elapsed >= 250) {
        const fps = Math.round((frameCountRef.current * 1000) / elapsed);

        if (labelRef.current) {
          labelRef.current.textContent = `${fps} FPS`;
        }

        lastSampleTimeRef.current = timestamp;
        frameCountRef.current = 0;
      }

      rafIdRef.current = window.requestAnimationFrame(tick);
    };

    rafIdRef.current = window.requestAnimationFrame(tick);

    return () => {
      if (rafIdRef.current) {
        window.cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = 0;
      }
    };
  }, [isVisibleRef.current]);

  if (!isVisibleRef.current) {
    return null;
  }

  return (
    <div className="fixed bottom-3 right-3 z-[120] pointer-events-none rounded-lg border border-white/20 bg-black/70 px-2 py-1 text-xs font-semibold tracking-wide text-emerald-300 shadow-lg backdrop-blur">
      <span ref={labelRef}>-- FPS</span>
    </div>
  );
}

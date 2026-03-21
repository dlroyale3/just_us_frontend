import { useEffect, useRef, useState } from "react";

export function FPSMonitor() {
  const [fps, setFps] = useState(0);
  const frameCountRef = useRef(0);
  const windowStartRef = useRef(performance.now());
  const rafIdRef = useRef(null);

  useEffect(() => {
    const measure = (timestamp) => {
      frameCountRef.current += 1;
      const elapsed = timestamp - windowStartRef.current;

      if (elapsed >= 1000) {
        const nextFps = Math.round((frameCountRef.current * 1000) / elapsed);
        setFps(nextFps);
        frameCountRef.current = 0;
        windowStartRef.current = timestamp;
      }

      rafIdRef.current = window.requestAnimationFrame(measure);
    };

    rafIdRef.current = window.requestAnimationFrame(measure);

    return () => {
      if (rafIdRef.current !== null) {
        window.cancelAnimationFrame(rafIdRef.current);
      }
    };
  }, []);

  return (
    <div className="pointer-events-none fixed right-2 top-2 z-50 rounded bg-black/80 px-2 py-1 font-mono text-xs text-green-400">
      FPS: {fps}
    </div>
  );
}

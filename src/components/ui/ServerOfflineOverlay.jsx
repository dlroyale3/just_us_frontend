import { WifiOff } from "lucide-react";
import { GlassLoader } from "./GlassLoader";

export function ServerOfflineOverlay() {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-stone-900/40 px-6 backdrop-blur-sm" role="status" aria-live="polite">
      <div className="w-full max-w-md rounded-3xl border border-white/50 bg-white/60 p-7 text-center shadow-[0_28px_70px_rgba(2,6,23,0.3)] backdrop-blur-xl sm:p-8">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-white/65 bg-white/70 text-stone-700">
          <WifiOff size={24} strokeWidth={1.75} />
        </div>

        <h2 className="mt-4 font-serif text-3xl text-teal-950">Connection Lost</h2>
        <p className="mt-3 text-sm leading-relaxed text-stone-700 sm:text-base">
          We lost contact with the vault. Trying to reconnect...
        </p>

        <div className="mt-6 flex justify-center">
          <GlassLoader compact message="Attempting recovery..." />
        </div>
      </div>
    </div>
  );
}

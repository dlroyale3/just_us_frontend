function classNames(...parts) {
  return parts.filter(Boolean).join(" ");
}

export function GlassLoader({ message = "Loading...", fullScreen = true, compact = false }) {
  if (compact) {
    return (
      <div className="inline-flex items-center gap-3" role="status" aria-live="polite" aria-label={message}>
        <div className="relative h-8 w-8">
          <span className="absolute inset-0 rounded-full border-2 border-emerald-100/80" />
          <span className="absolute inset-0 animate-spin rounded-full border-2 border-t-emerald-600 border-r-transparent border-b-transparent border-l-transparent" />
        </div>
        <p className="text-xs font-medium text-teal-900/85 sm:text-sm">{message}</p>
      </div>
    );
  }

  const containerClassName = fullScreen
    ? "fixed inset-0 z-50"
    : "absolute inset-0 z-20 rounded-[inherit]";

  return (
    <div
      className={classNames(
        containerClassName,
        "flex items-center justify-center bg-white/20 backdrop-blur-md"
      )}
      role="status"
      aria-live="polite"
      aria-label={message}
    >
      <div className="flex flex-col items-center justify-center rounded-3xl border border-white/40 bg-white/70 p-8 shadow-2xl backdrop-blur-xl">
        <div className="relative h-16 w-16">
          <span className="absolute inset-0 rounded-full border-4 border-emerald-100" />
          <span className="absolute inset-0 animate-spin rounded-full border-4 border-t-emerald-600 border-r-transparent border-b-transparent border-l-transparent" />
        </div>

        <p className="mt-5 animate-pulse text-center text-sm font-medium text-teal-900 sm:text-base">{message}</p>
      </div>
    </div>
  );
}
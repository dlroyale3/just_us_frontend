function classNames(...parts) {
  return parts.filter(Boolean).join(" ");
}

const variantStyles = {
  primary:
    "bg-gradient-to-r from-champagne to-[#e3c995] text-midnight shadow-vault hover:from-[#e9cc92] hover:to-[#f3debb]",
  secondary:
    "bg-slateNight/80 text-parchment border border-parchment/20 hover:border-champagne/70 hover:bg-slateNight hover:text-champagne",
  ghost:
    "bg-transparent text-parchment/80 hover:bg-white/10 hover:text-parchment",
  sage:
    "bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-[0_10px_28px_rgba(13,148,136,0.3)] hover:from-emerald-500 hover:to-cyan-500 hover:shadow-[0_14px_34px_rgba(6,182,212,0.28)]",
  google:
    "bg-white text-stone-800 border border-stone-200 shadow-[0_8px_28px_rgba(15,23,42,0.08)] hover:border-emerald-200 hover:bg-gradient-to-r hover:from-emerald-50 hover:to-cyan-50 hover:text-teal-800 hover:shadow-[0_14px_34px_rgba(15,23,42,0.16)]"
};

const spinnerStyles = {
  primary: "border-midnight/25 border-t-midnight",
  secondary: "border-parchment/30 border-t-parchment",
  ghost: "border-parchment/30 border-t-parchment",
  sage: "border-white/35 border-t-white",
  google: "border-stone-300 border-t-stone-600"
};

export function PremiumButton({
  type = "button",
  variant = "primary",
  className,
  children,
  isLoading = false,
  disabled = false,
  ...props
}) {
  return (
    <button
      type={type}
      disabled={disabled || isLoading}
      className={classNames(
        "premium-button inline-flex items-center justify-center gap-2 rounded-full px-6 py-3 text-sm font-semibold tracking-wide transition-all duration-300 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-champagne/80 disabled:cursor-not-allowed disabled:opacity-65 disabled:hover:translate-y-0",
        variantStyles[variant],
        className
      )}
      {...props}
    >
      {isLoading ? (
        <>
          <span
            className={classNames(
              "h-4 w-4 animate-spin rounded-full border-2",
              spinnerStyles[variant] ?? spinnerStyles.primary
            )}
          />
          <span>Please wait...</span>
        </>
      ) : (
        children
      )}
    </button>
  );
}

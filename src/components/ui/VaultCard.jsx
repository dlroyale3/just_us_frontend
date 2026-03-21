function classNames(...parts) {
  return parts.filter(Boolean).join(" ");
}

export function VaultCard({ className, children, ...props }) {
  return (
    <div
      className={classNames(
        "rounded-3xl border border-parchment/12 bg-slateNight/60 p-6 shadow-vault backdrop-blur-xl sm:p-8",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

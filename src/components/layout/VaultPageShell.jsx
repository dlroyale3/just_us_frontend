export function VaultPageShell({ children }) {
  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-32 top-14 h-80 w-80 rounded-full bg-champagne/10 blur-3xl" />
        <div className="absolute -right-24 bottom-10 h-72 w-72 rounded-full bg-terracotta/15 blur-3xl" />
      </div>

      <div className="relative mx-auto w-full max-w-6xl px-4 py-10 sm:px-8 sm:py-14 lg:py-16">
        {children}
      </div>
    </div>
  );
}

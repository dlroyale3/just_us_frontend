import { PremiumButton } from "../ui/PremiumButton";

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4">
      <path
        fill="#4285F4"
        d="M23.49 12.27c0-.79-.07-1.55-.2-2.27H12v4.31h6.47a5.53 5.53 0 0 1-2.4 3.63v3.01h3.89c2.28-2.1 3.53-5.18 3.53-8.68Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.07 7.93-2.9l-3.89-3.01c-1.08.72-2.46 1.15-4.04 1.15-3.1 0-5.73-2.1-6.67-4.92H1.31v3.1A12 12 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.33 14.32A7.2 7.2 0 0 1 4.96 12c0-.81.14-1.6.37-2.32v-3.1H1.31A12 12 0 0 0 0 12c0 1.94.46 3.77 1.31 5.42l4.02-3.1Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.77c1.76 0 3.33.61 4.57 1.8l3.42-3.42C17.95 1.13 15.24 0 12 0A12 12 0 0 0 1.31 6.58l4.02 3.1c.94-2.82 3.57-4.91 6.67-4.91Z"
      />
    </svg>
  );
}

export function HeroSection({
  onGoogleSignIn,
  isSigningIn,
  errorMessage,
  headline = "A quiet place for just the two of you.",
  subheadline =
    "Escape the noise. Your relationship deserves a private space that isn&apos;t sandwiched between work emails and group chats. Build your digital home, leave time capsules for the future, and chat securely."
}) {
  return (
    <section className="py-8 sm:py-12">
      <div className="glass-auth-panel mx-auto max-w-4xl rounded-3xl px-6 py-10 text-center sm:px-10 sm:py-14">
        <p className="text-xs uppercase tracking-[0.35em] text-teal-700/80">
          Private Vault For Couples
        </p>

        <h1 className="mt-5 font-serif text-4xl leading-tight text-teal-950 sm:text-5xl lg:text-6xl">
          {headline}
        </h1>

        <p className="mx-auto mt-6 max-w-3xl text-base leading-relaxed text-stone-700 sm:text-lg">
          {subheadline}
        </p>

        <PremiumButton
          onClick={onGoogleSignIn}
          isLoading={isSigningIn}
          variant="google"
          className="mx-auto mt-9 min-w-[18rem]"
        >
          <GoogleMark />
          <span>Start with Google</span>
        </PremiumButton>

        <p className="mt-4 text-sm text-stone-600">
          One trusted sign-in. Zero ads. Zero algorithms.
        </p>

        {errorMessage && (
          <p className="mt-4 text-sm text-rose-700" role="alert">
            {errorMessage}
          </p>
        )}
      </div>
    </section>
  );
}

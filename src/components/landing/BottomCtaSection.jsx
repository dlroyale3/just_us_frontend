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

export function BottomCtaSection({ onGoogleSignIn, isSigningIn }) {
  return (
    <section className="pb-10 pt-10 text-center sm:pb-14 sm:pt-12">
      <div className="glass-auth-panel mx-auto max-w-3xl rounded-3xl px-5 py-10 sm:px-10">
        <h2 className="font-serif text-3xl text-teal-950 sm:text-4xl">Ready to plant something beautiful?</h2>
        <p className="mt-3 text-base text-stone-700 sm:text-lg">
          Takes 30 seconds to join. Lasts a lifetime.
        </p>

        <PremiumButton
          onClick={onGoogleSignIn}
          isLoading={isSigningIn}
          variant="google"
          className="mx-auto mt-7 min-w-[14rem]"
        >
          <GoogleMark />
          <span>Start with Google</span>
        </PremiumButton>
      </div>
    </section>
  );
}

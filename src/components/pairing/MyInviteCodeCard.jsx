import { PremiumButton } from "../ui/PremiumButton";
import { VaultCard } from "../ui/VaultCard";

export function MyInviteCodeCard({ inviteCode, onCopy, copied }) {
  return (
    <VaultCard className="h-full">
      <p className="text-xs uppercase tracking-[0.3em] text-champagne/80">My Invite Code</p>
      <h2 className="mt-4 font-serif text-3xl text-parchment sm:text-4xl">Share your code</h2>
      <p className="mt-3 max-w-md text-sm text-parchment/75 sm:text-base">
        Send this code to your partner so they can securely pair with you.
      </p>

      <div className="mt-8 rounded-2xl border border-parchment/10 bg-midnight/70 px-4 py-6 text-center sm:px-6">
        <span className="block font-mono text-3xl font-semibold tracking-[0.3em] text-parchment sm:text-4xl">
          {inviteCode ?? "------"}
        </span>
      </div>

      <div className="relative mt-6 inline-flex items-center">
        <PremiumButton variant="secondary" onClick={onCopy} disabled={!inviteCode}>
          Copy Code
        </PremiumButton>

        <span
          className={`pointer-events-none absolute -top-9 left-1/2 -translate-x-1/2 rounded-full bg-champagne px-3 py-1 text-xs font-semibold text-midnight transition-all duration-200 ${
            copied ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0"
          }`}
        >
          Copied!
        </span>
      </div>
    </VaultCard>
  );
}

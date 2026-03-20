import { PremiumButton } from "../ui/PremiumButton";
import { VaultCard } from "../ui/VaultCard";

export function PartnerInviteForm({
  inviteCode,
  onInviteCodeChange,
  onSubmit,
  isSubmitting,
  errorMessage,
  successMessage
}) {
  return (
    <VaultCard className="h-full">
      <p className="text-xs uppercase tracking-[0.3em] text-champagne/80">Partner Invite</p>
      <h2 className="mt-4 font-serif text-3xl text-parchment sm:text-4xl">Enter their code</h2>
      <p className="mt-3 max-w-md text-sm text-parchment/75 sm:text-base">
        Once accepted, you both unlock the private vault experience.
      </p>

      <form onSubmit={onSubmit} className="mt-8">
        <label htmlFor="partnerCode" className="mb-2 block text-sm font-medium text-parchment/90">
          Enter your partner&apos;s code
        </label>

        <input
          id="partnerCode"
          value={inviteCode}
          onChange={(event) => onInviteCodeChange(event.target.value.toUpperCase())}
          placeholder="A4X9BQ"
          autoComplete="off"
          maxLength={12}
          className="w-full rounded-2xl border border-parchment/20 bg-midnight/70 px-4 py-3 text-base tracking-[0.15em] text-parchment outline-none transition focus:border-champagne/70 focus:ring-2 focus:ring-champagne/30"
        />

        <PremiumButton type="submit" isLoading={isSubmitting} className="mt-5 w-full sm:w-auto">
          Accept Invite
        </PremiumButton>

        {errorMessage && (
          <p className="mt-4 text-sm text-terracotta" role="alert">
            {errorMessage}
          </p>
        )}

        {successMessage && <p className="mt-4 text-sm text-champagne">{successMessage}</p>}
      </form>
    </VaultCard>
  );
}

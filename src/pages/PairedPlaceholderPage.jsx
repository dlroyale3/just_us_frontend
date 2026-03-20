import { VaultPageShell } from "../components/layout/VaultPageShell";
import { PremiumButton } from "../components/ui/PremiumButton";
import { VaultCard } from "../components/ui/VaultCard";
import { useAuth } from "../context/AuthContext";

export function PairedPlaceholderPage() {
  const { user, partner, logout } = useAuth();

  return (
    <VaultPageShell>
      <div className="mx-auto max-w-3xl py-14">
        <VaultCard className="text-center">
          <p className="text-xs uppercase tracking-[0.35em] text-champagne/80">Write Capsule</p>
          <h1 className="mt-5 font-serif text-4xl text-parchment sm:text-5xl">Compose your next message</h1>
          <p className="mt-4 text-base text-parchment/75">
            Hi {user?.name}. Capsule composer for you and {partner?.name ?? "your partner"} is
            being polished and will land in the next iteration.
          </p>

          <PremiumButton variant="secondary" onClick={logout} className="mt-8">
            Sign out
          </PremiumButton>
        </VaultCard>
      </div>
    </VaultPageShell>
  );
}

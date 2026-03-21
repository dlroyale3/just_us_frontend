import { VaultCard } from "../ui/VaultCard";

const steps = [
  {
    title: "Secure Login",
    description: "Use your Google account once and enter a private space without distractions."
  },
  {
    title: "Pair With A Secret Code",
    description: "Connect only with your partner using a unique invite code generated for each user."
  },
  {
    title: "Bury Time Capsules",
    description: "Write messages for the future and let them unlock on the exact date you choose."
  }
];

export function HowItWorksSection() {
  return (
    <section className="py-8 sm:py-12">
      <div className="mb-8 text-center">
        <p className="text-xs uppercase tracking-[0.35em] text-champagne/80">How it works</p>
        <h2 className="mt-4 font-serif text-3xl text-parchment sm:text-4xl">
          Three steps to your private space
        </h2>
      </div>

      <div className="grid gap-4 md:grid-cols-3 md:gap-5">
        {steps.map((step, index) => (
          <VaultCard
            key={step.title}
            className="animate-riseIn"
            style={{ animationDelay: `${index * 120}ms` }}
          >
            <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-champagne/15 text-sm font-semibold text-champagne">
              {index + 1}
            </div>
            <h3 className="mt-5 text-xl font-semibold text-parchment">{step.title}</h3>
            <p className="mt-3 text-sm leading-relaxed text-parchment/75">{step.description}</p>
          </VaultCard>
        ))}
      </div>
    </section>
  );
}

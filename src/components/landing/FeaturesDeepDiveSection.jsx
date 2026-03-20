function CalendarLockIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6 text-teal-700" aria-hidden="true" fill="none">
      <path d="M8 3v3M16 3v3M4 9h16" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <rect x="4" y="5" width="16" height="15" rx="3" stroke="currentColor" strokeWidth="1.6" />
      <rect x="9" y="12" width="6" height="5" rx="1.4" stroke="currentColor" strokeWidth="1.6" />
      <path d="M10.5 12v-1a1.5 1.5 0 1 1 3 0v1" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function ChatIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6 text-teal-700" aria-hidden="true" fill="none">
      <path
        d="M7 18.5c-2 0-3.5-1.5-3.5-3.5V7.5C3.5 5.5 5 4 7 4h10c2 0 3.5 1.5 3.5 3.5V15c0 2-1.5 3.5-3.5 3.5h-5.5l-3.8 2.2.8-2.2H7Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6 text-teal-700" aria-hidden="true" fill="none">
      <path
        d="M12 3.6 19 6v5.6c0 4.2-2.5 7.9-7 9.8-4.5-1.9-7-5.6-7-9.8V6l7-2.4Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="m9.4 12.2 1.9 1.9 3.6-3.8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

const features = [
  {
    title: "Time Capsules",
    icon: CalendarLockIcon,
    body: "Send a message today, let it unlock on your anniversary. Surprise them when they least expect it."
  },
  {
    title: "A Dedicated Hotline",
    icon: ChatIcon,
    body: "Real-time chat built exclusively for two. No seen-zoning pressure, just a seamless connection."
  },
  {
    title: "Absolute Privacy",
    icon: ShieldIcon,
    body: "We don't sell data. We don't run ads. Your vault is locked with a unique pairing code."
  }
];

export function FeaturesDeepDiveSection() {
  return (
    <section className="py-8 sm:py-12">
      <div className="glass-auth-panel mx-auto max-w-4xl rounded-3xl px-6 py-7 text-center sm:px-10 sm:py-8">
        <p className="text-xs uppercase tracking-[0.3em] text-teal-700/80">Features</p>
        <h2 className="mt-4 font-serif text-3xl text-teal-950 sm:text-4xl">
          Built for real connection
        </h2>
      </div>

      <div className="mt-8 grid gap-4 sm:gap-5 lg:grid-cols-3">
        {features.map((feature, index) => {
          const Icon = feature.icon;

          return (
            <article
              key={feature.title}
              className="glass-auth-panel animate-riseIn rounded-3xl p-6"
              style={{ animationDelay: `${index * 110}ms` }}
            >
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-100">
                <Icon />
              </div>
              <h3 className="mt-4 text-xl font-semibold text-teal-950">{feature.title}.</h3>
              <p className="mt-3 text-sm leading-relaxed text-stone-700 sm:text-base">{feature.body}</p>
            </article>
          );
        })}
      </div>
    </section>
  );
}

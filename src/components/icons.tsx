/**
 * Custom RexIntel feature icons. Stroke-based, 32×32, painted with the brand
 * gradient (rex-accent → rex-accent-2). All currentColor-aware where possible
 * so they tint with text utility classes; the gradient overrides per-icon.
 *
 * Each <linearGradient> needs a unique id, otherwise multiple instances on the
 * same page reference the same paint server and only the first renders.
 */

type Props = { className?: string };

const Stops = () => (
  <>
    <stop offset="0%" stopColor="var(--rex-accent)" />
    <stop offset="100%" stopColor="var(--rex-accent-2)" />
  </>
);

export function MarketIcon({ className }: Props) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="rex-grad-market" x1="0" y1="32" x2="32" y2="0">
          <Stops />
        </linearGradient>
      </defs>
      <rect x="4" y="20" width="4" height="8" rx="1" fill="url(#rex-grad-market)" fillOpacity="0.4" />
      <rect x="11" y="14" width="4" height="14" rx="1" fill="url(#rex-grad-market)" fillOpacity="0.65" />
      <rect x="18" y="9" width="4" height="19" rx="1" fill="url(#rex-grad-market)" />
      <path
        d="M5 11l8-6 6 3 8-6"
        stroke="url(#rex-grad-market)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M23 2h4v4"
        stroke="url(#rex-grad-market)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function SignalIcon({ className }: Props) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="rex-grad-signal" x1="0" y1="0" x2="32" y2="32">
          <Stops />
        </linearGradient>
      </defs>
      <path
        d="M16 29a13 13 0 0 1-13-13"
        stroke="url(#rex-grad-signal)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeOpacity="0.4"
      />
      <path
        d="M16 24a8 8 0 0 1-8-8"
        stroke="url(#rex-grad-signal)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeOpacity="0.7"
      />
      <path
        d="M16 19a3 3 0 0 1-3-3"
        stroke="url(#rex-grad-signal)"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <circle cx="16" cy="16" r="2" fill="url(#rex-grad-signal)" />
    </svg>
  );
}

export function ShieldIcon({ className }: Props) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="rex-grad-shield" x1="0" y1="0" x2="32" y2="32">
          <Stops />
        </linearGradient>
      </defs>
      <path
        d="M16 3l11 4v9c0 7-5 11-11 13C10 27 5 23 5 16V7z"
        stroke="url(#rex-grad-shield)"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <circle cx="16" cy="16" r="3" stroke="url(#rex-grad-shield)" strokeWidth="1.5" />
      <path
        d="M16 11v2M16 19v2M11 16h2M19 16h2"
        stroke="url(#rex-grad-shield)"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

type Props = { className?: string };

export function MarketIcon({ className }: Props) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <rect x="4" y="20" width="4" height="8" rx="1" fill="currentColor" fillOpacity="0.35" stroke="none" />
      <rect x="11" y="14" width="4" height="14" rx="1" fill="currentColor" fillOpacity="0.6" stroke="none" />
      <rect x="18" y="9" width="4" height="19" rx="1" fill="currentColor" stroke="none" />
      <path d="M5 11l8-6 6 3 8-6" />
      <path d="M23 2h4v4" />
    </svg>
  );
}

export function SignalIcon({ className }: Props) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path d="M16 29a13 13 0 0 1-13-13" strokeOpacity="0.35" />
      <path d="M16 24a8 8 0 0 1-8-8" strokeOpacity="0.65" />
      <path d="M16 19a3 3 0 0 1-3-3" />
      <circle cx="16" cy="16" r="2" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function ShieldIcon({ className }: Props) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path d="M16 3l11 4v9c0 7-5 11-11 13C10 27 5 23 5 16V7z" />
      <circle cx="16" cy="16" r="3" />
      <path d="M16 11v2M16 19v2M11 16h2M19 16h2" />
    </svg>
  );
}

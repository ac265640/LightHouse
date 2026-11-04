export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden>
      <defs>
        <linearGradient id="lh-beam" x1="16" y1="8" x2="31" y2="2" gradientUnits="userSpaceOnUse">
          <stop stopColor="#f6b54a" stopOpacity="0.9" />
          <stop offset="1" stopColor="#f6b54a" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d="M17 9 L31 3 L31 13 Z" fill="url(#lh-beam)" />
      <path d="M15 9 L1 3 L1 13 Z" fill="url(#lh-beam)" opacity="0.45" />
      <rect x="13" y="6" width="6" height="5" rx="1" fill="#f6b54a" />
      <path d="M12.5 12 H19.5 L21 28 H11 Z" fill="#e8edf9" />
      <path d="M12 17 H20" stroke="#060b1a" strokeWidth="1.6" />
      <path d="M11.5 22.5 H20.5" stroke="#060b1a" strokeWidth="1.6" />
      <path d="M7 29 H25" stroke="#5fc6ff" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

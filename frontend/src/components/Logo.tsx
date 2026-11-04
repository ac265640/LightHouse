/** The lamp room of a lighthouse: a tower in ink, its lamp in the accent, one beam. */
export function Logo({ size = 28, beam = true }: { size?: number; beam?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden>
      {beam && <path d="M18.5 8.5 L31 4.5 L31 12.5 Z" fill="var(--lamp)" opacity="0.35" />}
      <rect x="12.5" y="5.5" width="7" height="5" rx="1" fill="var(--lamp)" />
      <path d="M11.5 10.5 H20.5" stroke="var(--ink)" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M12.6 12 H19.4 L21 28 H11 Z" fill="var(--ink)" />
      <path d="M12.1 17 H19.9 M11.6 22.5 H20.4" stroke="var(--ground)" strokeWidth="1.6" />
      <path d="M7 29 H25" stroke="var(--dim)" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

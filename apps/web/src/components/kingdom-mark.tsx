/** Original geometric heraldry; no third-party game assets. */
export function KingdomMark({ className = '' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 64 72"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M32 3 59 17v27L32 68 5 44V17L32 3Z"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="m32 11 20 11v19L32 59 12 41V22l20-11Z"
        stroke="currentColor"
        strokeOpacity=".35"
      />
      <path
        d="M20 43V29h6v-9l6-5 6 5v9h6v14H20Z"
        fill="currentColor"
        fillOpacity=".13"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M29 43V33a3 3 0 0 1 6 0v10M20 25v4m6-8v8m12-8v8m6-4v4"
        stroke="currentColor"
        strokeWidth="1.5"
      />
    </svg>
  );
}

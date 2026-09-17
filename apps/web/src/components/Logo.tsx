export function Logo({ size = 24 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="var(--accent)"
      strokeWidth="1.5"
      strokeLinejoin="round"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M7 21h10M8.5 21c0-3 1-4.6 3-6 1.6-1.2 2.4-2.3 2.6-3.7l-2.1.9-1.4-1.9 2.2-1.3c-.9-.6-2-.6-3 0L8 10 6.5 8.2 9 6.2c1.4-1.1 2.9-1.6 4.4-1.4 2.6.3 4.3 2.2 4.6 5 .3 3.1-.6 6.4-2.4 8.1-.8.8-1.3 1.6-1.4 3" />
    </svg>
  );
}

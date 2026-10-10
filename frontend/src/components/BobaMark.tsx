/** One hand gripping a cup, drawn upright and centred on the origin. */
function HandAndCup() {
  return (
    <>
      <path d="M-5.8 -7H5.8" />
      <path d="M-1 -7l-2.2 -5" />
      <path d="M5 -7l-1 13a1 1 0 0 1-1 1h-6a1 1 0 0 1-1-1l-.25-2" />
      <path d="M-5 -7l.3 3" />
      <path d="M-4.7 -4H1.6a1 1 0 0 1 0 2H-4.6" />
      <path d="M-4.6 -2H2a1 1 0 0 1 0 2H-4.5" />
      <path d="M-4.5 0H1.8a1 1 0 0 1 0 2H-4.4" />
      <path d="M-4.4 2H1a1 1 0 0 1 0 2H-4.3" />
      <path d="M-4.7 -4c-2.2 0-3.3 3-3 6.2L-9 10" />
      <path d="M-4.3 4L-5 10" />
      <circle cx="0.4" cy="5.6" r="0.75" fill="currentColor" stroke="none" />
      <circle cx="2.4" cy="5.2" r="0.75" fill="currentColor" stroke="none" />
    </>
  );
}

/** Two hands clinking boba cups, drawn as one-weight line art. */
export function BobaMark({ className = "h-8 w-10" }: { className?: string }) {
  return (
    <svg
      viewBox="0 2 40 26"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <g transform="translate(13 18) rotate(16)">
        <HandAndCup />
      </g>
      <g transform="translate(27 18) rotate(-16) scale(-1 1)">
        <HandAndCup />
      </g>
      <path d="M20 8.2V5.6M17.4 9l-1.3-1.7M22.6 9l1.3-1.7" />
    </svg>
  );
}

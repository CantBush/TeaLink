/**
 * One hand gripping a cup, drawn upright and centred on the origin: the thumb
 * wraps across the front and only the fingertips show past the far side.
 */
function HandAndCup() {
  return (
    <>
      {/* Light green tea, filled to the cup's rounded base. Pearls sit in it. */}
      <path
        d="M-3.9.75C-2.15-.3.55 1.3 2.45.4 3.35-.05 3.9.35 4.4.8L4 6a1 1 0 0 1-1 1h-6a1 1 0 0 1-1-1l-.3-3L-3.9.75Z"
        fill="#8fbf96"
        stroke="none"
      />
      <path d="M-5.8 -7H5.8" />
      <path d="M-1 -7l-2.2 -5" />
      <path d="M5 -7l-1 13a1 1 0 0 1-1 1h-6a1 1 0 0 1-1-1l-.3-3" />
      <path d="M-5 -7l.3 3" />
      <path d="M-4.7 -4c-2.4-.4-3.6 2.6-3.2 6L-9 10" />
      <path d="M-4.4 3L-5 10" />
      <path d="M-4.7 -4c2-.6 4.6-.8 6.2.1a1.1 1.1 0 0 1-.5 2c-1.9.1-3.9.6-5.6 1.7" />
      <path d="M4.75 -3.6a1 1 0 0 1 0 1.9" />
      <path d="M4.6 -1.7a1 1 0 0 1 0 1.9" />
      <path d="M4.45 .2a1 1 0 0 1 0 1.9" />
      <circle cx="-1.2" cy="5.3" r="0.75" fill="currentColor" stroke="none" />
      <circle cx="1" cy="5.6" r="0.75" fill="currentColor" stroke="none" />
      <circle cx="2.5" cy="4.4" r="0.75" fill="currentColor" stroke="none" />
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

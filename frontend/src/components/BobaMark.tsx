/** Line-drawn cup in the HEYTEA doodle style: one stroke weight, no fill. */
export function BobaMark({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M8.5 10.5h15l-1.8 15.2a2 2 0 0 1-2 1.8h-7.4a2 2 0 0 1-2-1.8z" />
      <path d="M7.5 10.5h17" />
      <path d="M17.5 10.5l2.6-7" />
      <path d="M13.2 15.6c.2.6.7.9 1.2.9s1-.3 1.2-.9M17.4 15.6c.2.6.7.9 1.2.9s1-.3 1.2-.9" />
      <circle cx="12.6" cy="23.4" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="15.4" cy="24.4" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="18.2" cy="23.5" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="20" cy="25" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}

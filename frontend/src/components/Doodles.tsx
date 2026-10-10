import type { ReactNode } from "react";

type DoodleProps = { className?: string };

/** Shared frame: one stroke weight, no fill, so every doodle matches the logo's line art. */
function Doodle({ className = "h-5 w-5", viewBox = "0 0 24 24", children }: DoodleProps & { viewBox?: string; children: ReactNode }) {
  return (
    <svg
      viewBox={viewBox}
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export function Leaf({ className }: DoodleProps) {
  return (
    <Doodle className={className}>
      <path d="M5 19C4.5 10.5 10 5 19.5 4.5 19.5 13.5 13.5 19.5 5 19Z" />
      <path d="M5 19 14.5 9.5M9.2 14.8l-.6-3.6M11.8 12.2l-.5-3M9.2 14.8l3.4.4M11.8 12.2l3 .3" />
    </Doodle>
  );
}

/** A tea sprig: two leaves and a bud, the way tea is plucked. */
export function Sprig({ className }: DoodleProps) {
  return (
    <Doodle className={className}>
      <path d="M12 21.5c0-5 .3-9.5 1.3-13.5" />
      <path d="M13.3 8c-.4-2.2.3-4.2 1.7-5.5.9 2 .6 4.2-1.7 5.5Z" />
      <path d="M12.4 13.5C10 13.6 7.6 12.3 6.5 9.6c2.9-.4 5.2.8 5.9 3.9Z" />
      <path d="M12.1 17.2c2.1-.4 4.4.3 5.6 2.4-2.5.6-4.6-.2-5.6-2.4Z" />
    </Doodle>
  );
}

export function Sprout({ className }: DoodleProps) {
  return (
    <Doodle className={className}>
      <path d="M12 20.5v-8" />
      <path d="M12 12.5C12 8.6 9.3 6 5 6c0 4 2.8 6.5 7 6.5Z" />
      <path d="M12 14.5c0-3.4 2.6-5.8 6.5-5.8 0 3.6-2.6 5.8-6.5 5.8Z" />
      <path d="M7.5 20.5h9" />
    </Doodle>
  );
}

/** Two leaves leaning together, for "people like you". */
export function LeafPair({ className }: DoodleProps) {
  return (
    <Doodle className={className}>
      <path d="M11 20.5C6 18.6 4 13.8 5.2 7.6c4.6 2.4 6.8 7.2 5.8 12.9Z" />
      <path d="M13 20.5c5-1.9 7-6.7 5.8-12.9-4.6 2.4-6.8 7.2-5.8 12.9Z" />
      <path d="M11 20.5 7.2 11M13 20.5 16.8 11" />
    </Doodle>
  );
}

export function Teapot({ className }: DoodleProps) {
  return (
    <Doodle className={className}>
      <path d="M5.5 11.5h11v3.5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5Z" />
      <path d="M8.5 11.5c.4-2 1.4-3 2.5-3s2.1 1 2.5 3" />
      <path d="M11 8.5V7.3" />
      <path d="M16.5 12.5c2.4-.6 3.6.4 3.3 2.2-.3 1.6-1.9 2.5-3.8 2.4" />
      <path d="M5.5 13 3 10.8" />
    </Doodle>
  );
}

/** A small tea bowl with steam; the steam drifts when `steaming` is set. */
export function TeaBowl({ className, steaming = false }: DoodleProps & { steaming?: boolean }) {
  return (
    <Doodle className={className}>
      <path d="M4 12.5h16a8 8 0 0 1-16 0Z" />
      <path d="M9 20.4h6" />
      <g className={steaming ? "steam" : undefined}>
        <path d="M9.5 9.5c-1-1.1 1-2 0-3.3" />
        <path d="M14.5 9.5c-1-1.1 1-2 0-3.3" />
      </g>
    </Doodle>
  );
}

/** A thin vine with leaves, used as a section divider. */
export function Vine({ className = "h-5 w-40" }: DoodleProps) {
  return (
    <Doodle className={className} viewBox="0 0 160 20">
      <path d="M2 10c20-6 36 6 56 0s36-6 56 0 30 4 44 0" />
      <path d="M30 7.5c-1.5-3.5 1-6 4.5-6.2C35 4.8 33.5 7 30 7.5Z" />
      <path d="M58 10c1.8 3.4-.4 6.2-4 6.6-.8-3.4.6-5.8 4-6.6Z" />
      <path d="M86 8c-1.2-3.6 1.5-6 5-6-.2 3.6-1.6 5.6-5 6Z" />
      <path d="M114 10c1.6 3.5-.8 6.2-4.3 6.4-.6-3.5 1-5.7 4.3-6.4Z" />
      <path d="M140 9.4c-1.4-3.4 1-6 4.4-6.2.2 3.5-1.2 5.6-4.4 6.2Z" />
    </Doodle>
  );
}

/** Large, faint tea branches in the page margins. Wide screens only. */
export function GardenBackdrop() {
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 hidden overflow-hidden text-moss/15 xl:block" aria-hidden>
      <Doodle className="absolute -left-10 top-28 h-[380px] w-[220px] -rotate-12" viewBox="0 0 120 210">
        <path d="M70 208C64 160 58 110 66 60 70 36 80 18 92 4" />
        <path d="M92 4c-8 2-14 10-12 20 8-3 13-10 12-20Z" />
        <path d="M68 52C52 50 40 40 36 24c16 0 28 10 32 28Z" />
        <path d="M66 84c14-6 30-4 40 8-14 8-30 6-40-8Z" />
        <path d="M63 118C46 118 32 108 26 92c17-1 31 8 37 26Z" />
        <path d="M64 150c14-7 30-6 41 6-14 9-30 7-41-6Z" />
        <path d="M66 182c-15 1-28-6-35-20 15-2 28 5 35 20Z" />
      </Doodle>
      <Doodle className="absolute -right-8 bottom-10 h-[320px] w-[200px] rotate-[18deg]" viewBox="0 0 120 210">
        <path d="M50 208C56 160 62 112 54 64 50 40 42 22 30 6" />
        <path d="M30 6c8 2 13 10 11 20-8-3-12-10-11-20Z" />
        <path d="M52 56c16-2 28-12 32-28-16 0-28 10-32 28Z" />
        <path d="M55 92C41 86 25 88 15 100c14 8 30 6 40-8Z" />
        <path d="M57 128c17 0 31-10 37-26-17-1-31 8-37 26Z" />
        <path d="M56 164c-14-7-30-6-41 6 14 9 30 7 41-6Z" />
      </Doodle>
    </div>
  );
}

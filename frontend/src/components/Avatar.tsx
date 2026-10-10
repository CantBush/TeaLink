import type { Avatar as AvatarData } from "../api/types.ts";

const SIZES = {
  xs: "h-6 w-6 text-sm",
  sm: "h-8 w-8 text-base",
  md: "h-11 w-11 text-xl",
  lg: "h-20 w-20 text-4xl",
  xl: "h-24 w-24 text-5xl sm:h-28 sm:w-28 sm:text-6xl",
};

export function Avatar({
  avatar,
  size = "md",
  ring,
}: {
  avatar: AvatarData | null | undefined;
  size?: keyof typeof SIZES;
  ring?: string;
}) {
  return (
    <span
      className={`inline-grid shrink-0 place-items-center rounded-full ${SIZES[size]}`}
      style={{
        background: avatar?.color ?? "#f8e3e6",
        boxShadow: ring ? `0 0 0 3px #ffffff, 0 0 0 5px ${ring}` : undefined,
      }}
      aria-hidden
    >
      {avatar?.emoji ?? "🧋"}
    </span>
  );
}

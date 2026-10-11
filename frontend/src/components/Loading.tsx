import { BobaMark } from "./BobaMark.tsx";

/** The loading state everywhere: the logo's cups clinking, with what's loading underneath. */
export function Loading({ label, className = "py-10" }: { label: string; className?: string }) {
  return (
    <div role="status" className={`flex flex-col items-center gap-3 text-center ${className}`}>
      <BobaMark clinking className="h-14 w-[4.4rem] text-moss" />
      <p className="text-sm text-mute">{label}</p>
    </div>
  );
}

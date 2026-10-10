import { BobaMark } from "./BobaMark.tsx";
import { Shell } from "./OnboardingShell.tsx";

/** Asked once, before name and handle. Customers continue; stores never take the quiz. */
export function RoleChoice({ onCustomer, onStore }: { onCustomer: () => void; onStore: () => void }) {
  return (
    <Shell>
      <div className="flex items-center gap-2 font-logo text-2xl tracking-[0.2em] uppercase">
        <BobaMark /> TeaLink
      </div>
      <h1 className="mt-6 font-display text-4xl leading-tight sm:text-5xl">Are you here for a drink, or for a shop?</h1>
      <p className="mt-3 text-lg text-mute">Asked once, when this account is created.</p>
      <div className="mt-8 grid gap-3">
        <button
          type="button"
          onClick={onCustomer}
          className="rounded-3xl border-2 border-line bg-foam px-5 py-5 text-left hover:border-ink/30"
        >
          <span className="block font-display text-2xl">I'm a customer</span>
          <span className="mt-1 block text-base font-normal text-mute">Continue to your name, handle, and the quiz.</span>
        </button>
        <button
          type="button"
          onClick={onStore}
          className="rounded-3xl border-2 border-line bg-foam px-5 py-5 text-left hover:border-ink/30"
        >
          <span className="block font-display text-2xl">I'm a store</span>
          <span className="mt-1 block text-base font-normal text-mute">Pick your shop. No quiz and no customer profile.</span>
        </button>
      </div>
    </Shell>
  );
}

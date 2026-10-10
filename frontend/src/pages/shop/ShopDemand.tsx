import { ShopPage } from "./ShopLayout.tsx";

/** Demo account priorities. A sample, not the evaluation, and no customer names. */
const SAMPLE = [
  { label: "Price", value: 43 },
  { label: "Taste", value: 41 },
  { label: "Friends", value: 11 },
  { label: "Novelty", value: 5 },
];

export function ShopDemand() {
  return (
    <ShopPage>
      <header>
        <p className="text-xs font-semibold tracking-[0.16em] text-moss uppercase">Demand</p>
        <h1 className="mt-1 font-display text-4xl">What people weigh</h1>
        <p className="mt-2 text-mute">Anonymized. No names. This mix is a sample of the demo priorities, not the evaluation.</p>
      </header>
      <ul className="space-y-4 rounded-[28px] border border-line bg-foam p-5">
        {SAMPLE.map((item) => (
          <li key={item.label}>
            <div className="mb-1 flex items-baseline justify-between font-semibold">
              <span>{item.label}</span>
              <span>{item.value}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-line">
              <div className="h-full rounded-full bg-moss" style={{ width: `${item.value}%` }} />
            </div>
          </li>
        ))}
      </ul>
    </ShopPage>
  );
}

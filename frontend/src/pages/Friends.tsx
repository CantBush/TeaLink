import { Link } from "react-router-dom";

export function Friends() {
  return (
    <main className="mx-auto max-w-xl px-5 py-8">
      <Link to="/" className="text-sm font-semibold text-mute hover:text-ink">
        Back to Discover
      </Link>
      <h1 className="mt-4 font-display text-4xl">Friends</h1>
      <article className="mt-6 rounded-[28px] border border-line bg-foam p-6">
        <div className="flex items-center gap-4">
          <span className="grid h-14 w-14 place-items-center rounded-full bg-[#f0e2d0] font-display text-2xl">
            S
          </span>
          <div>
            <h2 className="font-display text-3xl">Sarah</h2>
            <p className="text-mute">94% taste similarity</p>
          </div>
        </div>
        <h3 className="mt-6 text-sm font-semibold tracking-wide text-amber uppercase">
          Sarah loved these
        </h3>
        <ul className="mt-3">
          <li className="rounded-2xl border border-line bg-cream px-4 py-3 font-semibold">
            Hojicha Cream Tea
          </li>
        </ul>
      </article>
    </main>
  );
}

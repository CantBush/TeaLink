import type { ReactNode } from "react";

/** Shared frame for the role step, account, quiz, and shop picker. */
export function Shell({ children, progress }: { children: ReactNode; progress?: number }) {
  return (
    <main className="mx-auto flex min-h-[calc(100vh-9rem)] max-w-xl flex-col px-5 py-6 sm:py-10">
      {progress !== undefined ? (
        <div className="mb-8 h-1.5 overflow-hidden rounded-full bg-line" role="progressbar" aria-valuenow={Math.round(progress * 100)}>
          <div className="h-full rounded-full bg-moss transition-all duration-300" style={{ width: `${progress * 100}%` }} />
        </div>
      ) : null}
      {children}
    </main>
  );
}

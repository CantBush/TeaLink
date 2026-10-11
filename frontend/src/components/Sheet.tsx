import { type ReactNode, useEffect } from "react";
import { createPortal } from "react-dom";

/**
 * A dialog centered in the viewport. If the content is taller than the screen,
 * it scrolls inside the dialog. The page behind it does not scroll.
 */
export function Sheet({
  label,
  onClose,
  children,
  padded = true,
  fill = false,
}: {
  label: string;
  onClose: () => void;
  children: ReactNode;
  /** False when the caller pads its own regions (a full-bleed photo, a sticky header). */
  padded?: boolean;
  /** The dialog is a column and the caller scrolls one region inside it. */
  fill?: boolean;
}) {
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" onClick={onClose}>
      <section
        role="dialog"
        aria-modal="true"
        aria-label={label}
        onClick={(event) => event.stopPropagation()}
        className={`max-h-[calc(100dvh-2rem)] min-h-0 w-full max-w-lg overscroll-contain rounded-[32px] bg-foam ${
          fill ? "flex flex-col overflow-hidden" : "overflow-y-auto"
        } ${padded ? "p-6" : ""}`}
      >
        {children}
      </section>
    </div>,
    document.body,
  );
}

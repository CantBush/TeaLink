import { useSocialPreview } from "../api/social.ts";

/** Shown while social screens run on sample data because the API doesn't serve them yet. */
export function PreviewNote() {
  const preview = useSocialPreview();
  if (!preview) return null;
  return (
    <p className="rounded-2xl border border-dashed border-line bg-cream px-4 py-2 text-xs text-mute">
      Preview data: the social API isn't live yet, so this uses sample profiles saved in your browser.
    </p>
  );
}

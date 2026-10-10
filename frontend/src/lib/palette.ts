/**
 * Profile colors come from the API, and most profiles were made with warm
 * yellow, orange, and brown swatches. Those hues are turned toward tea green,
 * keeping their lightness, so every profile sits in the same palette. Pinks,
 * blues, purples, and greens pass through unchanged.
 */
export function tint(color: string): string;
export function tint(color: string | null | undefined): string | undefined;
export function tint(color: string | null | undefined) {
  if (!color) return undefined;
  const match = /^#([0-9a-f]{6})$/i.exec(color);
  if (!match) return color;
  const n = parseInt(match[1], 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d < 0.04) return color;
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = max === r ? (60 * ((g - b) / d) + 360) % 360 : max === g ? 60 * ((b - r) / d) + 120 : 60 * ((r - g) / d) + 240;
  if (h < 12 || h > 66) return color;
  return hsl(100 + (h - 12) * 0.6, Math.min(s, 0.2), l);
}

function hsl(h: number, s: number, l: number) {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return `#${[f(0), f(8), f(4)].map((v) => Math.round(v * 255).toString(16).padStart(2, "0")).join("")}`;
}

/** Avatar backgrounds offered in the quiz and Edit profile. */
export const AVATAR_COLORS = ["#dfe9d6", "#d8e8c8", "#e8eecf", "#d5ebe0", "#cfe3ef", "#e3d4f0", "#e3e8dc", "#f1e4e2"];

/** Profile accent colors offered in Edit profile. */
export const ACCENT_COLORS = ["#3d6b4f", "#7a9a5b", "#2f5d62", "#6b7f3a", "#4d86a8", "#8b6bb0", "#1c2b22"];

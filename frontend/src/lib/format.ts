const SHOPS: Record<string, string> = {
  kungfu: "Kung Fu Tea",
  "shop:kungfu": "Kung Fu Tea",
};

export function matchPercent(score: number): number {
  return Math.round(score * 100);
}

export function shopLabel(shopId: string): string {
  return SHOPS[shopId] ?? shopId;
}

export function factorLabel(factor: string): string {
  return factor
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function attributeLabel(key: string): string {
  if (key === "tea_intensity") return "Tea";
  return factorLabel(key);
}

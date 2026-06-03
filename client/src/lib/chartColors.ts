// Pull chart colors from CSS variables so they adapt to dark/light themes.
export function cssHsl(varName: string): string {
  if (typeof window === "undefined") return "#3b82f6";
  const v = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  return v ? `hsl(${v})` : "#3b82f6";
}

export const CHART_PALETTE = [
  "--chart-1",
  "--chart-2",
  "--chart-3",
  "--chart-4",
  "--chart-5",
];

export function tierColor(tier: string): string {
  if (tier === "A") return cssHsl("--destructive");
  if (tier === "B") return cssHsl("--primary");
  return cssHsl("--muted-foreground");
}

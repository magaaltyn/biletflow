import { useColorScheme } from "react-native";

// Same palette as the website (frontend/app/globals.css), including its night theme.
const light = {
  brand: "#1d4ed8",
  brandDark: "#1e3a8a",
  brandSoft: "#eff6ff",
  onBrand: "#ffffff",
  ink: "#0f172a",
  muted: "#64748b",
  line: "#e2e8f0",
  bg: "#f8fafc",
  card: "#ffffff",
  subtle: "#f1f5f9",
  green: "#15803d",
  greenSoft: "#f0fdf4",
  amber: "#b45309",
  amberSoft: "#fffbeb",
  red: "#dc2626",
  redSoft: "#fef2f2",
  violet: "#6d28d9",
  violetSoft: "#f5f3ff",
  promo: "#9a3412",
};

const dark: typeof light = {
  brand: "#3b82f6",
  brandDark: "#2563eb",
  brandSoft: "#172554",
  onBrand: "#ffffff",
  ink: "#e2e8f0",
  muted: "#94a3b8",
  line: "#273449",
  bg: "#020617",
  card: "#0f172a",
  subtle: "#1e293b",
  green: "#86efac",
  greenSoft: "#052e16",
  amber: "#fcd34d",
  amberSoft: "#451a03",
  red: "#f87171",
  redSoft: "#450a0a",
  violet: "#c4b5fd",
  violetSoft: "#2e1065",
  promo: "#fdba74",
};

export type Colors = typeof light;

export function useColors(): Colors {
  return useColorScheme() === "dark" ? dark : light;
}

export const radius = { sm: 8, md: 12, lg: 16, xl: 24 };
export const space = (n: number) => n * 4;

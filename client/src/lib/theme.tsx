import { createContext, useContext, useEffect, useState, ReactNode } from "react";

type Theme = "dark" | "light";
interface ThemeCtx {
  theme: Theme;
  toggle: () => void;
}
const ThemeContext = createContext<ThemeCtx>({ theme: "dark", toggle: () => {} });

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => {
    // Power-user internal tool: default to dark, seed from prefers-color-scheme.
    if (typeof window !== "undefined" && window.matchMedia) {
      const prefersLight = window.matchMedia("(prefers-color-scheme: light)").matches;
      return prefersLight ? "light" : "dark";
    }
    return "dark";
  });

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") root.classList.add("dark");
    else root.classList.remove("dark");
  }, [theme]);

  const toggle = () => setTheme((t) => (t === "dark" ? "light" : "dark"));

  return <ThemeContext.Provider value={{ theme, toggle }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}

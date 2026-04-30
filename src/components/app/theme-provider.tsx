"use client";
// Lightweight theme provider for light/dark/system. We avoid pulling in
// next-themes to keep the bundle small — the only state we need is a single
// "mode" value persisted in localStorage and synced with the html.dark class.
//
// Usage:
//   <ThemeProvider> at the root layout
//   useTheme() in any client component to read/set theme
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

export type ThemeMode = "light" | "dark" | "system";

interface ThemeContextValue {
  /** User's selected mode (what they clicked). May be "system". */
  mode: ThemeMode;
  /** The actual rendered mode after resolving "system" against OS preference. */
  resolved: "light" | "dark";
  setMode: (mode: ThemeMode) => void;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const STORAGE_KEY = "uniga.theme";

function getSystemPreference(): "light" | "dark" {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function applyToDOM(resolved: "light" | "dark") {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.classList.remove("light", "dark");
  root.classList.add(resolved);
  // Match shadcn convention: also set color-scheme so native form widgets +
  // scrollbars use the right palette.
  root.style.colorScheme = resolved;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Read once on mount; SSR renders default 'system' which means light unless
  // the inline pre-paint script has flipped to dark already.
  const [mode, setModeState] = useState<ThemeMode>("system");
  const [resolved, setResolved] = useState<"light" | "dark">("light");

  // Hydrate from localStorage on first render.
  useEffect(() => {
    let initial: ThemeMode = "system";
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw === "light" || raw === "dark" || raw === "system") {
        initial = raw;
      }
    } catch {
      // ignore — non-critical
    }
    setModeState(initial);
    const next = initial === "system" ? getSystemPreference() : initial;
    setResolved(next);
    applyToDOM(next);
  }, []);

  // Sync with system preference when mode is "system".
  useEffect(() => {
    if (mode !== "system") return;
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => {
      const next = mql.matches ? "dark" : "light";
      setResolved(next);
      applyToDOM(next);
    };
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, [mode]);

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // ignore — non-critical
    }
    const r = next === "system" ? getSystemPreference() : next;
    setResolved(r);
    applyToDOM(r);
  }, []);

  const toggle = useCallback(() => {
    // Cycle: light → dark → system → light...
    setMode(mode === "light" ? "dark" : mode === "dark" ? "system" : "light");
  }, [mode, setMode]);

  const value = useMemo<ThemeContextValue>(
    () => ({ mode, resolved, setMode, toggle }),
    [mode, resolved, setMode, toggle]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    // Allow components to be used outside the provider (e.g. error pages
    // before layout mounts) without crashing — return a no-op default.
    return {
      mode: "system",
      resolved: "light",
      setMode: () => {},
      toggle: () => {},
    };
  }
  return ctx;
}

/** Inline script body to be injected to <head> as a script tag.
 *  Runs synchronously before first paint to avoid the dark-mode flash:
 *  reads localStorage / matchMedia and sets `dark` on <html> before React. */
export const themeInitScript = `
(function() {
  try {
    var t = localStorage.getItem("${STORAGE_KEY}");
    if (t !== "light" && t !== "dark" && t !== "system") t = "system";
    var prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    var resolved = t === "system" ? (prefersDark ? "dark" : "light") : t;
    var root = document.documentElement;
    root.classList.remove("light", "dark");
    root.classList.add(resolved);
    root.style.colorScheme = resolved;
  } catch (e) {}
})();
`;

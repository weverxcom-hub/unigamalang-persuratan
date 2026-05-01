"use client";
// Theme toggle button. Cycles through light → dark → system (each click).
// Icon reflects the *resolved* state so the user immediately sees what mode
// they're in. Aria label spells out the action ("Beralih ke mode gelap")
// for screen reader users.
import { Moon, Sun, Monitor } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/components/app/theme-provider";
import { cn } from "@/lib/utils";

interface ThemeToggleProps {
  className?: string;
  /** When true, render compact (icon-only) variant. Default: icon-only. */
  iconOnly?: boolean;
}

const NEXT_MODE: Record<"light" | "dark" | "system", "light" | "dark" | "system"> = {
  light: "dark",
  dark: "system",
  system: "light",
};

const NEXT_LABEL: Record<"light" | "dark" | "system", string> = {
  light: "gelap",
  dark: "ikuti sistem",
  system: "terang",
};

export function ThemeToggle({ className, iconOnly = true }: ThemeToggleProps) {
  const { mode, resolved, setMode } = useTheme();

  const Icon = mode === "system" ? Monitor : resolved === "dark" ? Moon : Sun;
  const next = NEXT_MODE[mode];
  const aria = `Beralih ke mode ${NEXT_LABEL[mode]} (saat ini: ${
    mode === "system" ? "ikuti sistem" : mode === "dark" ? "gelap" : "terang"
  })`;

  if (iconOnly) {
    return (
      <Button
        variant="outline"
        size="icon"
        onClick={() => setMode(next)}
        aria-label={aria}
        title={aria}
        className={cn(className)}
      >
        <Icon className="h-4 w-4" />
      </Button>
    );
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => setMode(next)}
      aria-label={aria}
      className={cn(className)}
    >
      <Icon className="h-4 w-4" />
      {mode === "system" ? "Sistem" : mode === "dark" ? "Gelap" : "Terang"}
    </Button>
  );
}

import { CircleCheckIcon } from "lucide-react";
import type { CSSProperties } from "react";
import { Toaster as Sonner } from "sonner";
import { useThemeChoice, type ThemeChoice } from "@/platform/theme";

const toasterTheme: Record<ThemeChoice, "light" | "dark" | "system"> = {
  light: "light",
  dark: "dark",
  device: "system",
};

/** Written by hand rather than by `shadcn add`, whose version asks `next-themes` for the
 * theme instead of `platform/theme.ts`. */
export function Toaster() {
  const theme = useThemeChoice();

  return (
    <Sonner
      theme={toasterTheme[theme]}
      position="bottom-right"
      closeButton
      duration={4000}
      icons={{ success: <CircleCheckIcon className="size-4" /> }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as CSSProperties
      }
    />
  );
}

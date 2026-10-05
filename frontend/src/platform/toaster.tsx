import { CircleCheckIcon } from "lucide-react";
import { useEffect, type CSSProperties } from "react";
import { Toaster as Sonner, toast } from "sonner";
import { useThemeChoice, type ThemeChoice } from "@/platform/theme";

const toasterTheme: Record<ThemeChoice, "light" | "dark" | "system"> = {
  light: "light",
  dark: "dark",
  device: "system",
};

/** Written by hand because the file `shadcn add` writes fails this repo's typecheck, and
 * `ui/shadcn/` is never edited. */
export function Toaster() {
  const theme = useThemeChoice();
  // Sonner shows a new toaster every toast still held, so one left over after logging out
  // would show to the next Viewer to sign in.
  useEffect(
    () => () => {
      toast.dismiss();
    },
    [],
  );

  return (
    <Sonner
      theme={toasterTheme[theme]}
      position="bottom-right"
      closeButton
      duration={4000}
      icons={{ success: <CircleCheckIcon aria-hidden="true" className="size-4" /> }}
      style={
        {
          // Sonner's own stylesheet names a font for the toaster, and would win over a class.
          fontFamily: "inherit",
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as CSSProperties
      }
    />
  );
}

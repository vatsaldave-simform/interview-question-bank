import { Link, Outlet, type LinkComponentProps } from "@tanstack/react-router";
import { ChevronDownIcon } from "lucide-react";
import { CheckingTheSession } from "@/platform/checking-the-session";
import { useSession } from "@/platform/session";
import { chooseTheme, themeChoices, useThemeChoice, type ThemeChoice } from "@/platform/theme";
import { Toaster } from "@/platform/toaster";
import { Button } from "@/ui/shadcn/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/ui/shadcn/dropdown-menu";

/** The frame every signed-in screen sits inside. It is told how to end the session rather
 * than reaching for it: nothing in `platform/` may import a feature, and logging out
 * belongs to `features/auth/` (ADR-0030). */
export function AppShell({ onSignOut }: { onSignOut: () => void }) {
  const session = useSession();
  const theme = useThemeChoice();
  // The check let "unknown" through instead of bouncing anyone, so this is the wait while
  // the silent sign-in answers, and "signed-out" is the instant before its redirect lands.
  if (session.status === "unknown") return <CheckingTheSession />;
  if (session.status === "signed-out") return null;

  const { viewer } = session;
  return (
    <div className="flex min-h-svh flex-col">
      <header className="from-sidebar-gradient-from to-sidebar-gradient-to text-brand-lavender border-sidebar-border flex flex-wrap items-center gap-x-3 border-b bg-linear-to-r px-6 sm:gap-x-6">
        <Link
          to="/"
          className="text-sidebar-accent-foreground flex items-center gap-3 py-3 text-sm font-semibold sm:text-base"
        >
          {/* The name beside it already says where the link goes, so the picture adds nothing to read out. */}
          <img src="/simform-logo.svg" alt="" className="h-6 w-auto shrink-0" />
          Interview Question Bank
        </Link>
        <nav
          aria-label="Pages"
          className="order-last flex w-full flex-wrap gap-x-4 sm:order-none sm:w-auto sm:gap-x-5"
        >
          <PageLink to="/" activeOptions={{ exact: true, includeSearch: false }}>
            Questions
          </PageLink>
          {/* Hiding these links keeps nobody out: the API refuses their lists anyway. */}
          {viewer.role !== "reader" && <PageLink to="/questions/own">Your Questions</PageLink>}
          {viewer.role === "reviewer" && <PageLink to="/review">Review queue</PageLink>}
          {viewer.isAdministrator && <PageLink to="/administration">Administration</PageLink>}
        </nav>
        {/* It may shrink to no width, so on a phone a long address is cut short instead of
            moving to a row of its own. */}
        <div className="flex min-w-0 flex-1 basis-0 justify-end">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="text-brand-lavender hover:bg-brand-lavender/15 hover:text-sidebar-accent-foreground max-w-full px-2 has-[>svg]:px-2"
              >
                <span className="min-w-0 truncate">{viewer.email}</span>
                <ChevronDownIcon aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <Link to="/account">Your account</Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel id="theme-choice-label" className="text-muted-foreground text-xs">
                Theme
              </DropdownMenuLabel>
              <DropdownMenuRadioGroup
                aria-labelledby="theme-choice-label"
                value={theme}
                onValueChange={(value) => {
                  const picked = themeChoices.find((one) => one === value);
                  if (picked) chooseTheme(picked);
                }}
              >
                {themeChoices.map((choice) => (
                  <DropdownMenuRadioItem key={choice} value={choice}>
                    {themeWording[choice]}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={onSignOut}>Log out</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>
      <main className="flex-1 p-6">
        <Outlet />
      </main>
      {/* Here, so a toast outlives the screen that raised it when the act moves to another. */}
      <Toaster />
    </div>
  );
}

const themeWording: Record<ThemeChoice, string> = {
  light: "Light",
  dark: "Dark",
  device: "Match my device",
};

/** The underline on the current page follows the `aria-current` the router sets on it. The
 * links sit on the header's gradient, so they are lavender and turn white on the current page. */
function PageLink(props: Omit<LinkComponentProps, "className">) {
  return (
    <Link
      {...props}
      className="text-brand-lavender hover:text-sidebar-accent-foreground aria-[current=page]:border-sidebar-accent-foreground aria-[current=page]:text-sidebar-accent-foreground border-b-2 border-transparent py-2 text-sm whitespace-nowrap sm:py-3"
    />
  );
}

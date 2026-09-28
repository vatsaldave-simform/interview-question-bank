import { Link, Outlet, type LinkComponentProps } from "@tanstack/react-router";
import { ChevronDownIcon } from "lucide-react";
import { CheckingTheSession } from "@/platform/checking-the-session";
import { useSession } from "@/platform/session";
import { Button } from "@/ui/shadcn/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/ui/shadcn/dropdown-menu";

/** The frame every signed-in screen sits inside. It is told how to end the session rather
 * than reaching for it: nothing in `platform/` may import a feature, and logging out
 * belongs to `features/auth/` (ADR-0030). */
export function AppShell({ onSignOut }: { onSignOut: () => void }) {
  const session = useSession();
  // The check let "unknown" through instead of bouncing anyone, so this is the wait while
  // the silent sign-in answers, and "signed-out" is the instant before its redirect lands.
  if (session.status === "unknown") return <CheckingTheSession />;
  if (session.status === "signed-out") return null;

  const { viewer } = session;
  return (
    <div className="flex min-h-svh flex-col">
      <header className="bg-card flex flex-wrap items-center gap-x-3 border-b px-6 sm:gap-x-6">
        <Link to="/" className="py-3 text-sm font-semibold sm:text-base">
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
              <Button variant="ghost" size="sm" className="max-w-full px-2 has-[>svg]:px-2">
                <span className="min-w-0 truncate">{viewer.email}</span>
                <ChevronDownIcon aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <Link to="/account">Your account</Link>
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={onSignOut}>Log out</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>
      <main className="flex-1 p-6">
        <Outlet />
      </main>
    </div>
  );
}

/** The underline on the current page follows the `aria-current` the router sets on it. */
function PageLink(props: Omit<LinkComponentProps, "className">) {
  return (
    <Link
      {...props}
      className="text-muted-foreground hover:text-foreground aria-[current=page]:border-primary aria-[current=page]:text-foreground border-b-2 border-transparent py-2 text-sm whitespace-nowrap sm:py-3"
    />
  );
}

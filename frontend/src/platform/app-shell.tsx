import { Outlet } from "@tanstack/react-router";
import { CheckingTheSession } from "@/platform/checking-the-session";
import { useSession } from "@/platform/session";
import { Button } from "@/ui/shadcn/button";

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
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b px-6 py-3">
        <span className="font-medium">Interview Question Bank</span>
        <span className="ml-auto text-sm">{viewer.email}</span>
        <span className="text-muted-foreground text-sm capitalize">{viewer.role}</span>
        <Button variant="outline" size="sm" onClick={onSignOut}>
          Log out
        </Button>
      </header>
      <main className="flex-1 p-6">
        <Outlet />
      </main>
    </div>
  );
}

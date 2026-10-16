import { Outlet } from "@tanstack/react-router";
import { AppSidebar, PhoneBar } from "@/platform/app-sidebar";
import { CheckingTheSession } from "@/platform/checking-the-session";
import { useSession } from "@/platform/session";
import { useSidebarShrunk } from "@/platform/sidebar-choice";
import { Toaster } from "@/platform/toaster";
import { SidebarProvider } from "@/ui/shadcn/sidebar";

/** The frame every signed-in screen sits inside. It is told how to end the session rather
 * than reaching for it: nothing in `platform/` may import a feature, and logging out
 * belongs to `features/auth/` (ADR-0030). */
export function AppShell({ onSignOut }: { onSignOut: () => void }) {
  const session = useSession();
  const shrunk = useSidebarShrunk();
  // The check let "unknown" through instead of bouncing anyone, so this is the wait while
  // the silent sign-in answers, and "signed-out" is the instant before its redirect lands.
  if (session.status === "unknown") return <CheckingTheSession />;
  if (session.status === "signed-out") return null;

  return (
    // Told whether it is open rather than left to keep track itself, because the library
    // would save that in a cookie the API receives.
    <SidebarProvider open={!shrunk}>
      <AppSidebar viewer={session.viewer} onSignOut={onSignOut} />
      <div className="flex min-w-0 flex-1 flex-col">
        <PhoneBar />
        <main className="flex-1 p-6">
          <Outlet />
        </main>
      </div>
      {/* Here, so a toast outlives the screen that raised it when the act moves to another. */}
      <Toaster />
    </SidebarProvider>
  );
}

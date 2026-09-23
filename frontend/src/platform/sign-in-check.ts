import { redirect } from "@tanstack/react-router";
import type { Session } from "@/platform/session";

/**
 * Sits on the route every signed-in screen hangs off, so a new screen is behind it by
 * being put there rather than by remembering to check. Only "signed-out" is a redirect:
 * while the session is unknown the silent sign-in has not answered, and bouncing a Viewer
 * whose session is about to come back is what the third state exists to prevent (ADR-0008).
 */
export function requireSignedIn(session: Session): void {
  if (session.status === "signed-out") throw redirect({ to: "/login" });
}

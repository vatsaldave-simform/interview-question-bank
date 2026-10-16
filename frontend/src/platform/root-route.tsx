import { createRootRouteWithContext, Outlet } from "@tanstack/react-router";
import type { SidebarMarks } from "@/platform/app-sidebar";
import type { Session } from "@/platform/session";

/** The session is handed to routes rather than read from the module directly, so that
 * changing it re-runs the sign-in check. */
export type RouterContext = {
  session: Session;
  /** Handed in, because logging out belongs to `features/auth/` and nothing in
   * `platform/` may import a feature (ADR-0030). */
  signOut: () => void;
  /** Handed in for the same reason: the lists they count belong to features. */
  sidebarMarks: SidebarMarks;
};

/** No frame of its own: the signed-in shell is a route underneath, so the login screen
 * is not wrapped in one belonging to a session that does not exist. */
export const rootRoute = createRootRouteWithContext<RouterContext>()({ component: Outlet });

import { createRootRouteWithContext, Outlet } from "@tanstack/react-router";
import type { Session } from "@/platform/session";

/** The session is handed to routes rather than read from the module directly, so that
 * changing it re-runs the sign-in check. */
export type RouterContext = {
  session: Session;
  /** Handed in, because logging out belongs to `features/auth/` and nothing in
   * `platform/` may import a feature (ADR-0030). */
  signOut: () => void;
};

/** No header of its own: the signed-in shell is a route underneath, so the login screen
 * is not wrapped in one belonging to a session that does not exist. */
export const rootRoute = createRootRouteWithContext<RouterContext>()({ component: Outlet });

import { createRoute, Outlet, redirect } from "@tanstack/react-router";
import { signedInRoute } from "@/platform/signed-in-route";

/** Here and not in a feature, because the console is a view of several (ADR-0015). */
export const administrationRoute = createRoute({
  getParentRoute: () => signedInRoute,
  path: "/administration",
  // No `beforeLoad` check, because the API refuses each list on the console and it says so.
  component: AdministrationFrame,
});

/** The Role Requests come first, because that is where work waits for an Administrator. */
export const administrationStartRoute = createRoute({
  getParentRoute: () => administrationRoute,
  path: "/",
  beforeLoad: () => {
    throw redirect({ to: "/administration/role-requests", replace: true });
  },
});

/** No menu of its own, because the sidebar already lists each page under Administration. */
function AdministrationFrame() {
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-section">
      <Outlet />
    </div>
  );
}

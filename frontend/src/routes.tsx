import { createRoute, createRouter } from "@tanstack/react-router";
import { authRoutes } from "@/features/auth/auth.routes";
import { signOut } from "@/features/auth/sign-in";
import { ClientList } from "@/features/clients/client-list";
import { ClientGrants } from "@/features/permission-grants/client-grants";
import { questionRoutes } from "@/features/questions/questions.routes";
import { RoleRequestQueue } from "@/features/role-requests/role-request-queue";
import { ViewerList } from "@/features/viewers/viewer-list";
import { rootRoute } from "@/platform/root-route";
import { parseSearch, stringifySearch } from "@/platform/search-params";
import { signedInRoute } from "@/platform/signed-in-route";

/** Here and not in a feature, because the console is a view of several (ADR-0030), and with
 * no check of its own, because the API refuses each list on it and the list says so. */
const administrationRoute = createRoute({
  getParentRoute: () => signedInRoute,
  path: "/administration",
  component: AdministrationConsole,
});

function AdministrationConsole() {
  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-xl font-medium">Administration</h1>
      <RoleRequestQueue />
      <ViewerList />
      <ClientList detail={(client) => <ClientGrants clientId={client.id} />} />
    </div>
  );
}

const routeTree = rootRoute.addChildren([
  ...authRoutes,
  signedInRoute.addChildren([...questionRoutes, administrationRoute]),
]);

/** One per page load, and one per test: the router holds where you are, so a shared
 * instance would carry one test's last address into the next one. */
export function createAppRouter() {
  return createRouter({
    routeTree,
    // Unknown until the silent sign-in answers, which is the truth at the moment the
    // router is built. App replaces it on every render.
    context: { session: { status: "unknown" }, signOut: () => void signOut() },
    parseSearch,
    stringifySearch,
  });
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof createAppRouter>;
  }
}

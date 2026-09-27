import { createRoute, createRouter } from "@tanstack/react-router";
import { authRoutes } from "@/features/auth/auth.routes";
import { signOut } from "@/features/auth/sign-in";
import { ClientList } from "@/features/clients/client-list";
import { ClientGrants } from "@/features/permission-grants/client-grants";
import { questionRoutes } from "@/features/questions/questions.routes";
import { MyRoleRequest } from "@/features/role-requests/my-role-request";
import { RoleRequestQueue } from "@/features/role-requests/role-request-queue";
import { roleWording } from "@/features/viewers/role-wording";
import { ViewerList } from "@/features/viewers/viewer-list";
import { rootRoute } from "@/platform/root-route";
import { useCurrentViewer } from "@/platform/current-viewer";
import { parseSearch, stringifySearch } from "@/platform/search-params";
import { useSession } from "@/platform/session";
import { signedInRoute } from "@/platform/signed-in-route";

/** Here and not in a feature, because the console is a view of several (ADR-0030). */
const administrationRoute = createRoute({
  getParentRoute: () => signedInRoute,
  path: "/administration",
  // No `beforeLoad` check, because the API refuses each list on the console and it says so.
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

/** Here and not in a feature, so the Viewer feature need not depend on the Role Request
 * one. */
const accountRoute = createRoute({
  getParentRoute: () => signedInRoute,
  path: "/account",
  component: AccountPage,
});

function AccountPage() {
  // Asked on every visit, so the role shown here is the one held now.
  useCurrentViewer();
  const session = useSession();
  // The shell renders nothing until there is a signed-in Viewer, so this is never shown.
  if (session.status !== "signed-in") return null;

  const { viewer } = session;
  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-xl font-medium">Your account</h1>
      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-sm">
        <dt className="text-muted-foreground">Email</dt>
        <dd>{viewer.email}</dd>
        <dt className="text-muted-foreground">Role</dt>
        <dd>{roleWording[viewer.role]}</dd>
      </dl>
      <MyRoleRequest heldRole={viewer.role} />
    </div>
  );
}

const routeTree = rootRoute.addChildren([
  ...authRoutes,
  signedInRoute.addChildren([...questionRoutes, administrationRoute, accountRoute]),
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

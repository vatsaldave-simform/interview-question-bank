import { createRoute, createRouter, redirect } from "@tanstack/react-router";
import { authRoutes } from "@/features/auth/auth.routes";
import { signOut } from "@/features/auth/sign-in";
import { clientRoutes } from "@/features/clients/clients.routes";
import { permissionGrantRoutes } from "@/features/permission-grants/permission-grants.routes";
import { browseSearchSchema } from "@/features/questions/browse.schema";
import { useAnyQuestionWaiting } from "@/features/questions/questions.queries";
import { questionRoutes } from "@/features/questions/questions.routes";
import { MyRoleRequest } from "@/features/role-requests/my-role-request";
import { useOpenRoleRequestCount } from "@/features/role-requests/role-requests.queries";
import { roleRequestRoutes } from "@/features/role-requests/role-requests.routes";
import { roleWording } from "@/features/viewers/role-wording";
import { viewerRoutes } from "@/features/viewers/viewers.routes";
import { HomePage } from "@/home-page";
import { administrationRoute, administrationStartRoute } from "@/platform/administration-route";
import { rootRoute } from "@/platform/root-route";
import { useCurrentViewer } from "@/platform/current-viewer";
import { parseSearch, stringifySearch } from "@/platform/search-params";
import { useSession } from "@/platform/session";
import { signedInRoute } from "@/platform/signed-in-route";
import { PageHeader } from "@/ui/page-header";

const homeRoute = createRoute({
  getParentRoute: () => signedInRoute,
  path: "/",
  validateSearch: browseSearchSchema,
  beforeLoad: ({ search }) => {
    // Browse lived here before Home, so a link saved then still opens its filter, and Back
    // skips this address rather than being sent on again.
    if (Object.keys(search).length > 0) throw redirect({ to: "/questions", search, replace: true });
  },
  component: Home,
});

function Home() {
  const navigate = homeRoute.useNavigate();
  return (
    <HomePage onSearch={(keywords) => void navigate({ to: "/questions", search: { keywords } })} />
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
    <div className="mx-auto flex max-w-3xl flex-col gap-8">
      <PageHeader title="Your account" />
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
  signedInRoute.addChildren([
    homeRoute,
    ...questionRoutes,
    administrationRoute.addChildren([
      administrationStartRoute,
      ...roleRequestRoutes,
      ...viewerRoutes,
      ...clientRoutes,
      ...permissionGrantRoutes,
    ]),
    accountRoute,
  ]),
]);

/** One per page load, and one per test: the router holds where you are, so a shared
 * instance would carry one test's last address into the next one. */
export function createAppRouter() {
  return createRouter({
    routeTree,
    // Unknown until the silent sign-in answers, which is the truth at the moment the
    // router is built. App replaces it on every render.
    context: {
      session: { status: "unknown" },
      signOut: () => void signOut(),
      sidebarMarks: { useAnyQuestionWaiting, useOpenRoleRequestCount },
    },
    parseSearch,
    stringifySearch,
  });
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof createAppRouter>;
  }
}

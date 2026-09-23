import { createRoute, createRouter } from "@tanstack/react-router";
import { authRoutes } from "@/features/auth/auth.routes";
import { signOut } from "@/features/auth/sign-in";
import { AppShell } from "@/platform/app-shell";
import { rootRoute } from "@/platform/root-route";
import { parseSearch, stringifySearch } from "@/platform/search-params";
import { requireSignedIn } from "@/platform/sign-in-check";
import { Card, CardDescription, CardHeader, CardTitle } from "@/ui/shadcn/card";

/** Carries no path of its own, so a route added underneath is behind the sign-in check by
 * where it was put rather than by remembering to check. */
const signedInRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "signed-in",
  beforeLoad: ({ context }) => {
    requireSignedIn(context.session);
  },
  component: () => <AppShell onSignOut={() => void signOut()} />,
});

/** Stands here until #14 puts browsing at this address. An empty page reads as a fault,
 * so it says what is and is not built yet. */
const homeRoute = createRoute({
  getParentRoute: () => signedInRoute,
  path: "/",
  component: () => (
    <Card className="max-w-md">
      <CardHeader>
        <CardTitle>You are signed in</CardTitle>
        <CardDescription>
          Browsing, contributing and reviewing Questions arrive with the tickets that build
          them. What works today is signing in, staying signed in across a reload, and
          logging out.
        </CardDescription>
      </CardHeader>
    </Card>
  ),
});

const routeTree = rootRoute.addChildren([
  ...authRoutes,
  signedInRoute.addChildren([homeRoute]),
]);

/** One per page load, and one per test: the router holds where you are, so a shared
 * instance would carry one test's last address into the next one. */
export function createAppRouter() {
  // Unknown until the silent sign-in answers, which is the truth at the moment the router
  // is built. App replaces it on every render.
  return createRouter({
    routeTree,
    context: { session: { status: "unknown" } },
    parseSearch,
    stringifySearch,
  });
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof createAppRouter>;
  }
}

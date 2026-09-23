import { createRoute } from "@tanstack/react-router";
import { AppShell } from "@/platform/app-shell";
import { rootRoute } from "@/platform/root-route";
import { requireSignedIn } from "@/platform/sign-in-check";

/** Carries no path of its own, so a route added underneath is behind the sign-in check by
 * where it was put rather than by remembering to check. */
export const signedInRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "signed-in",
  beforeLoad: ({ context }) => {
    requireSignedIn(context.session);
  },
  component: SignedInShell,
});

function SignedInShell() {
  const { signOut } = signedInRoute.useRouteContext();
  return <AppShell onSignOut={signOut} />;
}

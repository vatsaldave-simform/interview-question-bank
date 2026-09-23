import { createRouter } from "@tanstack/react-router";
import { authRoutes } from "@/features/auth/auth.routes";
import { signOut } from "@/features/auth/sign-in";
import { questionRoutes } from "@/features/questions/questions.routes";
import { rootRoute } from "@/platform/root-route";
import { parseSearch, stringifySearch } from "@/platform/search-params";
import { signedInRoute } from "@/platform/signed-in-route";

const routeTree = rootRoute.addChildren([
  ...authRoutes,
  signedInRoute.addChildren([...questionRoutes]),
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

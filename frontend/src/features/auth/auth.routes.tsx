import { createRoute, redirect } from "@tanstack/react-router";
import { LoginScreen } from "@/features/auth/login-screen";
import { rootRoute } from "@/platform/root-route";

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/login",
  // Outside the sign-in check, and it has to be: this is where the check sends people.
  // The other direction is here instead, and it is also what moves a Viewer on the
  // moment their sign-in succeeds.
  beforeLoad: ({ context }) => {
    if (context.session.status === "signed-in") throw redirect({ to: "/" });
  },
  component: LoginScreen,
});

export const authRoutes = [loginRoute];

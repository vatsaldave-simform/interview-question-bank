import { createRoute, redirect } from "@tanstack/react-router";
import { ForgottenPasswordScreen } from "@/features/auth/forgotten-password-screen";
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

// Beside the login screen and outside the sign-in check, because whoever needs it cannot
// sign in.
const forgottenPasswordRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/forgotten-password",
  component: ForgottenPasswordScreen,
});

export const authRoutes = [loginRoute, forgottenPasswordRoute];

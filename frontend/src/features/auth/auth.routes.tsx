import { createRoute, redirect, useLocation } from "@tanstack/react-router";
import { loginSearchSchema } from "@/features/auth/auth.schema";
import { ForgottenPasswordScreen } from "@/features/auth/forgotten-password-screen";
import { LoginScreen } from "@/features/auth/login-screen";
import { SetPasswordScreen } from "@/features/auth/set-password-screen";
import { signOut } from "@/features/auth/sign-in";
import { rootRoute } from "@/platform/root-route";
import { currentSession } from "@/platform/session";

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/login",
  validateSearch: loginSearchSchema,
  // Outside the sign-in check, and it has to be: this is where the check sends people.
  // The other direction is here instead, and it is also what moves a Viewer on the
  // moment their sign-in succeeds.
  beforeLoad: ({ context }) => {
    if (context.session.status === "signed-in") throw redirect({ to: "/" });
  },
  component: Login,
});

function Login() {
  const { password } = loginRoute.useSearch();
  return <LoginScreen passwordJustSet={password === "set"} />;
}

// Beside the login screen and outside the sign-in check, because whoever needs it cannot
// sign in.
const forgottenPasswordRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/forgotten-password",
  component: ForgottenPasswordScreen,
});

// Outside the sign-in check for the same reason, and without the login screen's redirect,
// so someone signed in who opens a link from their mail can still use it.
const setPasswordRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/set-password",
  component: SetPassword,
});

/** The backend puts the token after the `#` (`passwordLinkUrl`), which a browser never
 * sends to a server, so it stays out of every request log. */
function tokenIn(hash: string): string | null {
  const token = new URLSearchParams(hash).get("token");
  return token === "" ? null : token;
}

function SetPassword() {
  const token = useLocation({ select: (location) => tokenIn(location.hash) });
  const navigate = setPasswordRoute.useNavigate();

  async function toTheLoginScreen(): Promise<void> {
    // Setting a password ends that Viewer's sessions, and whoever is signed in here may not
    // own the link at all, so the session here ends too and the link's owner signs in fresh.
    if (currentSession().status === "signed-in") await signOut();
    // Replaced rather than pushed, so going back does not reopen a link already spent.
    await navigate({ to: "/login", search: { password: "set" }, replace: true });
  }

  return <SetPasswordScreen token={token} onSet={() => void toTheLoginScreen()} />;
}

export const authRoutes = [loginRoute, forgottenPasswordRoute, setPasswordRoute];

import { Link } from "@tanstack/react-router";
import { DemoCredentials } from "@/features/auth/demo-credentials";
import { LoginForm } from "@/features/auth/login-form";
import { SplitScreen } from "@/features/auth/split-screen";
import { ColdStartNotice } from "@/platform/cold-start-notice";
import { Alert, AlertDescription, AlertTitle } from "@/ui/shadcn/alert";

/** The whole of what someone who is not signed in sees: the form, why the first load is
 * slow, and the credentials to get in with. */
export function LoginScreen({ passwordJustSet }: { passwordJustSet: boolean }) {
  return (
    <SplitScreen title="Sign in" description="Use the email an Administrator added you with.">
      {passwordJustSet && (
        <Alert>
          <AlertTitle>Your password is set.</AlertTitle>
          <AlertDescription>Sign in with it below.</AlertDescription>
        </Alert>
      )}
      <LoginForm />
      <Link to="/forgotten-password" className="text-primary self-start text-sm hover:underline">
        Forgotten your password?
      </Link>
      <DemoCredentials />
      <ColdStartNotice />
    </SplitScreen>
  );
}

import { Link } from "@tanstack/react-router";
import { DemoCredentials } from "@/features/auth/demo-credentials";
import { LoginForm } from "@/features/auth/login-form";
import { ColdStartNotice } from "@/platform/cold-start-notice";
import { Alert, AlertDescription, AlertTitle } from "@/ui/shadcn/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/ui/shadcn/card";

/** The whole of what someone who is not signed in sees: the form, why the first load is
 * slow, and the credentials to get in with. */
export function LoginScreen({ passwordJustSet }: { passwordJustSet: boolean }) {
  return (
    <main className="flex min-h-svh items-center justify-center p-6">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Interview Question Bank</CardTitle>
            <CardDescription>Sign in to browse and contribute Questions.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            {passwordJustSet && (
              <Alert>
                <AlertTitle>Your password is set.</AlertTitle>
                <AlertDescription>Sign in with it below.</AlertDescription>
              </Alert>
            )}
            <LoginForm />
            <Link
              to="/forgotten-password"
              className="text-muted-foreground text-sm hover:underline"
            >
              Forgotten your password?
            </Link>
          </CardContent>
        </Card>
        <ColdStartNotice />
        <DemoCredentials />
      </div>
    </main>
  );
}

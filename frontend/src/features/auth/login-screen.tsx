import { DemoCredentials } from "@/features/auth/demo-credentials";
import { LoginForm } from "@/features/auth/login-form";
import { ColdStartNotice } from "@/platform/cold-start-notice";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/ui/shadcn/card";

/** The whole of what someone who is not signed in sees: the form, why the first load is
 * slow, and the credentials to get in with. */
export function LoginScreen() {
  return (
    <main className="flex min-h-svh items-center justify-center p-6">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Interview Question Bank</CardTitle>
            <CardDescription>Sign in to browse and contribute Questions.</CardDescription>
          </CardHeader>
          <CardContent>
            <LoginForm />
          </CardContent>
        </Card>
        <ColdStartNotice />
        <DemoCredentials />
      </div>
    </main>
  );
}

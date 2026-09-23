import { DemoCredentials } from "@/features/auth/demo-credentials";
import { LoginForm } from "@/features/auth/login-form";
import { Alert, AlertDescription, AlertTitle } from "@/ui/shadcn/alert";
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
        {/*
          The deployed service sleeps after fifteen minutes and takes about a minute to
          wake (ADR-0012). Saying so is the difference between a visitor reading the wait
          as slow and reading it as broken.
        */}
        <Alert>
          <AlertTitle>The first visit of the day is slow</AlertTitle>
          <AlertDescription>
            Hosted on a free tier that sleeps when idle. The first visit after a quiet
            spell takes about a minute to wake; later ones are immediate.
          </AlertDescription>
        </Alert>
        <DemoCredentials />
      </div>
    </main>
  );
}

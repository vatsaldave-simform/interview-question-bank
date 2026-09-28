import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { SetPasswordForm } from "@/features/auth/set-password-form";
import { Alert, AlertDescription, AlertTitle } from "@/ui/shadcn/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/ui/shadcn/card";

const incompleteLink =
  "This link is not complete. Open it again from your email, or ask for a new one.";

type SetPasswordScreenProps = {
  /** Null when the link arrived without a token, as it does when only part of it was copied. */
  token: string | null;
  onSet: () => void;
};

/** Where a Password Link opens, for a new Viewer and for one who asked for a reset alike. */
export function SetPasswordScreen({ token, onSet }: SetPasswordScreenProps) {
  const [linkRefusal, setLinkRefusal] = useState<string | null>(null);

  return (
    <main className="flex min-h-svh items-center justify-center p-6">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Set your password</CardTitle>
            <CardDescription>Choose the password you will sign in with.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            {token !== null && linkRefusal === null ? (
              <SetPasswordForm token={token} onSet={onSet} onLinkRefused={setLinkRefusal} />
            ) : (
              // No form: pressing the button again could never work, and a form still on
              // screen says it might.
              <>
                <Alert variant="destructive">
                  <AlertTitle>This link does not work.</AlertTitle>
                  <AlertDescription>{linkRefusal ?? incompleteLink}</AlertDescription>
                </Alert>
                <Link
                  to="/forgotten-password"
                  className="text-primary text-sm font-medium hover:underline"
                >
                  Ask for a new link
                </Link>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

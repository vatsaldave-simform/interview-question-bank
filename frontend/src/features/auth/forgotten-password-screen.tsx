import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { ForgottenPasswordForm } from "@/features/auth/forgotten-password-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/ui/shadcn/card";

/** Where a Viewer who cannot sign in asks for a Password Link, without an Administrator. */
export function ForgottenPasswordScreen() {
  const [sent, setSent] = useState(false);

  return (
    <main className="flex min-h-svh items-center justify-center p-6">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Forgotten your password?</CardTitle>
            <CardDescription>
              Enter the address you sign in with, and we will email it a link to set a new
              password.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            {sent ? (
              // The same words for every address, and the address is not repeated: the API
              // gives nothing away about which ones have an account, and neither may this.
              <p className="text-sm" role="status">
                Check your email. If an account uses that address, a link to set a new
                password is on its way. It works once.
              </p>
            ) : (
              <ForgottenPasswordForm onSent={() => setSent(true)} />
            )}
            <Link to="/login" className="text-primary text-sm hover:underline">
              ← Back to sign in
            </Link>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

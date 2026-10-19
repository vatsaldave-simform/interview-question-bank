import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { ForgottenPasswordForm } from "@/features/auth/forgotten-password-form";
import { SplitScreen } from "@/features/auth/split-screen";

/** Where a Viewer who cannot sign in asks for a Password Link, without an Administrator. */
export function ForgottenPasswordScreen() {
  const [sent, setSent] = useState(false);

  return (
    <SplitScreen
      title="Forgotten your password?"
      description="Enter the address you sign in with, and we will email it a link to set a new password."
    >
      {sent ? (
        // The same words for every address, and the address is not repeated: the API
        // gives nothing away about which ones have an account, and neither may this.
        <p className="text-sm" role="status">
          Check your email. If an account uses that address, a link to set a new password is on
          its way. It works once.
        </p>
      ) : (
        <ForgottenPasswordForm onSent={() => setSent(true)} />
      )}
      <Link to="/login" className="text-primary self-start text-sm hover:underline">
        ← Back to sign in
      </Link>
    </SplitScreen>
  );
}

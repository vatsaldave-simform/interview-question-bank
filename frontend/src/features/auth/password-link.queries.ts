import type { PasswordResetRequest, SetPasswordRequest } from "@iqb/shared";
import { useMutation } from "@tanstack/react-query";
import { callApiWithoutAnswer } from "@/platform/api-client";

/** Answered 202 whether or not the address has an account (ADR-0016), so a success says
 * only that the request arrived. */
export function useAskForPasswordLink() {
  return useMutation({
    mutationFn: (request: PasswordResetRequest) =>
      callApiWithoutAnswer("/api/auth/password-reset", { method: "POST", body: request }),
  });
}

/** The API answers with no session, so the Viewer signs in afterwards. */
export function useSetPassword() {
  return useMutation({
    mutationFn: (request: SetPasswordRequest) =>
      callApiWithoutAnswer("/api/auth/set-password", { method: "POST", body: request }),
  });
}

import { passwordLinkUrl, type PasswordLinkConfig } from "../auth/password-link.ts";
import type { IssuedPasswordToken } from "../auth/password-token.ts";
import type { MailMessage } from "../../platform/mail.ts";

export type SetPasswordLinkConfig = PasswordLinkConfig;

export function setPasswordMessage(
  to: string,
  issued: IssuedPasswordToken,
  appUrl: string,
): MailMessage {
  return {
    to,
    subject: "Set your password for the Interview Question Bank",
    text: [
      "An Administrator has added you to the Interview Question Bank.",
      "",
      "Set your password here:",
      passwordLinkUrl(appUrl, issued.token),
      "",
      `The link works once, and stops working at ${issued.expiresAt.toUTCString()}.`,
      "",
    ].join("\n"),
  };
}

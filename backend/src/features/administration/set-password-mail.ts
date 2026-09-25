import type { IssuedPasswordToken, PasswordTokenConfig } from "../auth/password-token.ts";
import type { MailMessage } from "../../platform/mail.ts";

/** Read from the environment once at startup: where the link points, and how long it works. */
export type SetPasswordLinkConfig = PasswordTokenConfig & { appUrl: string };

function setPasswordLink(appUrl: string, token: string): string {
  const link = new URL("/set-password", appUrl);
  // After the `#`, which a browser never sends to a server, so opening the link keeps
  // the token out of every request log and Referer header.
  link.hash = `token=${token}`;
  return link.toString();
}

export function setPasswordMail(
  to: string,
  issued: IssuedPasswordToken,
  appUrl: string,
): MailMessage {
  return {
    to,
    subject: "Set your password for the Interview Question Bank",
    text: [
      "An Administrator has created an account for you on the Interview Question Bank.",
      "",
      "Set your password here:",
      setPasswordLink(appUrl, issued.token),
      "",
      `The link works once, and stops working at ${issued.expiresAt.toUTCString()}.`,
      "",
    ].join("\n"),
  };
}

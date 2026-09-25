import { passwordLinkUrl } from "./password-link.ts";
import type { IssuedPasswordToken } from "./password-token.ts";
import type { MailMessage } from "../../platform/mail.ts";

export function passwordResetMessage(
  to: string,
  issued: IssuedPasswordToken,
  appUrl: string,
): MailMessage {
  return {
    to,
    subject: "Reset your password for the Interview Question Bank",
    text: [
      "Someone asked to reset the password for this address on the Interview Question Bank.",
      "",
      "Choose a new password here:",
      passwordLinkUrl(appUrl, issued.token),
      "",
      `The link works once, and stops working at ${issued.expiresAt.toUTCString()}.`,
      "If you did not ask for this, you can ignore this mail.",
      "Nothing changes until the link is used.",
      "",
    ].join("\n"),
  };
}

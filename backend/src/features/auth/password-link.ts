import type { PasswordTokenConfig } from "./password-token.ts";
import type { Mailer } from "../../platform/mail.ts";

/** A new Viewer's link and a reset link open the same page, which spends either one. */
export type PasswordLinkConfig = PasswordTokenConfig & { appUrl: string };

export type PasswordMailDependencies = { mailer: Mailer; settings: PasswordLinkConfig };

export function passwordLinkUrl(appUrl: string, token: string): string {
  const link = new URL("/set-password", appUrl);
  // After the `#`, which a browser never sends to a server, so opening the link keeps
  // the token out of every request log and Referer header.
  link.hash = `token=${token}`;
  return link.toString();
}

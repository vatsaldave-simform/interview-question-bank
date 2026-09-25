import type { PasswordTokenConfig } from "./password-token.ts";

/** A new Viewer's link and a reset link open the same page, which spends either one. */
export type PasswordLinkConfig = PasswordTokenConfig & { appUrl: string };

export function passwordLinkUrl(appUrl: string, token: string): string {
  const link = new URL("/set-password", appUrl);
  // After the `#`, which a browser never sends to a server, so opening the link keeps
  // the token out of every request log and Referer header.
  link.hash = `token=${token}`;
  return link.toString();
}

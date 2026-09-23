import type { Request, Response } from "express";
import type { IssuedRefreshToken } from "./refresh-token.ts";

// Limited to the routes that read it, so it is not sent on every other API request.
const path = "/api/auth";

const name = "iqb_refresh";

export type RefreshCookieConfig = {
  /** False only where the API is served over http, which is a laptop (ADR-0008). */
  secure: boolean;
};

/** httpOnly, Secure and SameSite, because script must never read it (ADR-0008). */
export function setRefreshCookie(
  res: Response,
  { token, expiresAt }: IssuedRefreshToken,
  { secure }: RefreshCookieConfig,
): void {
  res.cookie(name, token, {
    httpOnly: true,
    secure,
    sameSite: "strict",
    path,
    expires: expiresAt,
  });
}

/**
 * The attributes have to match the ones it was set with or the browser keeps the
 * cookie, so a logout that looked like it worked would leave the token in place.
 */
export function clearRefreshCookie(res: Response, { secure }: RefreshCookieConfig): void {
  res.clearCookie(name, { httpOnly: true, secure, sameSite: "strict", path });
}

export function presentedRefreshToken(req: Request): string | undefined {
  const presented: unknown = req.cookies?.[name];
  return typeof presented === "string" && presented.length > 0 ? presented : undefined;
}

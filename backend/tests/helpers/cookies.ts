/** The refresh cookie's name, as the API sets it. */
const name = "iqb_refresh";

function setCookieLine(response: Response): string {
  const line = response.headers.getSetCookie().find((header) => header.startsWith(`${name}=`));
  if (line === undefined) throw new Error("The response set no refresh cookie.");
  return line;
}

/** Every attribute the API set, lower-cased, for a test that asserts on them. */
export function refreshCookieAttributes(response: Response): string[] {
  return setCookieLine(response)
    .split(";")
    .slice(1)
    .map((attribute) => attribute.trim().toLowerCase());
}

/** The token the API put in the cookie, which is all a client ever holds of it. */
export function refreshCookieValue(response: Response): string {
  return setCookieLine(response).slice(`${name}=`.length).split(";")[0] ?? "";
}

/** Whether a response set the cookie at all, for asserting that one did not. */
export function setsRefreshCookie(response: Response): boolean {
  return response.headers.getSetCookie().some((line) => line.startsWith(`${name}=`));
}

/** A Cookie header carrying one token, the way a browser would send it back. */
export function refreshCookieHeader(token: string): Record<string, string> {
  return { cookie: `${name}=${token}` };
}

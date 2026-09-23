import {
  loginResponseSchema,
  refreshResponseSchema,
  type LoginRequest,
  type LoginResponse,
} from "@iqb/shared";
import { ApiFailure, callApi, callApiWithoutAnswer } from "@/platform/api-client";
import { replaceSession } from "@/platform/session";

/**
 * How long before the access token expires the next one is asked for. The shared schema
 * sends `expiresInSeconds` so a client can refresh ahead of expiry rather than find out
 * through a request that failed, and this is the margin that buys.
 */
const askAgainThisEarlySeconds = 60;

let renewal: ReturnType<typeof setTimeout> | undefined;

/** Stops the next renewal. Called before every state change, so a signed-out client
 * never has a timer still running that would sign it back in. */
export function stopRenewingSession(): void {
  if (renewal !== undefined) clearTimeout(renewal);
  renewal = undefined;
}

function renewBefore(expiresInSeconds: number): void {
  stopRenewingSession();
  // At least a second, so a very short-lived token cannot schedule a timer in the past
  // and spin.
  const after = Math.max(expiresInSeconds - askAgainThisEarlySeconds, 1) * 1000;
  renewal = setTimeout(() => void recoverSession(), after);
}

/** Only an answer from the API gets here, so the token and the Viewer always arrive
 * together and neither can be set without the other. */
function beginSession(answer: LoginResponse): void {
  replaceSession({ status: "signed-in", accessToken: answer.accessToken, viewer: answer.viewer });
  renewBefore(answer.expiresInSeconds);
}

function endSession(): void {
  stopRenewingSession();
  replaceSession({ status: "signed-out" });
}

/** Credentials in, a session out. What the API refuses is thrown for the form to show. */
export async function signIn(credentials: LoginRequest): Promise<void> {
  const answer = await callApi("/api/auth/login", loginResponseSchema, {
    method: "POST",
    body: credentials,
  });
  beginSession(answer);
}

/**
 * Turns the refresh cookie into an access token, which is the whole of how a session
 * survives a reload: the token was never written down, but the cookie was (ADR-0008).
 * Also what the renewal timer calls, because recovering and renewing are the same act.
 */
export async function recoverSession(): Promise<void> {
  try {
    const answer = await callApi("/api/auth/refresh", refreshResponseSchema, { method: "POST" });
    beginSession(answer);
  } catch (reason) {
    // No cookie, a spent one, or a bank that did not answer: all of them mean there is
    // no session to show, and the login screen is the honest thing to show instead.
    if (!(reason instanceof ApiFailure)) throw reason;
    endSession();
  }
}

/** Ends the session here whatever the API says. Someone who pressed log out must end up
 * logged out of this browser even if the request never arrived. */
export async function signOut(): Promise<void> {
  try {
    await callApiWithoutAnswer("/api/auth/logout", { method: "POST" });
  } catch (reason) {
    if (!(reason instanceof ApiFailure)) throw reason;
  } finally {
    endSession();
  }
}

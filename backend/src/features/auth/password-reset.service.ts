import { passwordResetMessage } from "./password-reset-mail.ts";
import type { PasswordResetMailDependencies } from "./password-link.ts";
import { issuePasswordToken } from "./password-token.ts";
import { lockPasswordTokensOf, wasPasswordTokenIssuedSince } from "./password-token.repository.ts";
import { findViewerByEmail } from "../viewers/viewers.repository.ts";
import type { Database } from "../../platform/database.ts";
import { log } from "../../platform/logger.ts";

/** The kind of error and no more, because a mail server's message often names the
 * recipient, and this is the one place a Viewer's address could reach the logs. */
function kindOfFailure(error: unknown): Record<string, unknown> {
  if (!(error instanceof Error)) return {};
  // nodemailer's own fields: a short code such as EENVELOPE, and the SMTP reply number.
  const { code, responseCode } = error as Error & { code?: unknown; responseCode?: unknown };
  return { errorName: error.name, code, responseCode };
}

/**
 * Never throws, because it runs after the response has gone, where an error nobody
 * catches ends the process (ADR-0038).
 */
export async function mailPasswordResetLink(
  database: Database,
  { mailer, settings }: PasswordResetMailDependencies,
  email: string,
): Promise<void> {
  let viewerId: string | undefined;
  try {
    const viewer = await findViewerByEmail(database, email);
    // A Viewer with no password yet is sent one: this is how a lost first link is replaced.
    if (viewer === null || viewer.isDeactivated) return;
    viewerId = viewer.id;

    const mailed = await database.$transaction(
      async (transaction) => {
        // Before the check, so a request at the same moment waits and then sees this link.
        await lockPasswordTokensOf(transaction, viewer.id);
        const windowStart = new Date(Date.now() - settings.mailWindowSeconds * 1_000);
        // Any link counts, a new Viewer's first one too (ADR-0040).
        if (await wasPasswordTokenIssuedSince(transaction, viewer.id, windowStart)) return false;
        const issued = await issuePasswordToken(transaction, viewer.id, settings);
        // Last, so a send that fails leaves no token behind and no older link ended.
        await mailer.send(passwordResetMessage(viewer.email, issued, settings.appUrl));
        return true;
      },
      { timeout: 20_000 },
    );
    log().info(
      { viewerId: viewer.id },
      mailed ? "password reset link mailed" : "password reset mail held back",
    );
  } catch (error) {
    log().error({ viewerId, ...kindOfFailure(error) }, "password reset link not mailed");
  } finally {
    // Written whichever way it went, so a reader of the logs can tell "nothing was
    // mailed" apart from "not mailed yet".
    log().debug("password reset request handled");
  }
}

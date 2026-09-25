import { passwordResetMessage } from "./password-reset-mail.ts";
import type { PasswordLinkConfig } from "./password-link.ts";
import { issuePasswordToken } from "./password-token.ts";
import { findViewerByEmail } from "../viewers/viewers.repository.ts";
import type { Database } from "../../platform/database.ts";
import { log } from "../../platform/logger.ts";
import type { Mailer } from "../../platform/mail.ts";

export type PasswordResetMailDependencies = { mailer: Mailer; settings: PasswordLinkConfig };

/**
 * Never throws, because it runs after the response has gone, where an error nobody
 * catches ends the process (ADR-0038).
 */
export async function mailPasswordResetLink(
  database: Database,
  { mailer, settings }: PasswordResetMailDependencies,
  email: string,
): Promise<void> {
  try {
    const viewer = await findViewerByEmail(database, email);
    // A Viewer with no password yet is sent one: this is how a lost first link is replaced.
    if (viewer === null || viewer.isDeactivated) return;

    await database.$transaction(
      async (transaction) => {
        const issued = await issuePasswordToken(transaction, viewer.id, settings);
        // Last, so a send that fails leaves no token behind and no older link ended.
        await mailer.send(passwordResetMessage(viewer.email, issued, settings.appUrl));
      },
      { timeout: 20_000 },
    );
    log().info({ viewerId: viewer.id }, "password reset link mailed");
  } catch (error) {
    log().error({ err: error }, "password reset link not mailed");
  } finally {
    // Written whichever way it went, so a reader of the logs can tell "nothing was
    // mailed" apart from "not mailed yet".
    log().debug("password reset request handled");
  }
}

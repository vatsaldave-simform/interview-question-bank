import { createTransport } from "nodemailer";

/** Plain text and nothing else: the spec rules out templates and HTML bodies (#20). */
export type MailMessage = { to: string; subject: string; text: string };

/** The only way mail leaves the API, so the suite can hand it one that just records. */
export type Mailer = { send: (message: MailMessage) => Promise<void> };

export type SmtpMailerConfig = {
  /** An smtp:// or smtps:// URL with the credentials in it: a provider when deployed,
   * Mailpit locally (ADR-0037). */
  url: string;
  /** The sender every message names. The provider refuses one it has not verified. */
  from: string;
  /** Off only for a local server with no TLS, because without it someone in the middle
   * can remove the server's offer to upgrade and read the password as it is sent. */
  requireTls: boolean;
};

export function createSmtpMailer({ url, from, requireTls }: SmtpMailerConfig): Mailer {
  const transport = createTransport(
    {
      url,
      requireTLS: requireTls,
      // Seconds, against nodemailer's minutes: an Administrator is waiting on the send,
      // and so is a database transaction.
      connectionTimeout: 5_000,
      greetingTimeout: 5_000,
      socketTimeout: 5_000,
    },
    { from },
  );

  return {
    send: async (message) => {
      await transport.sendMail(message);
    },
  };
}

import type { MailMessage, Mailer } from "../../src/platform/mail.ts";

/** A Mailer that keeps what it is handed instead of sending it, so a test can read a link
 * out of a mail and follow it over HTTP. */
export type RecordingMailer = Mailer & {
  sent: () => MailMessage[];
  forget: () => void;
  /** The next send throws, as an unreachable mail server would. */
  failNextSend: () => void;
};

export function createRecordingMailer(): RecordingMailer {
  const sent: MailMessage[] = [];
  let failNext = false;

  return {
    send: async (message) => {
      if (failNext) {
        failNext = false;
        throw new Error("The recording mailer was told to fail this send.");
      }
      sent.push(message);
    },
    sent: () => [...sent],
    forget: () => {
      sent.length = 0;
      failNext = false;
    },
    failNextSend: () => {
      failNext = true;
    },
  };
}

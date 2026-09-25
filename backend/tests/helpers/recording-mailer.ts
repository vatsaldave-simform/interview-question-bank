import type { MailMessage, Mailer } from "../../src/platform/mail.ts";

/** A Mailer that keeps what it is handed instead of sending it, so a test can read a link
 * out of a mail and follow it over HTTP. */
export type RecordingMailer = Mailer & {
  sent: () => MailMessage[];
  forget: () => void;
  /** The next send throws, as an unreachable mail server would. */
  failNextSend: () => void;
  /** The next send waits until the function handed back is called, as a slow mail server
   * would keep it waiting. */
  holdNextSend: () => () => void;
};

export function createRecordingMailer(): RecordingMailer {
  const sent: MailMessage[] = [];
  let failNext = false;
  let held: Promise<void> | null = null;

  return {
    send: async (message) => {
      if (held !== null) {
        const waitFor = held;
        held = null;
        await waitFor;
      }
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
      held = null;
    },
    failNextSend: () => {
      failNext = true;
    },
    holdNextSend: () => {
      let release = () => {};
      held = new Promise<void>((resolve) => {
        release = resolve;
      });
      return release;
    },
  };
}

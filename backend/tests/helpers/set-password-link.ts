import type { MailMessage } from "../../src/platform/mail.ts";
import type { TestApi } from "./test-api.ts";

/** Where the suite's links point. Nothing answers there: a test follows a link by
 * sending its token to the API, as the page behind it will. */
export const testAppUrl = "http://app.iqb.test";

const setPasswordLink = /http:\/\/app\.iqb\.test\/set-password#token=([A-Za-z0-9_-]+)/;

/** The token in the one set-password link a mail carries, or a failure naming the mail. */
export function tokenInLink(mail: MailMessage): string {
  const token = setPasswordLink.exec(mail.text)?.[1];
  if (token === undefined) throw new Error(`No set-password link in:\n${mail.text}`);
  return token;
}

/** The token in the last mail sent to an address, the way its owner would open it. */
export function tokenMailedTo(api: TestApi, email: string): string {
  const mail = api.sentMail().findLast((sent) => sent.to === email);
  if (mail === undefined) throw new Error(`Nothing was mailed to ${email}.`);
  return tokenInLink(mail);
}

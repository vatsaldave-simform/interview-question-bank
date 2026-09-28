import { setPasswordRequestSchema, type ViewerRole } from "@iqb/shared";
import { hashPassword } from "../auth/password.ts";
import type { Database } from "../../platform/database.ts";

export type HostedViewer = {
  email: string;
  role: ViewerRole;
  isAdministrator?: boolean;
  /** The environment variable the password is read from, so it is never in git. */
  passwordVariable: string;
};

/**
 * The people who use the hosted bank. Viewers have no name field, so the name lives in
 * the email.
 */
export const hostedViewers: readonly HostedViewer[] = [
  { email: "john.doe@iqb.test", role: "author", passwordVariable: "HOSTED_PASSWORD_JOHN_DOE" },
  {
    email: "jane.doe@iqb.test",
    role: "reviewer",
    // So the hosted bank does not depend on the demo Reviewer for its Administrator.
    isAdministrator: true,
    passwordVariable: "HOSTED_PASSWORD_JANE_DOE",
  },
  {
    email: "shane.austin@iqb.test",
    role: "reader",
    passwordVariable: "HOSTED_PASSWORD_SHANE_AUSTIN",
  },
  {
    email: "cody.rhodes@iqb.test",
    role: "reader",
    passwordVariable: "HOSTED_PASSWORD_CODY_RHODES",
  },
  {
    email: "dwayne.rook@iqb.test",
    role: "reader",
    passwordVariable: "HOSTED_PASSWORD_DWAYNE_ROOK",
  },
];

/** Each hosted Viewer's password, by email. */
export type HostedPasswords = ReadonlyMap<string, string>;

/**
 * Reads every password before anything is written, and names every bad variable at once,
 * so a run against Neon never stops halfway.
 */
export function readHostedPasswords(source: NodeJS.ProcessEnv = process.env): HostedPasswords {
  const passwordSchema = setPasswordRequestSchema.shape.password;
  const passwords = new Map<string, string>();
  const problems: string[] = [];

  for (const viewer of hostedViewers) {
    const value = source[viewer.passwordVariable];
    if (value === undefined || value === "") {
      problems.push(`  ${viewer.passwordVariable}: not set`);
    } else if (!passwordSchema.safeParse(value).success) {
      problems.push(`  ${viewer.passwordVariable}: must be 15 to 128 characters`);
    } else {
      passwords.set(viewer.email, value);
    }
  }

  if (problems.length > 0) {
    throw new Error(`The hosted Viewers' passwords are not usable:\n${problems.join("\n")}`);
  }
  return passwords;
}

/**
 * Safe to run twice, and leaves an existing Viewer untouched, so a password or role
 * someone changed is never reset.
 */
export async function seedHostedViewers(
  database: Database,
  passwords: HostedPasswords,
): Promise<void> {
  for (const viewer of hostedViewers) {
    const password = passwords.get(viewer.email);
    if (password === undefined) throw new Error(`No password was read for ${viewer.email}.`);
    await database.viewer.upsert({
      where: { email: viewer.email },
      update: {},
      create: {
        email: viewer.email,
        role: viewer.role,
        isAdministrator: viewer.isAdministrator ?? false,
        passwordHash: await hashPassword(password),
      },
    });
  }
}

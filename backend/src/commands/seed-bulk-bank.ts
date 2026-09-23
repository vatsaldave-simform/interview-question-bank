import { fileURLToPath } from "node:url";
import { loadEnvFile, readEnv } from "../platform/env.ts";
import { createDatabase } from "../platform/database.ts";
import { seedViewerAccounts } from "../features/viewers/viewers.seed.ts";
import { seedClientsAndGrants } from "../features/clients/clients.seed.ts";
import { seedQuestionBank } from "../features/questions/questions.seed.ts";
import {
  defaultBulkBank,
  seedBulkBank,
  type BulkBankOptions,
} from "../features/questions/bulk-bank.seed.ts";

loadEnvFile(fileURLToPath(new URL("../../../.env", import.meta.url)));

/** `pnpm db:seed:bulk [questions] [seed value]`, both optional. */
function readArguments(): BulkBankOptions {
  const [wanted, seed] = process.argv.slice(2);
  const count = wanted === undefined ? defaultBulkBank.count : Number(wanted);
  if (!Number.isInteger(count) || count <= 0) {
    throw new Error(`The number of Questions must be a whole number above zero, not "${wanted}".`);
  }
  return { count, seed: seed ?? defaultBulkBank.seed };
}

const options = readArguments();
const env = readEnv();
const database = createDatabase(env.DATABASE_URL, { poolMax: env.DATABASE_POOL_MAX });

try {
  // The bulk bank hangs from the small seed's Categories, Author and Client, so this
  // runs that seed first. The other direction never happens: `pnpm db:seed` is what
  // someone runs to get a working database, and it stays short enough to read.
  await seedViewerAccounts(database);
  await seedClientsAndGrants(database);
  await seedQuestionBank(database);

  const startedAt = Date.now();
  const summary = await seedBulkBank(database, options);
  const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);

  console.log(
    `The bank from seed value "${options.seed}" holds ${summary.questions} Questions, ` +
      `${summary.restricted} of them restricted to a Client.`,
  );
  console.log(
    `This run wrote ${summary.questionsWritten} Questions and ${summary.tagsWritten} ` +
      `Question-Tag rows, in ${seconds}s.`,
  );
} finally {
  await database.$disconnect();
}

import { fileURLToPath } from "node:url";
import { loadEnvFile, readEnv } from "../platform/env.js";
import { createDatabase } from "../platform/database.js";
import { seedViewerAccounts, seedViewers } from "../features/viewers/viewers.seed.js";
import { seedClientAndGrants } from "../features/clients/clients.seed.js";
import { seedQuestionBank, seedQuestions } from "../features/questions/questions.seed.js";

loadEnvFile(fileURLToPath(new URL("../../../.env", import.meta.url)));

const env = readEnv();
const database = createDatabase(env.DATABASE_URL, { poolMax: env.DATABASE_POOL_MAX });

try {
  await seedViewerAccounts(database);
  // The order is the dependency: Grants are held by Viewers, and a restricted Question
  // points at the Client.
  await seedClientAndGrants(database);
  await seedQuestionBank(database);
  // Written to stdout rather than through the logger: this is a command someone runs
  // and reads, not a service emitting structured lines.
  console.log(`Seeded ${seedViewers.length} Viewers: ${seedViewers.map((v) => v.email).join(", ")}`);
  console.log(`Seeded the Category vocabulary, a Client and ${seedQuestions.length} Questions.`);
} finally {
  await database.$disconnect();
}

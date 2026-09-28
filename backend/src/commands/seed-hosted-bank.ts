import { fileURLToPath } from "node:url";
import { loadEnvFile, readEnv } from "../platform/env.ts";
import { createDatabase } from "../platform/database.ts";
import { readHostedPasswords, seedHostedViewers } from "../features/viewers/hosted-viewers.seed.ts";
import { seedClientsAndGrants } from "../features/clients/clients.seed.ts";
import { hostedClients } from "../features/clients/hosted-clients.seed.ts";
import { seedQuestionBank } from "../features/questions/questions.seed.ts";
import { hostedBank } from "../features/questions/hosted-bank.seed.ts";

loadEnvFile(fileURLToPath(new URL("../../../.env", import.meta.url)));

// Before connecting, so a bad password variable stops the run with nothing written.
const passwords = readHostedPasswords();
const env = readEnv();
const database = createDatabase(env.DATABASE_URL, { poolMax: env.DATABASE_POOL_MAX });

try {
  // The order is the dependency: Grants are held by Viewers, and a restricted Question
  // points at its Client.
  await seedHostedViewers(database, passwords);
  await seedClientsAndGrants(database, hostedClients);
  await seedQuestionBank(database, hostedBank);

  const restricted = hostedBank.questions.filter((question) => question.restrictedTo).length;
  console.log(`Seeded ${passwords.size} Viewers: ${[...passwords.keys()].join(", ")}`);
  console.log(
    `Seeded ${hostedClients.length} Clients and ${hostedBank.questions.length} Questions, ` +
      `${restricted} of them restricted to a Client.`,
  );
} finally {
  await database.$disconnect();
}

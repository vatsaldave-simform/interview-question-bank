import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnvFile, readEnv } from "../platform/env.js";
import { createDatabase } from "../platform/database.js";
import {
  capturePlan,
  scenariosForTheBank,
  vacuumAndAnalyze,
  type CapturedPlan,
} from "../features/questions/query-plans.js";

loadEnvFile(fileURLToPath(new URL("../../../.env", import.meta.url)));

/** `pnpm db:measure:plans [label]`. The label names the file, so a run before an index
 * and a run after it can sit beside each other. */
const label = process.argv[2] ?? "plans";
if (!/^[a-z0-9-]+$/.test(label)) {
  throw new Error(`The label must be lower-case letters, numbers and dashes, not "${label}".`);
}

const writeTo = fileURLToPath(
  new URL(`../../../docs/evidence/query-plans/${label}.md`, import.meta.url),
);

function asMarkdown(bank: number, captured: CapturedPlan[], measuredAt: string): string {
  const summary = captured.map(
    (one) =>
      `| ${one.scenario.name} | ${one.milliseconds.toFixed(2)} | ${one.buffers} | ` +
      `${one.readsTheWholeTable ? "**yes**" : "no"} | ${one.indexes.join(", ") || "none"} |`,
  );

  const plans = captured.map(
    (one) =>
      `### ${one.scenario.name}\n\n${one.scenario.why}\n\n` +
      "```\n" +
      `${one.plan}\n` +
      "```\n",
  );

  return [
    `# Query plans at ${bank.toLocaleString("en-GB")} Questions`,
    "",
    "Captured by `pnpm db:measure:plans` against the compose PostgreSQL, never against the",
    "deployment: free-tier compute is throttled and shared, so a timing taken there measures",
    "the host's spare capacity rather than the indexing decision it is meant to defend",
    "(ADR-0012).",
    "",
    `Measured at ${measuredAt}. Every statement is the one the search sends, taken from the`,
    "repository itself rather than retyped here, so this cannot get out of sync with what",
    "ships. Each plan is the second of two runs, so it is not measuring a cold cache.",
    "",
    "| scenario | ms | pages | whole table read | indexes used |",
    "| --- | ---: | ---: | --- | --- |",
    ...summary,
    "",
    "## The plans",
    "",
    ...plans,
  ].join("\n");
}

const env = readEnv();
const database = createDatabase(env.DATABASE_URL, { poolMax: env.DATABASE_POOL_MAX });

try {
  const bank = await database.question.count();
  if (bank < 1_000) {
    throw new Error(
      `The bank holds ${bank} Questions, which is too few to measure. ` +
        "Run `pnpm db:seed:bulk` first.",
    );
  }

  await vacuumAndAnalyze(database);
  const scenarios = await scenariosForTheBank(database);

  const captured: CapturedPlan[] = [];
  for (const scenario of scenarios) {
    const plan = await capturePlan(database, scenario);
    captured.push(plan);
    console.log(
      `${plan.readsTheWholeTable ? "whole table" : "index      "}  ` +
        `${plan.milliseconds.toFixed(2).padStart(8)}ms  ` +
        `${String(plan.buffers).padStart(7)} pages  ${plan.scenario.name}`,
    );
  }

  await mkdir(dirname(writeTo), { recursive: true });
  await writeFile(writeTo, asMarkdown(bank, captured, new Date().toISOString()));
  console.log(`\nWritten to docs/evidence/query-plans/${label}.md`);
} finally {
  await database.$disconnect();
}

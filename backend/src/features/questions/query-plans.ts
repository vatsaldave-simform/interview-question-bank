import {
  defaultQuestionPageSize,
  type CategoryName,
  type Viewer,
  type ViewerRole,
} from "@iqb/shared";
import { Prisma } from "../../generated/prisma/client.ts";
import type { Database } from "../../platform/database.ts";
import { seedViewerByRole } from "../viewers/viewers.seed.ts";
import { bankVocabulary } from "./bulk-bank.seed.ts";
import { searchStatement, type QuestionSearch } from "./questions.repository.ts";

/** One query worth capturing a plan for, and why it is in the set. */
export type PlanScenario = {
  name: string;
  why: string;
  viewer: Viewer;
  search: QuestionSearch;
};

/** What one run of `EXPLAIN (ANALYZE, BUFFERS)` said, plus the three things the ticket
 * asks the plans to answer: how long, how many pages, and which indexes. */
export type CapturedPlan = {
  scenario: PlanScenario;
  plan: string;
  milliseconds: number;
  buffers: number;
  indexes: string[];
  /** True when the plan reads the whole questions table instead of using an index. */
  readsTheWholeTable: boolean;
};

/**
 * Two things the bulk seed leaves undone, and a plan measured without either is not
 * reproducible.
 *
 * ANALYZE, because the planner decides from table statistics and writing ten thousand
 * Questions does not update them. VACUUM, because a freshly written table has no
 * visibility map, so an index scan has to visit the heap for every row it finds: the
 * combined query measured 9,632 pages on a fresh load and 1,081 once autovacuum had
 * caught up. Waiting for autovacuum instead would make the evidence depend on how long
 * someone happened to take between seeding and measuring.
 */
export async function vacuumAndAnalyze(database: Database): Promise<void> {
  await database.$executeRawUnsafe(
    "VACUUM (ANALYZE) questions, question_tags, tags, categories, permission_grants",
  );
}

/** Twice, keeping the second. The first run pays for pages that are not in the cache
 * yet, which measures this machine rather than the query. */
export async function capturePlan(
  database: Database,
  scenario: PlanScenario,
): Promise<CapturedPlan> {
  await explain(database, scenario);
  const plan = await explain(database, scenario);
  return { scenario, plan, ...readPlan(plan) };
}

async function explain(database: Database, { viewer, search }: PlanScenario): Promise<string> {
  const rows = await database.$queryRaw<{ "QUERY PLAN": string }[]>(
    Prisma.sql`EXPLAIN (ANALYZE, BUFFERS) ${searchStatement(viewer, search)}`,
  );
  return rows.map((row) => row["QUERY PLAN"]).join("\n");
}

const executionTime = /Execution Time: ([\d.]+) ms/;
/** The first one belongs to the top node, whose count already includes its children. */
const topBuffers = /Buffers: shared ([^\n]*)/;
const indexUsed = /(?:Index Scan using|Index Only Scan using|Bitmap Index Scan on) (\S+)/g;

/** The three things the summary table reports, pulled out of the plan text. Exported
 * because a mistake here makes the committed evidence say something the plan does not. */
export function readPlan(plan: string): Omit<CapturedPlan, "scenario" | "plan"> {
  const time = executionTime.exec(plan);
  const buffers = topBuffers.exec(plan);
  return {
    milliseconds: time === null ? 0 : Number(time[1]),
    buffers: buffers === null ? 0 : pagesTouched(buffers[1]!),
    indexes: [...new Set([...plan.matchAll(indexUsed)].map((found) => found[1]!))].sort(),
    readsTheWholeTable: /Seq Scan on questions/.test(plan),
  };
}

/** Pages found in the cache and pages read from disk together, which is the number
 * ADR-0011 compared two SQL shapes on. */
function pagesTouched(line: string): number {
  return [...line.matchAll(/(?:hit|read)=(\d+)/g)].reduce(
    (total, found) => total + Number(found[1]),
    0,
  );
}

type TagReach = { id: string; value: string; questions: number };

/** Every Tag of one Category with how many Questions carry it, commonest first. Read
 * from the bank rather than assumed: which Tag is common depends on the seed value. */
async function tagsByReach(database: Database, category: CategoryName): Promise<TagReach[]> {
  return database.$queryRaw<TagReach[]>`
    SELECT t.id, t.value, count(qt."questionId")::int AS questions
      FROM tags t
      JOIN categories c ON c.id = t."categoryId"
      LEFT JOIN question_tags qt ON qt."tagId" = t.id
     WHERE c.name = ${category}
     GROUP BY t.id, t.value
     ORDER BY questions DESC, t.value ASC
  `;
}

/** The seeded Viewer of each role, as the API would have them after signing in. */
async function seededViewers(database: Database): Promise<Record<ViewerRole, Viewer>> {
  const roles: ViewerRole[] = ["reader", "author", "reviewer"];
  const found = await Promise.all(
    roles.map((role) =>
      database.viewer.findUniqueOrThrow({
        where: { email: seedViewerByRole(role).email },
        select: { id: true, email: true, role: true, isAdministrator: true },
      }),
    ),
  );
  return Object.fromEntries(found.map((viewer) => [viewer.role, viewer])) as Record<
    ViewerRole,
    Viewer
  >;
}

/** Deep enough that the page cannot be filled before the skipped rows have been produced
 * and thrown away, which is where the limit-and-offset ceiling shows up. */
const deepOffset = 2_000;

/**
 * The set of queries the plans are captured for. Each one changes a single thing about
 * the one above it, so a plan that differs says which change caused it.
 */
export async function scenariosForTheBank(database: Database): Promise<PlanScenario[]> {
  const viewer = await seededViewers(database);
  const technology = await tagsByReach(database, "technology");
  const seniority = await tagsByReach(database, "seniority");

  const commonTag = technology[0]!;
  const rareTag = technology[technology.length - 1]!;
  const commonSeniority = seniority[0]!;

  const inCategory = (category: CategoryName, tag: TagReach) => ({
    category,
    tagIds: [tag.id],
  });
  const page = { limit: defaultQuestionPageSize, offset: 0 };

  const broadWord = bankVocabulary[0];
  const narrowWord = bankVocabulary[bankVocabulary.length - 1]!;
  const pair = `${bankVocabulary[11]} ${bankVocabulary[16]}`;

  return [
    {
      name: "a broad keyword, no Category",
      why:
        "The keyword alone, matching about half the bank. The baseline every other plan is read " +
        "against.",
      viewer: viewer.reader,
      search: { keywords: broadWord, tagsPerCategory: [], ...page },
    },
    {
      name: "a narrow keyword, no Category",
      why:
        "The same query aimed at one Question in fifty. The planner should not answer it " +
        "the same way.",
      viewer: viewer.reader,
      search: { keywords: narrowWord, tagsPerCategory: [], ...page },
    },
    {
      name: "two keywords, no Category",
      why: "Two words are AND-ed, which reaches a smaller part of the bank than either word alone.",
      viewer: viewer.reader,
      search: { keywords: pair, tagsPerCategory: [], ...page },
    },
    {
      name: "a broad keyword and a common Tag",
      why:
        "The combined query this ticket exists for: the keyword index and the Tag index are both " +
        "usable, and the planner has to choose.",
      viewer: viewer.reader,
      search: {
        keywords: broadWord,
        tagsPerCategory: [inCategory("technology", commonTag)],
        ...page,
      },
    },
    {
      name: "a broad keyword and a rare Tag",
      why:
        "The same pair with the selective half swapped onto the Tag, which is where driving from " +
        "question_tags should start to win.",
      viewer: viewer.reader,
      search: {
        keywords: broadWord,
        tagsPerCategory: [inCategory("technology", rareTag)],
        ...page,
      },
    },
    {
      name: "a narrow keyword and a common Tag",
      why: "Selective on the keyword instead, so the two indexes swap roles.",
      viewer: viewer.reader,
      search: {
        keywords: narrowWord,
        tagsPerCategory: [inCategory("technology", commonTag)],
        ...page,
      },
    },
    {
      name: "a broad keyword and two Categories",
      why:
        "One EXISTS per Category is the shape ADR-0011 chose; this is that shape with the search " +
        "on top of it.",
      viewer: viewer.reader,
      search: {
        keywords: broadWord,
        tagsPerCategory: [
          inCategory("technology", commonTag),
          inCategory("seniority", commonSeniority),
        ],
        ...page,
      },
    },
    {
      name: "a broad keyword, a deep page",
      why:
        "Where the limit-and-offset ceiling sits: the skipped rows still have to be produced and " +
        "thrown away.",
      viewer: viewer.reader,
      search: {
        keywords: broadWord,
        tagsPerCategory: [],
        limit: defaultQuestionPageSize,
        offset: deepOffset,
      },
    },
    {
      name: "a broad keyword, as the Author",
      why:
        "The second check becomes published OR authored by this Viewer, and the Author wrote the " +
        "whole bulk bank.",
      viewer: viewer.author,
      search: { keywords: broadWord, tagsPerCategory: [], ...page },
    },
    {
      name: "a broad keyword, as a Reviewer",
      why:
        "A Reviewer drops the second check entirely (ADR-0013), so this is the widest the query " +
        "ever gets.",
      viewer: viewer.reviewer,
      search: { keywords: broadWord, tagsPerCategory: [], ...page },
    },
  ];
}

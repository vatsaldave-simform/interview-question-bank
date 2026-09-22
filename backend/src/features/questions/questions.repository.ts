import {
  categoryNameSchema,
  type CategoryName,
  type Provenance,
  type PublicationState,
  type QuestionTag,
  type Viewer,
} from "@iqb/shared";
import { Prisma } from "../../generated/prisma/client.js";
import type { Database } from "../../platform/database.js";

/** A Question as the rest of the code sees one: its Tags carry names, not ids. */
export type QuestionFromDb = {
  id: string;
  text: string;
  answerNotes: string;
  authorId: string;
  clientId: string | null;
  publicationState: PublicationState;
  provenance: Provenance;
  source: string | null;
  tags: { category: CategoryName; tag: string }[];
  createdAt: Date;
};

/** The first check: the Question has no Client, or the Viewer holds a Permission Grant
 * for the one it names (ADR-0002). */
function visibleTo(viewer: Viewer): Prisma.QuestionWhereInput {
  return {
    OR: [{ clientId: null }, { client: { permissionGrants: { some: { viewerId: viewer.id } } } }],
  };
}

/**
 * The second check: a Pending or Rejected Question reaches only its Author and Reviewers.
 * A Reviewer gets an empty condition, which cannot widen the visibility check this is
 * AND-ed with, so a Reviewer still sees no Client they hold no Grant for (ADR-0013).
 */
function inTheBankFor(viewer: Viewer): Prisma.QuestionWhereInput {
  if (viewer.role === "reviewer") return {};
  return { OR: [{ publicationState: "published" }, { authorId: viewer.id }] };
}

/** Not exported, and there is no version without the checks: a caller who can write a
 * `where` of their own is the second way in that ends the guarantee (ADR-0003). */
function visibleQuestions(viewer: Viewer): Prisma.QuestionWhereInput {
  return { AND: [visibleTo(viewer), inTheBankFor(viewer)] };
}

const questionFieldsToRead = {
  id: true,
  text: true,
  answerNotes: true,
  authorId: true,
  clientId: true,
  publicationState: true,
  provenance: true,
  source: true,
  createdAt: true,
  tags: { select: { tag: { select: { value: true, category: { select: { name: true } } } } } },
} satisfies Prisma.QuestionSelect;

type QuestionRow = Prisma.QuestionGetPayload<{ select: typeof questionFieldsToRead }>;

function toQuestionFromDb(question: QuestionRow): QuestionFromDb {
  return {
    ...question,
    tags: question.tags.map(({ tag }) => ({
      // Parsed rather than cast: a Category row outside the closed list means the rows
      // and the code are out of sync, which the seed prevents, so fail loudly (ADR-0024).
      category: categoryNameSchema.parse(tag.category.name),
      tag: tag.value,
    })),
  };
}

/** Null for a Question that is not Visible and one that does not exist alike, so a
 * caller cannot tell them apart and cannot answer differently (ADR-0002). */
export async function findVisibleQuestionById(
  database: Database,
  viewer: Viewer,
  id: string,
): Promise<QuestionFromDb | null> {
  const question = await database.question.findFirst({
    where: { AND: [{ id }, visibleQuestions(viewer)] },
    select: questionFieldsToRead,
  });
  return question === null ? null : toQuestionFromDb(question);
}

/** The Tag ids to filter by within one Category. Only the grouping reaches the query;
 * the Category is named so a caller cannot mix two of them into one condition. */
export type TagsInCategory = { category: CategoryName; tagIds: readonly string[] };

export type QuestionQuery = {
  /** One entry per Category named; none of them means the whole bank the Viewer sees. */
  tagsPerCategory: readonly TagsInCategory[];
  limit: number;
  offset: number;
};

/** Prisma sends this as its own `EXISTS` over `question_tags`, which is the shape
 * ADR-0011 measured against a join and a grouped count. */
function carryingOneOf({ tagIds }: TagsInCategory): Prisma.QuestionWhereInput {
  return { tags: { some: { tagId: { in: [...tagIds] } } } };
}

/** Built on the same `visibleQuestions` as every other read, so both checks are
 * conditions in this one statement rather than a second pass (ADR-0003). */
export async function findVisibleQuestions(
  database: Database,
  viewer: Viewer,
  { tagsPerCategory, limit, offset }: QuestionQuery,
): Promise<QuestionFromDb[]> {
  const questions = await database.question.findMany({
    where: { AND: [visibleQuestions(viewer), ...tagsPerCategory.map(carryingOneOf)] },
    // The id settles a createdAt tie, so no Question shifts between two pages.
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit,
    skip: offset,
    select: questionFieldsToRead,
  });
  return questions.map(toQuestionFromDb);
}

/** The same thing `visibleTo` and `inTheBankFor` say, in SQL, because the search below
 * is hand written and cannot take a `where` (ADR-0026). */
function visibleQuestionsInSql(viewer: Viewer): Prisma.Sql {
  const visible = Prisma.sql`(
    q."clientId" IS NULL
    OR EXISTS (SELECT 1 FROM permission_grants g
                WHERE g."clientId" = q."clientId" AND g."viewerId" = ${viewer.id}::uuid)
  )`;
  if (viewer.role === "reviewer") return visible;
  return Prisma.sql`${visible} AND (
    q."publicationState" = 'published' OR q."authorId" = ${viewer.id}::uuid
  )`;
}

/** One of these per Category named, which is the shape ADR-0011 measured. */
function carryingOneOfInSql({ tagIds }: TagsInCategory): Prisma.Sql {
  return Prisma.sql`EXISTS (SELECT 1 FROM question_tags qt
                             WHERE qt."questionId" = q.id
                               AND qt."tagId" = ANY(${[...tagIds]}::uuid[]))`;
}

/** What a Viewer typed, alongside the same filters the list takes. */
export type QuestionSearch = QuestionQuery & { keywords: string };

/** The row the search reads back; `tags` arrives as JSON built by the database. */
type SearchRow = Omit<QuestionFromDb, "tags"> & { tags: { category: string; tag: string }[] };

/** Keyword search across Question text and Answer Notes, matched against the stored
 * column rather than a vector worked out per row (ADR-0004). */
export async function searchVisibleQuestions(
  database: Database,
  viewer: Viewer,
  { keywords, tagsPerCategory, limit, offset }: QuestionSearch,
): Promise<QuestionFromDb[]> {
  const conditions = [visibleQuestionsInSql(viewer), ...tagsPerCategory.map(carryingOneOfInSql)];

  const rows = await database.$queryRaw<SearchRow[]>`
    WITH matched AS (
      SELECT q.id, ts_rank(q."searchVector", search.query) AS rank
        FROM questions q,
             -- Never raises on what a person types, which strict to_tsquery does
             -- on anything holding an operator or a stray bracket (ADR-0004).
             websearch_to_tsquery('english', ${keywords}) AS search(query)
       WHERE q."searchVector" @@ search.query
         AND ${Prisma.join(conditions, " AND ")}
       ORDER BY rank DESC, q.id DESC
       LIMIT ${limit} OFFSET ${offset}
    )
    SELECT q.id, q.text, q."answerNotes", q."authorId", q."clientId",
           q."publicationState", q.provenance, q.source, q."createdAt",
           coalesce(carried.tags, '[]'::json) AS tags
      FROM matched
      JOIN questions q ON q.id = matched.id
      -- After the page has been cut, so the Tags of a Question the page left out are
      -- never gathered.
      LEFT JOIN LATERAL (
        SELECT json_agg(json_build_object('category', c.name, 'tag', t.value)) AS tags
          FROM question_tags qt
          JOIN tags t ON t.id = qt."tagId"
          JOIN categories c ON c.id = t."categoryId"
         WHERE qt."questionId" = q.id
      ) carried ON true
     ORDER BY matched.rank DESC, q.id DESC
  `;

  return rows.map((row) => ({
    ...row,
    // Parsed, not cast, for the reason `toQuestionFromDb` parses (ADR-0024).
    tags: row.tags.map((carried) => ({
      category: categoryNameSchema.parse(carried.category),
      tag: carried.tag,
    })),
  }));
}

/** What an Author supplies: no Publication State, which is Pending until a Reviewer
 * moves it (ADR-0013), and no Client, since classifying is its own act (ADR-0018). */
export type NewQuestion = {
  text: string;
  answerNotes: string;
  provenance: Provenance;
  source?: string;
  tagIds: readonly string[];
};

/** The Author is the adding Viewer, never anything the request names. */
export async function insertQuestion(
  database: Database,
  viewer: Viewer,
  question: NewQuestion,
): Promise<QuestionFromDb> {
  const stored = await database.question.create({
    data: {
      text: question.text,
      answerNotes: question.answerNotes,
      authorId: viewer.id,
      provenance: question.provenance,
      ...(question.source === undefined ? {} : { source: question.source }),
      // Deduplicated: naming a Tag twice means what naming it once means, and the
      // join's primary key would otherwise refuse the write.
      tags: { create: [...new Set(question.tagIds)].map((tagId) => ({ tagId })) },
    },
    select: questionFieldsToRead,
  });
  return toQuestionFromDb(stored);
}

/** The Tag rows a request names, however few of them turn out to exist. */
export async function findTagsNamed(
  database: Database,
  tags: readonly QuestionTag[],
): Promise<{ id: string; category: string; tag: string }[]> {
  if (tags.length === 0) return [];

  const rows = await database.tag.findMany({
    // One OR branch per named Tag, each pairing the value with its Category, so a value
    // that exists under a different Category does not match.
    where: { OR: tags.map(({ category, tag }) => ({ value: tag, category: { name: category } })) },
    select: { id: true, value: true, category: { select: { name: true } } },
  });
  return rows.map((row) => ({ id: row.id, category: row.category.name, tag: row.value }));
}

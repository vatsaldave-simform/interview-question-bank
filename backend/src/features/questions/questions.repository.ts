import {
  categoryNameSchema,
  mostNearDuplicatesNamed,
  nearDuplicateThreshold,
  type CategoryName,
  type NearDuplicate,
  type NearDuplicateRefused,
  type Provenance,
  type PublicationState,
  type QuestionEdited,
  type QuestionTag,
  type Viewer,
} from "@iqb/shared";
import { Prisma } from "../../generated/prisma/client.ts";
import {
  aboutAnotherQuestion,
  changeEventFieldsToRead,
  insertChangeEvent,
  toChangeEventFromDb,
  type ChangeEventFromDb,
} from "../change-events/change-events.repository.ts";
import type { Database } from "../../platform/database.ts";

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

/**
 * The history of a Question, oldest first. Null for a Question that is not Visible and
 * one that does not exist alike (ADR-0002); an empty list would not do, because that is
 * what a Question nobody has touched yet has.
 */
export async function findEventsAboutVisibleQuestion(
  database: Database,
  viewer: Viewer,
  id: string,
): Promise<ChangeEventFromDb[] | null> {
  // The events hang off the same condition as every other read, so there is no way to
  // reach the log for an id nobody checked (ADR-0003).
  const question = await database.question.findFirst({
    where: { AND: [{ id }, visibleQuestions(viewer)] },
    select: {
      changeEvents: {
        // Being able to see a Question is not being able to see what its Author was
        // warned about: those events name Questions of their own (ADR-0028).
        where: {
          OR: [{ type: { notIn: [...aboutAnotherQuestion] } }, { viewerId: viewer.id }],
        },
        // The time comes from the process that wrote the event, so two events can share
        // one; the id settles that, and the order is at least the same every read.
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: changeEventFieldsToRead,
      },
    },
  });
  return question === null ? null : question.changeEvents.map(toChangeEventFromDb);
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

/** What `visibleTo` says, in SQL, because the queries below are hand written and cannot
 * take a `where` (ADR-0026). Its own function because detection pairs it with a different
 * second check from the one the search pairs it with. */
function visibleToInSql(viewer: Viewer): Prisma.Sql {
  return Prisma.sql`(
    q."clientId" IS NULL
    OR EXISTS (SELECT 1 FROM permission_grants g
                WHERE g."clientId" = q."clientId" AND g."viewerId" = ${viewer.id}::uuid)
  )`;
}

/** The same thing `visibleTo` and `inTheBankFor` say, in SQL (ADR-0026). */
function visibleQuestionsInSql(viewer: Viewer): Prisma.Sql {
  const visible = visibleToInSql(viewer);
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

/**
 * The statement the search sends. Built here rather than where it is run, so the query
 * plan committed as evidence is the plan of the statement that ships and cannot get out
 * of sync with it (issue #12).
 *
 * Handing this out opens no second way to the questions table: both checks are built in,
 * and there is no argument that removes them or adds a condition of its own (ADR-0003).
 */
export function searchStatement(
  viewer: Viewer,
  { keywords, tagsPerCategory, limit, offset }: QuestionSearch,
): Prisma.Sql {
  const conditions = [visibleQuestionsInSql(viewer), ...tagsPerCategory.map(carryingOneOfInSql)];

  return Prisma.sql`
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
}

/** Keyword search across Question text and Answer Notes, matched against the stored
 * column rather than a vector worked out per row (ADR-0004). */
export async function searchVisibleQuestions(
  database: Database,
  viewer: Viewer,
  search: QuestionSearch,
): Promise<QuestionFromDb[]> {
  const rows = await database.$queryRaw<SearchRow[]>(searchStatement(viewer, search));

  return rows.map((row) => ({
    ...row,
    // Parsed, not cast, for the reason `toQuestionFromDb` parses (ADR-0024).
    tags: row.tags.map((carried) => ({
      category: categoryNameSchema.parse(carried.category),
      tag: carried.tag,
    })),
  }));
}

/**
 * The Questions a submission closely resembles, closest first, and none below the
 * threshold. Question text only, never Answer Notes (ADR-0004), and Visible and Published
 * whoever is asking, a Reviewer included (ADR-0007, ADR-0014).
 */
export async function findNearDuplicates(
  database: Database,
  viewer: Viewer,
  text: string,
): Promise<NearDuplicate[]> {
  return database.$queryRaw<NearDuplicate[]>`
    SELECT nearest.id AS "questionId", nearest.text, nearest.similarity
      FROM (
        SELECT q.id, q.text, similarity(q.text, ${text}) AS similarity
          FROM questions q
         WHERE ${visibleToInSql(viewer)}
           AND q."publicationState" = 'published'
         -- Ordered by distance rather than by similarity, because distance is what the
         -- GiST index can answer; the two are the same order (ADR-0004).
         ORDER BY q.text <-> ${text}
         LIMIT ${mostNearDuplicatesNamed}
      ) nearest
     WHERE nearest.similarity >= ${nearDuplicateThreshold}
     ORDER BY nearest.similarity DESC, nearest.id DESC
  `;
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

/** Naming a Tag twice means what naming it once means, and the join's primary key would
 * otherwise refuse the write. */
function distinctTagIds(tagIds: readonly string[]): string[] {
  return [...new Set(tagIds)];
}

/** The Author is the adding Viewer, never anything the request names. Its Change Events
 * are written in the same transaction, so an added Question always carries its trace. */
export async function insertQuestion(
  database: Database,
  viewer: Viewer,
  question: NewQuestion,
  overridden: readonly NearDuplicate[] = [],
): Promise<QuestionFromDb> {
  return database.$transaction(async (transaction) => {
    const stored = await transaction.question.create({
      data: {
        text: question.text,
        answerNotes: question.answerNotes,
        authorId: viewer.id,
        provenance: question.provenance,
        ...(question.source === undefined ? {} : { source: question.source }),
        tags: { create: distinctTagIds(question.tagIds).map((tagId) => ({ tagId })) },
      },
      select: questionFieldsToRead,
    });

    const added = toQuestionFromDb(stored);
    await insertChangeEvent(transaction, {
      type: "question_added",
      questionId: added.id,
      viewerId: viewer.id,
      payload: {
        text: added.text,
        answerNotes: added.answerNotes,
        provenance: added.provenance,
        source: added.source,
        tags: added.tags,
      },
    });

    if (overridden.length > 0) {
      await insertChangeEvent(transaction, {
        type: "near_duplicate_overridden",
        questionId: added.id,
        viewerId: viewer.id,
        payload: { nearDuplicates: [...overridden] },
      });
    }
    return added;
  });
}

/**
 * The trace a refused submission leaves. It names no Question because none was stored,
 * which is the case the log exists as a log for (ADR-0006).
 */
export async function recordRefusedSubmission(
  database: Database,
  viewer: Viewer,
  refused: NearDuplicateRefused,
): Promise<void> {
  await insertChangeEvent(database, {
    type: "near_duplicate_refused",
    questionId: null,
    viewerId: viewer.id,
    payload: refused,
  });
}

/** What an edit changes. A part left out stays as it is; `tagIds`, when named, replaces
 * every Tag the Question carried. */
export type QuestionEdit = {
  text?: string;
  answerNotes?: string;
  tagIds?: readonly string[];
};

/** The Tags of a Question as one string, so two sets of them can be compared whatever
 * order the database handed them back in. */
function tagsAsText(tags: readonly QuestionTag[]): string {
  return JSON.stringify([...tags].map(({ category, tag }) => `${category}/${tag}`).sort());
}

/** Null when the edit changed nothing: a request may name a field and give it the value
 * already there, and a Change Event saying so would describe a change nobody made. */
function whatChanged(before: QuestionFromDb, after: QuestionFromDb): QuestionEdited | null {
  const changed: QuestionEdited = {
    ...(before.text === after.text ? {} : { text: { before: before.text, after: after.text } }),
    ...(before.answerNotes === after.answerNotes
      ? {}
      : { answerNotes: { before: before.answerNotes, after: after.answerNotes } }),
    ...(tagsAsText(before.tags) === tagsAsText(after.tags)
      ? {}
      : { tags: { before: before.tags, after: after.tags } }),
  };
  return Object.keys(changed).length === 0 ? null : changed;
}

/**
 * Null for a Question that is not Visible and one that does not exist alike, exactly as
 * the fetch answers (ADR-0002). The write is built on the same `visibleQuestions` as the
 * reads, so a caller does not become the second way to the questions table (ADR-0003).
 */
export async function updateVisibleQuestion(
  database: Database,
  viewer: Viewer,
  id: string,
  edit: QuestionEdit,
): Promise<QuestionFromDb | null> {
  return database.$transaction(async (transaction) => {
    const visible: Prisma.QuestionWhereInput = { AND: [{ id }, visibleQuestions(viewer)] };

    // Read before the write, because the event carries what each changed field was.
    const before = await transaction.question.findFirst({
      where: visible,
      select: questionFieldsToRead,
    });
    if (before === null) return null;

    const { count } = await transaction.question.updateMany({
      where: visible,
      data: {
        ...(edit.text === undefined ? {} : { text: edit.text }),
        ...(edit.answerNotes === undefined ? {} : { answerNotes: edit.answerNotes }),
      },
    });
    if (count === 0) return null;

    if (edit.tagIds !== undefined) {
      // Named by id alone, which is safe only below the return above: that is where this
      // Question was established to be Visible to this Viewer.
      await transaction.questionTag.deleteMany({ where: { questionId: id } });
      await transaction.questionTag.createMany({
        data: distinctTagIds(edit.tagIds).map((tagId) => ({ questionId: id, tagId })),
      });
    }

    // Read by id, not by `visible` again. A Permission Grant revoked since the write
    // would make that second read find nothing, and the edit is already committed by
    // then: the Change Event would be the thing lost.
    const updated = await transaction.question.findUniqueOrThrow({
      where: { id },
      select: questionFieldsToRead,
    });

    const after = toQuestionFromDb(updated);
    const changed = whatChanged(toQuestionFromDb(before), after);
    if (changed !== null) {
      await insertChangeEvent(transaction, {
        type: "question_edited",
        questionId: id,
        viewerId: viewer.id,
        payload: changed,
      });
    }
    return after;
  });
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

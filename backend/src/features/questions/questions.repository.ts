import {
  categoryNameSchema,
  mostNearDuplicatesNamed,
  type Client,
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
  type NewChangeEvent,
} from "../change-events/change-events.repository.ts";
import { findClientGrantedTo } from "../clients/clients.repository.ts";
import type { Database, Transaction } from "../../platform/database.ts";

/** A Question as the rest of the code sees one: its Client and its Tags carry names, not
 * ids alone. */
export type QuestionFromDb = {
  id: string;
  text: string;
  answerNotes: string;
  authorId: string;
  client: Client | null;
  publicationState: PublicationState;
  reason: string | null;
  provenance: Provenance;
  source: string | null;
  tags: { category: CategoryName; tag: string }[];
  createdAt: Date;
};

/** The first check: the Question has no Client, or the Viewer holds a Permission Grant
 * for the one it names (ADR-0002). Its own function because detection pairs it with a
 * narrower second check of its own (ADR-0014). */
function visibleTo(viewer: Viewer): Prisma.Sql {
  return Prisma.sql`(
    q."clientId" IS NULL
    OR EXISTS (SELECT 1 FROM permission_grants g
                WHERE g."clientId" = q."clientId" AND g."viewerId" = ${viewer.id}::uuid)
  )`;
}

/**
 * Both checks, and the only place the second one is written: a Pending or Rejected
 * Question reaches only its Author and Reviewers. A Reviewer gets no second check, which
 * could not widen the first anyway, so a Reviewer still sees no Client they hold no Grant
 * for (ADR-0013).
 *
 * Not exported, and there is no version without the checks: a caller who can write a
 * condition of their own is the second way in that ends the guarantee (ADR-0003).
 */
function visibleQuestions(viewer: Viewer): Prisma.Sql {
  if (viewer.role === "reviewer") return visibleTo(viewer);
  return Prisma.sql`${visibleTo(viewer)} AND (
    q."publicationState" = 'published' OR q."authorId" = ${viewer.id}::uuid
  )`;
}

/** Holds the row until the transaction ends, so of two writes at once the second waits
 * here and then sees what the first one left. False for a Question that is not Visible
 * and one that does not exist alike (ADR-0002). */
async function lockVisibleQuestion(
  transaction: Transaction,
  viewer: Viewer,
  id: string,
): Promise<boolean> {
  const locked = await transaction.$queryRaw<{ id: string }[]>`
    SELECT q.id FROM questions q
     WHERE q.id = ${id}::uuid AND ${visibleQuestions(viewer)}
       FOR UPDATE OF q
  `;
  return locked.length > 0;
}

const questionFieldsToRead = {
  id: true,
  text: true,
  answerNotes: true,
  authorId: true,
  client: { select: { id: true, name: true } },
  publicationState: true,
  reason: true,
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
  const [question] = await readQuestionRows(
    database,
    visibleQuestionsStatement(viewer, [Prisma.sql`q.id = ${id}::uuid`], newestFirst),
  );
  return question ?? null;
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
  // The events are read only below this, so there is no way to reach the log for an id
  // nobody checked (ADR-0003).
  if ((await findVisibleQuestionById(database, viewer, id)) === null) return null;

  const events = await database.changeEvent.findMany({
    // Being able to see a Question is not being able to see what its Author was warned
    // about: those events name Questions of their own (ADR-0028).
    where: {
      questionId: id,
      OR: [{ type: { notIn: [...aboutAnotherQuestion] } }, { viewerId: viewer.id }],
    },
    // The time comes from the process that wrote the event, so two events can share
    // one; the id settles that, and the order is at least the same every read.
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: changeEventFieldsToRead,
  });
  return events.map(toChangeEventFromDb);
}

export type QuestionPage = { limit: number; offset: number };

/** Only ever narrowed from both checks, so the queue is no way around a Permission
 * Grant (ADR-0013). */
export function findPendingQuestionsForReview(
  database: Database,
  viewer: Viewer,
  page: QuestionPage,
): Promise<QuestionFromDb[]> {
  return readQuestionRows(
    database,
    visibleQuestionsStatement(
      viewer,
      [Prisma.sql`q."publicationState" = 'pending'`],
      oldestFirst,
      page,
    ),
  );
}

/** Still narrowed from both checks, so an Author loses sight of their own Question under
 * a Client they hold no Grant for, exactly as the fetch does (ADR-0002). */
export function findOwnUnpublishedQuestions(
  database: Database,
  viewer: Viewer,
  page: QuestionPage,
): Promise<QuestionFromDb[]> {
  return readQuestionRows(
    database,
    visibleQuestionsStatement(
      viewer,
      [
        Prisma.sql`q."authorId" = ${viewer.id}::uuid`,
        Prisma.sql`q."publicationState" IN ('pending', 'rejected')`,
      ],
      newestFirst,
      page,
    ),
  );
}

/** The Tag ids to filter by within one Category. Only the grouping reaches the query;
 * the Category is named so a caller cannot mix two of them into one condition. */
export type TagsInCategory = { category: CategoryName; tagIds: readonly string[] };

export type QuestionQuery = QuestionPage & {
  /** One entry per Category named; none of them means the whole bank the Viewer sees. */
  tagsPerCategory: readonly TagsInCategory[];
};

/** One of these per Category named, which is the shape ADR-0011 measured. */
function carryingOneOf({ tagIds }: TagsInCategory): Prisma.Sql {
  return Prisma.sql`EXISTS (SELECT 1 FROM question_tags qt
                             WHERE qt."questionId" = q.id
                               AND qt."tagId" = ANY(${[...tagIds]}::uuid[]))`;
}

/** The row a hand-written read gets back; `tags` arrives as JSON built by the database. */
type QuestionRowInSql = Omit<QuestionFromDb, "tags"> & {
  tags: { category: string; tag: string }[];
};

/** `page` picks the ids and does every check; this only reads what they name, in `order`,
 * which may name the page's own columns as `page.<column>`. */
function questionRowsStatement(page: Prisma.Sql, order: Prisma.Sql): Prisma.Sql {
  return Prisma.sql`
    WITH page AS (${page})
    SELECT q.id, q.text, q."answerNotes", q."authorId",
           (SELECT json_build_object('id', cl.id, 'name', cl.name)
              FROM clients cl WHERE cl.id = q."clientId") AS client,
           q."publicationState", q.reason, q.provenance, q.source, q."createdAt",
           coalesce(carried.tags, '[]'::json) AS tags
      FROM page
      JOIN questions q ON q.id = page.id
      -- After the page has been cut, so the Tags of a Question the page left out are
      -- never gathered.
      LEFT JOIN LATERAL (
        SELECT json_agg(json_build_object('category', c.name, 'tag', t.value)) AS tags
          FROM question_tags qt
          JOIN tags t ON t.id = qt."tagId"
          JOIN categories c ON c.id = t."categoryId"
         WHERE qt."questionId" = q.id
      ) carried ON true
     ORDER BY ${order}
  `;
}

async function readQuestionRows(
  database: Database,
  statement: Prisma.Sql,
): Promise<QuestionFromDb[]> {
  const rows = await database.$queryRaw<QuestionRowInSql[]>(statement);

  return rows.map((row) => ({
    ...row,
    // Parsed, not cast, for the reason `toQuestionFromDb` parses (ADR-0024).
    tags: row.tags.map((carried) => ({
      category: categoryNameSchema.parse(carried.category),
      tag: carried.tag,
    })),
  }));
}

/** Every read but the search goes through this, and `narrowing` is AND-ed with both
 * checks, so it can only ever narrow them (ADR-0003). */
function visibleQuestionsStatement(
  viewer: Viewer,
  narrowing: readonly Prisma.Sql[],
  order: Prisma.Sql,
  page?: QuestionPage,
): Prisma.Sql {
  return questionRowsStatement(
    Prisma.sql`
      SELECT q.id
        FROM questions q
       WHERE ${Prisma.join([visibleQuestions(viewer), ...narrowing], " AND ")}
       ORDER BY ${order}
       ${page === undefined ? Prisma.empty : Prisma.sql`LIMIT ${page.limit} OFFSET ${page.offset}`}
    `,
    order,
  );
}

// The id settles a createdAt tie, so no Question shifts between two pages.
const newestFirst = Prisma.sql`q."createdAt" DESC, q.id DESC`;
const oldestFirst = Prisma.sql`q."createdAt" ASC, q.id ASC`;

/** Exported so its plan can be captured, as `searchStatement` is, and like it has no
 * argument that removes a check or adds a condition (ADR-0003). */
export function listStatement(
  viewer: Viewer,
  { tagsPerCategory, limit, offset }: QuestionQuery,
): Prisma.Sql {
  return visibleQuestionsStatement(viewer, tagsPerCategory.map(carryingOneOf), newestFirst, {
    limit,
    offset,
  });
}

export function findVisibleQuestions(
  database: Database,
  viewer: Viewer,
  query: QuestionQuery,
): Promise<QuestionFromDb[]> {
  return readQuestionRows(database, listStatement(viewer, query));
}

/** What a Viewer typed, alongside the same filters the list takes. */
export type QuestionSearch = QuestionQuery & { keywords: string };

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
  const conditions = [visibleQuestions(viewer), ...tagsPerCategory.map(carryingOneOf)];

  return questionRowsStatement(
    Prisma.sql`
      SELECT q.id, ts_rank(q."searchVector", search.query) AS rank
        FROM questions q,
             -- Never raises on what a person types, which strict to_tsquery does
             -- on anything holding an operator or a stray bracket (ADR-0004).
             websearch_to_tsquery('english', ${keywords}) AS search(query)
       WHERE q."searchVector" @@ search.query
         AND ${Prisma.join(conditions, " AND ")}
       ORDER BY rank DESC, q.id DESC
       LIMIT ${limit} OFFSET ${offset}
    `,
    Prisma.sql`page.rank DESC, q.id DESC`,
  );
}

/** Keyword search across Question text and Answer Notes, matched against the stored
 * column rather than a vector worked out per row (ADR-0004). */
export function searchVisibleQuestions(
  database: Database,
  viewer: Viewer,
  search: QuestionSearch,
): Promise<QuestionFromDb[]> {
  return readQuestionRows(database, searchStatement(viewer, search));
}

/** Which Visible Questions one check compares against. */
type NearDuplicateReach = { states: readonly PublicationState[]; excluding?: string };

/** Closest first and none below the threshold, over Question text alone (ADR-0004) and
 * Visible Questions alone (ADR-0007). */
async function findNearDuplicatesAmong(
  database: Database,
  viewer: Viewer,
  text: string,
  { states, excluding }: NearDuplicateReach,
): Promise<NearDuplicate[]> {
  return database.$queryRaw<NearDuplicate[]>`
    SELECT nearest.id AS "questionId", nearest.text, nearest.similarity
      FROM (
        SELECT q.id, q.text, similarity(q.text, ${text}) AS similarity
          FROM questions q
         WHERE ${visibleTo(viewer)}
           AND q."publicationState" = ANY(${[...states]}::"PublicationState"[])
           ${excluding === undefined ? Prisma.empty : Prisma.sql`AND q.id <> ${excluding}::uuid`}
         -- Ordered by distance rather than by similarity, because distance is what the
         -- GiST index can answer; the two are the same order (ADR-0004).
         ORDER BY q.text <-> ${text}
         LIMIT ${mostNearDuplicatesNamed}
      ) nearest
     WHERE nearest.similarity >= ${nearDuplicateThreshold}
     ORDER BY nearest.similarity DESC, nearest.id DESC
  `;
}

/** Published only, whoever is asking, a Reviewer included, so nobody submitting is told
 * about a Question waiting in a queue they may not see (ADR-0014). */
export function findNearDuplicates(
  database: Database,
  viewer: Viewer,
  text: string,
): Promise<NearDuplicate[]> {
  return findNearDuplicatesAmong(database, viewer, text, { states: ["published"] });
}

/** The Questions a submission is checked against, without the one being edited, which
 * would always be its own Near-Duplicate (ADR-0014). */
export function findNearDuplicatesForEdit(
  database: Database,
  viewer: Viewer,
  question: { id: string; text: string },
): Promise<NearDuplicate[]> {
  return findNearDuplicatesAmong(database, viewer, question.text, {
    states: ["published"],
    excluding: question.id,
  });
}

/** Pending ones too, because the queue is the publishing Reviewer's to see, and never the
 * Question being Published, which would always be its own Near-Duplicate (ADR-0014). */
export function findNearDuplicatesForPublication(
  database: Database,
  viewer: Viewer,
  question: { id: string; text: string },
): Promise<NearDuplicate[]> {
  return findNearDuplicatesAmong(database, viewer, question.text, {
    states: ["published", "pending"],
    excluding: question.id,
  });
}

/** A Transaction, not a Database, so the override is written with the act it let through
 * or not at all. */
async function recordOverride(
  transaction: Transaction,
  viewer: Viewer,
  questionId: string,
  overridden: readonly NearDuplicate[],
): Promise<void> {
  if (overridden.length === 0) return;
  await insertChangeEvent(transaction, {
    type: "near_duplicate_overridden",
    questionId,
    viewerId: viewer.id,
    payload: { nearDuplicates: [...overridden] },
  });
}

/** What an Author supplies: no Publication State, which is Pending until a Reviewer
 * moves it (ADR-0013). */
export type NewQuestion = {
  text: string;
  answerNotes: string;
  provenance: Provenance;
  source?: string;
  /** A Client the adding Viewer holds a Grant for, which the caller has checked. */
  clientId?: string;
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
        ...(question.clientId === undefined ? {} : { clientId: question.clientId }),
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
    if (added.client !== null) {
      await insertChangeEvent(transaction, {
        type: "question_classified",
        questionId: added.id,
        viewerId: viewer.id,
        payload: { clientId: { before: null, after: added.client.id } },
      });
    }

    await recordOverride(transaction, viewer, added.id, overridden);
    return added;
  });
}

/** A refused submission names no Question, since none was stored, which is the case the
 * log exists as a log for (ADR-0006). */
export async function recordRefusedAsNearDuplicate(
  database: Database,
  viewer: Viewer,
  questionId: string | null,
  refused: NearDuplicateRefused,
): Promise<void> {
  await insertChangeEvent(database, {
    type: "near_duplicate_refused",
    questionId,
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
 * the fetch answers (ADR-0002). The write is checked by the same `visibleQuestions` as the
 * reads, so a caller does not become the second way to the questions table (ADR-0003).
 */
export async function updateVisibleQuestion(
  database: Database,
  viewer: Viewer,
  id: string,
  edit: QuestionEdit,
  overridden: readonly NearDuplicate[] = [],
): Promise<QuestionFromDb | null> {
  return database.$transaction(async (transaction) => {
    if (!(await lockVisibleQuestion(transaction, viewer, id))) return null;

    // From here on the Question is named by id alone, which is safe only because the
    // lock above found it Visible to this Viewer.

    // Read before the write, because the event carries what each changed field was.
    const before = await transaction.question.findUniqueOrThrow({
      where: { id },
      select: questionFieldsToRead,
    });

    await transaction.question.updateMany({
      where: { id },
      data: {
        ...(edit.text === undefined ? {} : { text: edit.text }),
        ...(edit.answerNotes === undefined ? {} : { answerNotes: edit.answerNotes }),
      },
    });

    if (edit.tagIds !== undefined) {
      await transaction.questionTag.deleteMany({ where: { questionId: id } });
      await transaction.questionTag.createMany({
        data: distinctTagIds(edit.tagIds).map((tagId) => ({ questionId: id, tagId })),
      });
    }

    // Read by id, not checked again. A Permission Grant revoked since the write would
    // make that second read find nothing, and the edit is already committed by then:
    // the Change Event would be the thing lost.
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
      await recordOverride(transaction, viewer, id, overridden);
    }
    return after;
  });
}

/** Named by the act rather than by the state it ends in, because Rejecting and returning
 * both end in Rejected and each writes its own Change Event. */
export type PublicationMove =
  | { act: "publish" }
  | { act: "reject"; reason: string }
  | { act: "resubmit" }
  | { act: "return"; reason: string };

/** Each names the state it starts from, so the same act twice finds nothing to move the
 * second time. */
const statesFor: Record<
  PublicationMove["act"],
  { from: PublicationState; to: PublicationState }
> = {
  publish: { from: "pending", to: "published" },
  reject: { from: "pending", to: "rejected" },
  resubmit: { from: "rejected", to: "pending" },
  // Rejected, so it waits for its Author rather than in the Reviewer's queue (ADR-0013).
  return: { from: "published", to: "rejected" },
};

function eventFor(move: PublicationMove, questionId: string, viewer: Viewer): NewChangeEvent {
  const happened = { questionId, viewerId: viewer.id };
  switch (move.act) {
    case "publish":
      return { ...happened, type: "question_published", payload: {} };
    case "reject":
      return { ...happened, type: "question_rejected", payload: { reason: move.reason } };
    case "resubmit":
      return { ...happened, type: "question_resubmitted", payload: {} };
    case "return":
      return { ...happened, type: "question_returned", payload: { reason: move.reason } };
  }
}

/** Null when nothing moved, and the state is in the `where`, so of two moves at once only
 * one finds the row and only one Change Event is written. */
export async function moveVisibleQuestion(
  database: Database,
  viewer: Viewer,
  id: string,
  move: PublicationMove,
  overridden: readonly NearDuplicate[] = [],
): Promise<QuestionFromDb | null> {
  const { from, to } = statesFor[move.act];
  return database.$transaction(async (transaction) => {
    if (!(await lockVisibleQuestion(transaction, viewer, id))) return null;

    const { count } = await transaction.question.updateMany({
      where: { id, publicationState: from },
      data: { publicationState: to, reason: "reason" in move ? move.reason : null },
    });
    if (count === 0) return null;

    await insertChangeEvent(transaction, eventFor(move, id, viewer));
    await recordOverride(transaction, viewer, id, overridden);

    // By id, because a Permission Grant revoked since the write would hide the committed move.
    const moved = await transaction.question.findUniqueOrThrow({
      where: { id },
      select: questionFieldsToRead,
    });
    return toQuestionFromDb(moved);
  });
}

/** Named by the act, as `PublicationMove` is, because each act expects a different Client to
 * be there and writes its own Change Event. */
export type RestrictionChange =
  | { act: "classify"; to: string }
  | { act: "move"; from: string; to: string }
  | { act: "declassify"; from: string };

function restrictionEventFor(
  change: RestrictionChange,
  questionId: string,
  viewer: Viewer,
): NewChangeEvent {
  const happened = { questionId, viewerId: viewer.id };
  switch (change.act) {
    case "classify":
      return {
        ...happened,
        type: "question_classified",
        payload: { clientId: { before: null, after: change.to } },
      };
    case "move":
      return {
        ...happened,
        type: "question_classified",
        payload: { clientId: { before: change.from, after: change.to } },
      };
    case "declassify":
      return { ...happened, type: "question_declassified", payload: { clientId: change.from } };
  }
}

/** What the row has to hold for the act to land, so of two acts at once only one does. */
function expectedBefore(change: RestrictionChange): Prisma.QuestionWhereInput {
  switch (change.act) {
    case "classify":
      return { clientId: null };
    // A Question Published since the caller looked is no longer the Author's to move.
    case "move":
      return { clientId: change.from, publicationState: { not: "published" } };
    case "declassify":
      return { clientId: change.from };
  }
}

/** Null when nothing changed, for the same reasons `moveVisibleQuestion` gives. */
export async function changeVisibleRestriction(
  database: Database,
  viewer: Viewer,
  id: string,
  change: RestrictionChange,
): Promise<QuestionFromDb | null> {
  return database.$transaction(async (transaction) => {
    // Asked again here, so a Grant revoked since the caller checked cannot leave the Question
    // restricted to a Client its Author no longer holds.
    if (
      change.act !== "declassify" &&
      (await findClientGrantedTo(transaction, viewer.id, change.to)) === null
    ) {
      return null;
    }

    if (!(await lockVisibleQuestion(transaction, viewer, id))) return null;

    const { count } = await transaction.question.updateMany({
      where: { AND: [{ id }, expectedBefore(change)] },
      data: { clientId: change.act === "declassify" ? null : change.to },
    });
    if (count === 0) return null;

    await insertChangeEvent(transaction, restrictionEventFor(change, id, viewer));

    // By id, because a Permission Grant revoked since the write would hide the committed change.
    const changed = await transaction.question.findUniqueOrThrow({
      where: { id },
      select: questionFieldsToRead,
    });
    return toQuestionFromDb(changed);
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

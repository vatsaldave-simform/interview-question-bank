import {
  categoryNameSchema,
  mostNearDuplicatesNamed,
  type ChangeEvent,
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
  findEventsOfQuestion,
  insertChangeEvent,
  type ChangeEventToInsert,
} from "../change-events/change-events.repository.ts";
import type { Database, Transaction } from "../../platform/database.ts";

/** A Question as the rest of the code sees one: its Clients and its Tags carry names, not
 * ids alone. */
export type QuestionFromDb = {
  id: string;
  text: string;
  answerNotes: string;
  authorId: string;
  /** Read from `question_clients`, never from the old column (ADR-0050). */
  clients: Client[];
  publicationState: PublicationState;
  reason: string | null;
  provenance: Provenance;
  source: string | null;
  tags: { category: CategoryName; tag: string }[];
  createdAt: Date;
};

export type QuestionPage = { limit: number; offset: number };

/** The Tag ids to filter by within one Category. Only the grouping reaches the query;
 * the Category is named so a caller cannot mix two of them into one condition. */
export type TagsInCategory = { category: CategoryName; tagIds: readonly string[] };

export type QuestionQuery = QuestionPage & {
  /** One entry per Category named; none of them means the whole bank the Viewer sees. */
  tagsPerCategory: readonly TagsInCategory[];
};

/** What a Viewer typed, alongside the same filters the list takes. */
export type QuestionSearch = QuestionQuery & { keywords: string };

/** What an Author supplies: no Publication State, which is Pending until a Reviewer
 * moves it (ADR-0013). */
export type NewQuestion = {
  text: string;
  answerNotes: string;
  provenance: Provenance;
  source?: string;
  /** Clients the caller has checked exist; none when left out. */
  clientIds?: readonly string[];
  tagIds: readonly string[];
};

/** What an edit changes. A part left out stays as it is; `tagIds` and `clientIds`, when
 * named, replace every Tag or Client the Question had. */
export type QuestionEdit = {
  text?: string;
  answerNotes?: string;
  tagIds?: readonly string[];
  /** Clients the caller has checked exist. */
  clientIds?: readonly string[];
};

export type QuestionWrite = Change | ({ act: "edit" } & QuestionEdit);

/** Why a write wrote nothing, decided inside its transaction, so nobody has to look the
 * Question up again to find out. */
export type WriteRefused = "not-visible" | "wrong-state";

export type QuestionWritten = { question: QuestionFromDb } | { refused: WriteRefused };

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
): Promise<ChangeEvent[] | null> {
  // The events are read only below this, so there is no way to reach the log for an id
  // nobody checked (ADR-0003).
  const visible = await database.$queryRaw<{ id: string }[]>(visibleQuestionWithId(viewer, id));
  if (visible.length === 0) return null;

  return findEventsOfQuestion(database, viewer, id);
}

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

export function findVisibleQuestions(
  database: Database,
  viewer: Viewer,
  query: QuestionQuery,
): Promise<QuestionFromDb[]> {
  return readQuestionRows(database, listStatement(viewer, query));
}

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

/** Keyword search across Question text and Answer Notes, matched against the stored
 * column rather than a vector worked out per row (ADR-0004). */
export function searchVisibleQuestions(
  database: Database,
  viewer: Viewer,
  search: QuestionSearch,
): Promise<QuestionFromDb[]> {
  return readQuestionRows(database, searchStatement(viewer, search));
}

/**
 * The statement the search sends. Built here rather than where it is run, so the query
 * plan committed as evidence is the plan of the statement that ships and cannot get out
 * of sync with it (issue #12).
 *
 * Handing this out opens no second way to the questions table: the visibility check is built
 * in, and there is no argument that removes it or adds a condition of its own (ADR-0003).
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

/** Published only, whoever is asking, a Reviewer included, so nobody submitting is told
 * about a Question waiting in a queue they may not see (ADR-0014). */
export function findNearDuplicates(
  database: Database,
  text: string,
): Promise<NearDuplicate[]> {
  return findNearDuplicatesAmong(database, text, { states: ["published"] });
}

/** The Questions a submission is checked against, without the one being edited, which
 * would always be its own Near-Duplicate (ADR-0014). */
export function findNearDuplicatesForEdit(
  database: Database,
  question: { id: string; text: string },
): Promise<NearDuplicate[]> {
  return findNearDuplicatesAmong(database, question.text, {
    states: ["published"],
    excluding: question.id,
  });
}

/** Pending ones too, because the queue is the publishing Reviewer's to see, and never the
 * Question being Published, which would always be its own Near-Duplicate (ADR-0014). */
export function findNearDuplicatesForPublication(
  database: Database,
  question: { id: string; text: string },
): Promise<NearDuplicate[]> {
  return findNearDuplicatesAmong(database, question.text, {
    states: ["published", "pending"],
    excluding: question.id,
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
    await insertChangeEvent(transaction, viewer, {
      type: "question_added",
      questionId: added.id,
      payload: {
        text: added.text,
        answerNotes: added.answerNotes,
        provenance: added.provenance,
        source: added.source,
        tags: added.tags,
      },
    });
    const clients = await replaceClientsOf(transaction, added.id, question.clientIds ?? []);
    await recordClientsChanged(transaction, viewer, added.id, clients);

    await recordOverride(transaction, viewer, added.id, overridden);
    return readLockedQuestion(transaction, added.id);
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
  await insertChangeEvent(database, viewer, {
    type: "near_duplicate_refused",
    questionId,
    payload: refused,
  });
}

/** Checked by the same `visibleQuestions` as the reads, so a caller does not become the
 * second way to the questions table (ADR-0003). */
export async function writeVisibleQuestion(
  database: Database,
  viewer: Viewer,
  id: string,
  write: QuestionWrite,
  overridden: readonly NearDuplicate[] = [],
): Promise<QuestionWritten> {
  return database.$transaction(async (transaction) => {
    if (!(await lockVisibleQuestion(transaction, viewer, id))) return { refused: "not-visible" };

    // From here on the Question is named by id alone, which is safe only because the
    // lock above found it Visible to this Viewer.

    if (write.act === "edit") {
      return { question: await editLockedQuestion(transaction, viewer, id, write, overridden) };
    }
    return changeLockedQuestion(transaction, viewer, id, write, overridden);
  });
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

/** Every read but the search goes through this, and `narrowing` is AND-ed with the
 * visibility check, so it can only ever narrow it (ADR-0003). */
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

/** Does no checking of its own, so `pickPage` has to do every check. */
function questionRowsStatement(pickPage: Prisma.Sql, order: Prisma.Sql): Prisma.Sql {
  // `order` may name the page's own columns as `page.<column>`.
  return Prisma.sql`
    WITH page AS (${pickPage})
    SELECT q.id, q.text, q."answerNotes", q."authorId",
           coalesce(cls.clients, '[]'::json) AS clients,
           q."publicationState", q.reason, q.provenance, q.source, q."createdAt",
           coalesce(carried.tags, '[]'::json) AS tags
      FROM page
      JOIN questions q ON q.id = page.id
      LEFT JOIN LATERAL (
        SELECT json_agg(json_build_object('id', cl.id, 'name', cl.name) ORDER BY cl.name) AS clients
        FROM question_clients qc
        JOIN clients cl ON cl.id = qc."clientId"
        WHERE qc."questionId" = q.id
      ) cls ON TRUE
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

/** Not exported, and with no version that skips a check: a caller who can write their
 * own condition is the second way in that ends the guarantee (ADR-0003). */
function visibleQuestions(viewer: Viewer): Prisma.Sql {
  // A Reviewer sees every Question, because the queue is theirs to work (ADR-0013).
  if (viewer.role === "reviewer") return Prisma.sql`true`;
  return Prisma.sql`(q."publicationState" = 'published' OR q."authorId" = ${viewer.id}::uuid)`;
}

function visibleQuestionWithId(viewer: Viewer, id: string): Prisma.Sql {
  return Prisma.sql`SELECT q.id FROM questions q
                     WHERE q.id = ${id}::uuid AND ${visibleQuestions(viewer)}`;
}

/** One of these per Category named, which is the shape ADR-0011 measured. */
function carryingOneOf({ tagIds }: TagsInCategory): Prisma.Sql {
  return Prisma.sql`EXISTS (SELECT 1 FROM question_tags qt
                             WHERE qt."questionId" = q.id
                               AND qt."tagId" = ANY(${[...tagIds]}::uuid[]))`;
}

/** Closest first and none below the threshold, over Question text alone (ADR-0004), and
 * only among the Publication States the caller names (ADR-0007). */
async function findNearDuplicatesAmong(
  database: Database,
  text: string,
  { states, excluding }: NearDuplicateReach,
): Promise<NearDuplicate[]> {
  return database.$queryRaw<NearDuplicate[]>`
    SELECT nearest.id AS "questionId", nearest.text, nearest.similarity
      FROM (
        SELECT q.id, q.text, similarity(q.text, ${text}) AS similarity
          FROM questions q
         WHERE q."publicationState" = ANY(${[...states]}::"PublicationState"[])
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

/** Naming a Tag twice means what naming it once means, and the join's primary key would
 * otherwise refuse the write. */
function distinctTagIds(tagIds: readonly string[]): string[] {
  return [...new Set(tagIds)];
}

function toQuestionFromDb(question: QuestionRow): QuestionFromDb {
  return {
    ...question,
    clients: question.clients.map(({ client }) => client),
    tags: question.tags.map(({ tag }) => ({
      // Parsed rather than cast: a Category row outside the closed list means the rows
      // and the code are out of sync, which the seed prevents, so fail loudly (ADR-0024).
      category: categoryNameSchema.parse(tag.category.name),
      tag: tag.value,
    })),
  };
}

/**
 * Makes the Question name exactly these Clients, and says which ones that added and
 * removed. A Client named twice counts once.
 */
async function replaceClientsOf(
  transaction: Transaction,
  questionId: string,
  clientIds: readonly string[],
): Promise<ClientsChanged> {
 const replacedClients =  await transaction.$queryRaw<{change: "added" | "removed"; clientId: string}[]>`
       WITH deleted AS  (DELETE FROM question_clients
        WHERE "questionId" = ${questionId}::uuid
        AND "clientId"  <> ALL(${[...clientIds]}::uuid[])
        RETURNING "clientId"),
        inserted AS (
        INSERT INTO question_clients ("questionId", "clientId")
        SELECT ${questionId}::uuid, id
        FROM unnest(${[...clientIds]}::uuid[]) AS id
        ON CONFLICT DO NOTHING
        RETURNING "clientId"
        )
        SELECT 'added' AS change, "clientId" FROM inserted
        UNION ALL
        SELECT 'removed' AS change, "clientId" FROM deleted`;
 
   
  return {
    added: replacedClients
      .filter(({ change }) => change === "added")
      .map(({ clientId }) => clientId),
    removed: replacedClients
      .filter(({ change }) => change === "removed")
      .map(({ clientId }) => clientId),
  };
}

/** One event per Client, so a history can say each one that came and went (ADR-0050). */
async function recordClientsChanged(
  transaction: Transaction,
  viewer: Viewer,
  questionId: string,
  { added, removed }: ClientsChanged,
): Promise<void> {
  for (const clientId of removed) {
    await insertChangeEvent(transaction, viewer, {
      type: "question_client_removed",
      questionId,
      payload: { clientId },
    });
  }
  for (const clientId of added) {
    await insertChangeEvent(transaction, viewer, {
      type: "question_client_added",
      questionId,
      payload: { clientId },
    });
  }
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
  await insertChangeEvent(transaction, viewer, {
    type: "near_duplicate_overridden",
    questionId,
    payload: { nearDuplicates: [...overridden] },
  });
}

/** Holds the row until the transaction ends, so of two writes at once the second waits
 * here and then sees what the first one left. */
async function lockVisibleQuestion(
  transaction: Transaction,
  viewer: Viewer,
  id: string,
): Promise<boolean> {
  const locked = await transaction.$queryRaw<{ id: string }[]>(
    Prisma.sql`${visibleQuestionWithId(viewer, id)} FOR UPDATE OF q`,
  );
  return locked.length > 0;
}

async function editLockedQuestion(
  transaction: Transaction,
  viewer: Viewer,
  id: string,
  edit: QuestionEdit,
  overridden: readonly NearDuplicate[],
): Promise<QuestionFromDb> {
  // Read before the write, because the event carries what each changed field was.
  const before = await readLockedQuestion(transaction, id);

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
  const clients =
    edit.clientIds === undefined
      ? noClientsChanged
      : await replaceClientsOf(transaction, id, edit.clientIds);

  const after = await readLockedQuestion(transaction, id);
  const changed = whatChanged(before, after);
  if (changed !== null) {
    await insertChangeEvent(transaction, viewer, {
      type: "question_edited",
      questionId: id,
      payload: changed,
    });
    await recordOverride(transaction, viewer, id, overridden);
  }
  await recordClientsChanged(transaction, viewer, id, clients);
  return after;
}

/** By id, not checked again: the lock already found it Visible, and a write that moved its
 * Publication State could make a checked read lose a write that is already made. */
async function readLockedQuestion(transaction: Transaction, id: string): Promise<QuestionFromDb> {
  const written = await transaction.question.findUniqueOrThrow({
    where: { id },
    select: questionFieldsToRead,
  });
  return toQuestionFromDb(written);
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

/** The Tags of a Question as one string, so two sets of them can be compared whatever
 * order the database handed them back in. */
function tagsAsText(tags: readonly QuestionTag[]): string {
  return JSON.stringify([...tags].map(({ category, tag }) => `${category}/${tag}`).sort());
}

async function changeLockedQuestion(
  transaction: Transaction,
  viewer: Viewer,
  id: string,
  change: Change,
  overridden: readonly NearDuplicate[],
): Promise<QuestionWritten> {
  const plan = changePlanFor(change, { questionId: id });

  const { count } = await transaction.question.updateMany({
    where: { AND: [{ id }, plan.startsFrom] },
    data: plan.writes,
  });
  if (count === 0) return { refused: "wrong-state" };

  await insertChangeEvent(transaction, viewer, plan.event);
  await recordOverride(transaction, viewer, id, overridden);
  return { question: await readLockedQuestion(transaction, id) };
}

// Generic, because TypeScript cannot match a union of changes to a union of plans directly.
function changePlanFor<A extends ChangeAct>(
  change: Change<A>,
  happened: { questionId: string },
): ChangePlan {
  return changePlans[change.act](change, happened);
}

/** The row a hand-written read gets back; `tags` arrives as JSON built by the database. */
type QuestionRowInSql = Omit<QuestionFromDb, "tags"> & {
  tags: { category: string; tag: string }[];
};

// The id settles a createdAt tie, so no Question shifts between two pages.
const newestFirst = Prisma.sql`q."createdAt" DESC, q.id DESC`;
const oldestFirst = Prisma.sql`q."createdAt" ASC, q.id ASC`;

/** Which Visible Questions one check compares against. */
type NearDuplicateReach = { states: readonly PublicationState[]; excluding?: string };

const questionFieldsToRead = {
  id: true,
  text: true,
  answerNotes: true,
  authorId: true,
  // The same order the hand-written reads give, so a write answers as a read would.
  clients: {
    select: { client: { select: { id: true, name: true } } },
    orderBy: { client: { name: "asc" } },
  },
  publicationState: true,
  reason: true,
  provenance: true,
  source: true,
  createdAt: true,
  tags: { select: { tag: { select: { value: true, category: { select: { name: true } } } } } },
} satisfies Prisma.QuestionSelect;

type QuestionRow = Prisma.QuestionGetPayload<{ select: typeof questionFieldsToRead }>;

type ClientsChanged = { added: readonly string[]; removed: readonly string[] };

const noClientsChanged: ClientsChanged = { added: [], removed: [] };

type ChangeDetails = {
  publish: Record<never, never>;
  reject: { reason: string };
  resubmit: Record<never, never>;
  return: { reason: string };
};

type ChangeAct = keyof ChangeDetails;

/** Named by the act rather than by what it ends in, because Rejecting and returning both end
 * in Rejected and each writes its own Change Event. */
type Change<A extends ChangeAct = ChangeAct> = { [K in A]: { act: K } & ChangeDetails[K] }[A];

type ChangePlan = {
  /** Part of the `where`, so of two acts at once only one lands. */
  startsFrom: Prisma.QuestionWhereInput;
  writes: Prisma.QuestionUncheckedUpdateManyInput;
  event: ChangeEventToInsert;
};

const changePlans: {
  [A in ChangeAct]: (change: Change<A>, happened: { questionId: string }) => ChangePlan;
} = {
  publish: (_, happened) => ({
    startsFrom: { publicationState: "pending" },
    writes: { publicationState: "published", reason: null },
    event: { ...happened, type: "question_published", payload: {} },
  }),
  reject: ({ reason }, happened) => ({
    startsFrom: { publicationState: "pending" },
    writes: { publicationState: "rejected", reason },
    event: { ...happened, type: "question_rejected", payload: { reason } },
  }),
  resubmit: (_, happened) => ({
    startsFrom: { publicationState: "rejected" },
    writes: { publicationState: "pending", reason: null },
    event: { ...happened, type: "question_resubmitted", payload: {} },
  }),
  // Rejected, so it waits for its Author rather than in the Reviewer's queue (ADR-0013).
  return: ({ reason }, happened) => ({
    startsFrom: { publicationState: "published" },
    writes: { publicationState: "rejected", reason },
    event: { ...happened, type: "question_returned", payload: { reason } },
  }),
};

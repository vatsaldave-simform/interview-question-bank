import {
  categoryNameSchema,
  type CategoryName,
  type Provenance,
  type PublicationState,
  type QuestionTag,
  type Viewer,
} from "@iqb/shared";
import type { Prisma } from "../../generated/prisma/client.js";
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

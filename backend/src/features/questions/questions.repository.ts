import { categoryNameSchema, type CategoryName, type Provenance, type PublicationState, type Viewer } from "@iqb/shared";
import type { Prisma } from "../../generated/prisma/client.js";
import type { Database } from "../../platform/database.js";

/** A Question as everything above this module sees one, its Tags named not numbered. */
export type StoredQuestion = {
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

/** The outer gate: no Client restriction, or a Permission Grant for the one named
 * (ADR-0002). */
function visibleTo(viewer: Viewer): Prisma.QuestionWhereInput {
  return {
    OR: [{ clientId: null }, { client: { permissionGrants: { some: { viewerId: viewer.id } } } }],
  };
}

/** The inner gate: a Pending or Rejected Question reaches only its Author and Reviewers,
 * whose empty predicate buys nothing outside the visibility one this is AND-ed with
 * (ADR-0013). */
function inTheBankFor(viewer: Viewer): Prisma.QuestionWhereInput {
  if (viewer.role === "reviewer") return {};
  return { OR: [{ publicationState: "published" }, { authorId: viewer.id }] };
}

/** Unexported, and there is no unscoped variant: a caller able to build a `where` of
 * their own is the second path that ends the guarantee (ADR-0003). */
function visibleQuestions(viewer: Viewer): Prisma.QuestionWhereInput {
  return { AND: [visibleTo(viewer), inTheBankFor(viewer)] };
}

const storedQuestionFields = {
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

type SelectedQuestion = Prisma.QuestionGetPayload<{ select: typeof storedQuestionFields }>;

function toStoredQuestion(question: SelectedQuestion): StoredQuestion {
  return {
    ...question,
    tags: question.tags.map(({ tag }) => ({
      // Parsed rather than cast: a Category row outside the closed vocabulary is a
      // drift the seed is supposed to prevent, and is worth failing loudly (ADR-0024).
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
): Promise<StoredQuestion | null> {
  const question = await database.question.findFirst({
    where: { AND: [{ id }, visibleQuestions(viewer)] },
    select: storedQuestionFields,
  });
  return question === null ? null : toStoredQuestion(question);
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
export async function addQuestion(
  database: Database,
  viewer: Viewer,
  question: NewQuestion,
): Promise<StoredQuestion> {
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
    select: storedQuestionFields,
  });
  return toStoredQuestion(stored);
}

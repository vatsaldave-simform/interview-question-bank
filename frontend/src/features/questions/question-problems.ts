import { refusedFieldsSchema, unknownTagsSchema, type QuestionTag } from "@iqb/shared";
import { ApiFailure, whatWentWrong } from "@/platform/api-client";

/** A Question as the form holds it while it is being written. */
export type QuestionDraft = { text: string; answerNotes: string; tags: QuestionTag[] };

type DraftField = keyof QuestionDraft;

export const draftFields = [
  "text",
  "answerNotes",
  "tags",
] as const satisfies readonly DraftField[];

export type DraftProblems = Partial<Record<DraftField, string>>;

// zod words its refusals for whoever is reading a stack trace, and "Too small: expected
// string to have >=1 characters" is not a sentence to put in front of anyone.
const problemWording: Record<DraftField, string> = {
  text: "Write the Question.",
  answerNotes: "Write what a good answer looks like.",
  tags: "Choose the Tags from the lists.",
};

function isDraftField(value: unknown): value is DraftField {
  return draftFields.some((field) => field === value);
}

/** The fields a schema refused, each worded for the person who has to fix it. */
function problemsIn(issues: readonly { path: readonly PropertyKey[] }[]): DraftProblems {
  const problems: DraftProblems = {};
  for (const issue of issues) {
    const field = issue.path[0];
    if (isDraftField(field)) problems[field] = problemWording[field];
  }
  return problems;
}

/** Why a draft was refused: against the fields that were named where any were, and as
 * one message for the whole form where none were. */
export type DraftRefusal = { problems: DraftProblems; message: string | null };

/** `whenNoField` is for a refusal that names nothing on the form, so the Viewer is never
 * left pressing a button that silently does nothing. */
export function checkRefused(
  issues: readonly { path: readonly PropertyKey[] }[],
  whenNoField: string,
): DraftRefusal {
  const problems = problemsIn(issues);
  return { problems, message: Object.keys(problems).length === 0 ? whenNoField : null };
}

export function refusalOf(reason: Error): DraftRefusal {
  if (reason instanceof ApiFailure && reason.code === "invalid_request") {
    const unknownTags = unknownTagsSchema.safeParse(reason.details);
    if (unknownTags.success) {
      const named = unknownTags.data.tags.join(", ");
      return { problems: { tags: `These Tags do not exist: ${named}.` }, message: null };
    }
    const refused = refusedFieldsSchema.safeParse(reason.details);
    if (refused.success) {
      const problems = problemsIn(
        Object.entries(refused.data.properties)
          .filter(
            ([, field]) => field.errors.length > 0 || (field.items ?? []).some((item) => item),
          )
          .map(([name]) => ({ path: [name] })),
      );
      if (Object.keys(problems).length > 0) return { problems, message: null };
    }
  }
  return { problems: {}, message: whatWentWrong(reason) };
}

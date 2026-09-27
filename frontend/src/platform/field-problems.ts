import { refusedFieldsSchema } from "@iqb/shared";
import { ApiFailure, whatWentWrong } from "@/platform/api-client";

/** What is wrong with each field of a form, in words meant for the person filling it in. */
export type FieldProblems<Field extends string> = Partial<Record<Field, string>>;

function isField<Field extends string>(
  wording: Record<Field, string>,
  value: unknown,
): value is Field {
  return typeof value === "string" && Object.hasOwn(wording, value);
}

/** Worded from `wording`, because zod words its refusals for whoever is reading a stack
 * trace rather than for the person filling in the form. */
export function problemsIn<Field extends string>(
  wording: Record<Field, string>,
  issues: readonly { path: readonly PropertyKey[] }[],
): FieldProblems<Field> {
  const problems: FieldProblems<Field> = {};
  for (const issue of issues) {
    const field = issue.path[0];
    if (isField(wording, field)) problems[field] = wording[field];
  }
  return problems;
}

/** Someone reading the screen through a screen reader is otherwise told something is
 * wrong and left to find it. */
export function focusFirstProblem(
  form: HTMLFormElement,
  problems: FieldProblems<string>,
): void {
  const first = Array.from(form.elements).find(
    (control) =>
      (control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement) &&
      problems[control.name] !== undefined,
  );
  if (first instanceof HTMLElement) first.focus();
}

/** Why the API refused a form: on the fields it named, or as one message when it named
 * none of this form's. */
export type FormRefusal<Field extends string> = {
  problems: FieldProblems<Field>;
  message: string | null;
};

export function refusalOf<Field extends string>(
  wording: Record<Field, string>,
  reason: Error,
): FormRefusal<Field> {
  if (reason instanceof ApiFailure && reason.code === "invalid_request") {
    const refused = refusedFieldsSchema.safeParse(reason.details);
    if (refused.success) {
      const named = Object.keys(refused.data.properties).map((field) => ({ path: [field] }));
      const problems = problemsIn(wording, named);
      if (Object.keys(problems).length > 0) return { problems, message: null };
    }
  }
  return { problems: {}, message: whatWentWrong(reason) };
}

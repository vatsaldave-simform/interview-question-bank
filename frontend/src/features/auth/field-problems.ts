/** What is wrong with each field of a form, in words meant for the person filling it in. */
export type FieldProblems<Field extends string> = Partial<Record<Field, string>>;

function isField<Field extends string>(
  wording: Record<Field, string>,
  value: unknown,
): value is Field {
  return typeof value === "string" && Object.hasOwn(wording, value);
}

/**
 * The fields a schema refused, each worded from `wording`. zod words its refusals for
 * whoever is reading a stack trace, and "Too small: expected string to have >=1
 * characters" is not a sentence to put in front of anyone.
 */
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
    (control) => control instanceof HTMLInputElement && problems[control.name] !== undefined,
  );
  if (first instanceof HTMLInputElement) first.focus();
}

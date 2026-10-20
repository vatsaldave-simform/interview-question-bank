import { provenances, type Provenance } from "@iqb/shared";
import { useEffect, useRef } from "react";
import { provenanceWording } from "@/features/questions/provenance-wording";
import type { DraftProblems } from "@/features/questions/question-problems";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/ui/shadcn/field";
import { Input } from "@/ui/shadcn/input";
import { RadioGroup, RadioGroupItem } from "@/ui/shadcn/radio-group";

/** Null until the Author chooses, because a guessed Original would call a copied Question
 * their own. */
export type ProvenanceChoice = { provenance: Provenance | null; source: string };

type ContributeProvenanceFieldsProps = {
  choice: ProvenanceChoice;
  problems: Pick<DraftProblems, "provenance" | "source">;
  onChange: (choice: ProvenanceChoice) => void;
};

export function ContributeProvenanceFields(props: ContributeProvenanceFieldsProps) {
  const { choice, problems, onChange } = props;
  const firstChoice = useRef<HTMLButtonElement>(null);
  const source = useRef<HTMLInputElement>(null);

  // The form moves focus only to its text boxes, and a choice is not one.
  useEffect(() => {
    if (problems.provenance !== undefined) firstChoice.current?.focus();
    else if (problems.source !== undefined) source.current?.focus();
  }, [problems]);

  return (
    <>
      <FieldSet data-invalid={problems.provenance !== undefined}>
        <FieldLegend>Where it came from</FieldLegend>
        <RadioGroup
          className="flex flex-wrap gap-2"
          value={choice.provenance ?? ""}
          onValueChange={(value) =>
            onChange({ ...choice, provenance: provenances.find((one) => one === value) ?? null })
          }
          aria-invalid={problems.provenance !== undefined}
          aria-describedby={
            problems.provenance === undefined ? undefined : "question-provenance-problem"
          }
        >
          {provenances.map((provenance, index) => {
            const id = `question-provenance-${provenance}`;
            return (
              <label
                key={provenance}
                htmlFor={id}
                className="border-(--field-line) bg-(--field) has-focus-visible:ring-ring/50 has-data-[state=checked]:border-ring inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium has-focus-visible:ring-[3px]"
              >
                <RadioGroupItem
                  ref={index === 0 ? firstChoice : undefined}
                  id={id}
                  value={provenance}
                  aria-describedby={`${id}-meaning`}
                />
                {provenanceWording[provenance].name}
                {/* Read out with the choice, and shown under the pills only once it is picked. */}
                <span id={`${id}-meaning`} hidden>
                  {provenanceWording[provenance].meaning}
                </span>
              </label>
            );
          })}
        </RadioGroup>
        <FieldDescription>
          {choice.provenance === null
            ? "Adapted means you reworked it from a public work. You name that work next."
            : provenanceWording[choice.provenance].meaning}
        </FieldDescription>
        <FieldError id="question-provenance-problem">{problems.provenance}</FieldError>
      </FieldSet>
      {choice.provenance === "adapted" && (
        <Field data-invalid={problems.source !== undefined}>
          <FieldLabel htmlFor="question-source">Source</FieldLabel>
          <FieldDescription>The work it was reworked from, in your own words.</FieldDescription>
          <Input
            ref={source}
            id="question-source"
            name="source"
            value={choice.source}
            onChange={(event) => onChange({ ...choice, source: event.target.value })}
            aria-invalid={problems.source !== undefined}
            aria-describedby={problems.source === undefined ? undefined : "question-source-problem"}
          />
          <FieldError id="question-source-problem">{problems.source}</FieldError>
        </Field>
      )}
    </>
  );
}

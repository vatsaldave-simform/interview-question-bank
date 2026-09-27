import { provenances, type Provenance } from "@iqb/shared";
import { useEffect, useRef } from "react";
import { provenanceWording } from "@/features/questions/provenance-wording";
import type { DraftProblems } from "@/features/questions/question-problems";
import {
  Field,
  FieldContent,
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
              <Field key={provenance} orientation="horizontal">
                <RadioGroupItem
                  ref={index === 0 ? firstChoice : undefined}
                  id={id}
                  value={provenance}
                  aria-describedby={`${id}-meaning`}
                />
                <FieldContent>
                  <FieldLabel htmlFor={id}>{provenanceWording[provenance].name}</FieldLabel>
                  <FieldDescription id={`${id}-meaning`}>
                    {provenanceWording[provenance].meaning}
                  </FieldDescription>
                </FieldContent>
              </Field>
            );
          })}
        </RadioGroup>
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

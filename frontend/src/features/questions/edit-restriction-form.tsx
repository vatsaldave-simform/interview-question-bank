import type { Question } from "@iqb/shared";
import { useState, type FormEvent } from "react";
import { useGrantedClients } from "@/features/clients/clients.queries";
import { ClientRestriction } from "@/features/questions/client-restriction";
import { QuestionClientChoice } from "@/features/questions/question-client-choice";
import {
  useChangeRestriction,
  type RestrictionChange,
} from "@/features/questions/questions.queries";
import { ScreenSection } from "@/features/questions/screen-section";
import { whatWentWrong } from "@/platform/api-client";
import { ActNotDone } from "@/ui/act-not-done";
import { Button } from "@/ui/shadcn/button";

/** Apart from the edit form, because an edit refuses a Client and a restriction change is
 * its own Change Event (ADR-0018). */
export function EditRestrictionForm({ question }: { question: Question }) {
  const clients = useGrantedClients();
  const change = useChangeRestriction(question.id);
  const [clientId, setClientId] = useState(question.client?.id ?? null);
  const [refusal, setRefusal] = useState<string | null>(null);

  function send(restrictionChange: RestrictionChange): void {
    setRefusal(null);
    change.mutate(restrictionChange, {
      onSuccess: ({ question: changed }) => setClientId(changed.client?.id ?? null),
      onError: (reason) => setRefusal(whatWentWrong(reason)),
    });
  }

  function restrict(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (clientId !== null) send({ act: "classify", request: { clientId } });
  }

  // Nothing to choose and nothing to remove, and an unrestricted Question shows no badge.
  if (clients.data?.length === 0 && question.client === null) return null;

  return (
    <ScreenSection
      id="who-can-see-it"
      title="Who can see it"
      beside={<ClientRestriction client={question.client} />}
    >
      <p className="text-muted-foreground text-sm">
        This changes straight away. It is not part of Save.
      </p>
      {refusal !== null && (
        <ActNotDone title="The restriction was not changed." reason={refusal} />
      )}
      <form className="flex flex-col gap-3" onSubmit={restrict}>
        <QuestionClientChoice clientId={clientId} onChange={setClientId}>
          {/* Its own box, because the field stretches everything directly inside it. */}
          <div>
            <Button
              type="submit"
              size="sm"
              disabled={
                clientId === null || clientId === question.client?.id || change.isPending
              }
            >
              Restrict
            </Button>
          </div>
        </QuestionClientChoice>
      </form>
      {/* Offered to every Viewer, because only the API says who may remove it (ADR-0002). */}
      {question.client !== null && (
        <Button
          variant="outline"
          size="sm"
          className="self-start"
          disabled={change.isPending}
          onClick={() => send({ act: "declassify" })}
        >
          Remove the restriction
        </Button>
      )}
    </ScreenSection>
  );
}

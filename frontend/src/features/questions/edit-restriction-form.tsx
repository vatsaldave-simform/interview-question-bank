import type { Question } from "@iqb/shared";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { useClients } from "@/features/clients/clients.queries";
import { QuestionClients } from "@/features/questions/question-clients";
import { QuestionClientChoice } from "@/features/questions/question-client-choice";
import {
  useChangeRestriction,
  type RestrictionChange,
} from "@/features/questions/questions.queries";
import { whatWentWrong } from "@/platform/api-client";
import { ActNotDone } from "@/ui/act-not-done";
import { Button } from "@/ui/shadcn/button";

/** In the edit form's card but sent apart from it, because an edit refuses a Client and a
 * restriction change is its own Change Event (ADR-0018). */
export function EditRestrictionForm({ question }: { question: Question }) {
  const clients = useClients();
  const change = useChangeRestriction(question.id);
  // The one Client the restrict act works on, which is the first by name until #194.
  const restrictedTo = question.clients[0] ?? null;
  const [clientId, setClientId] = useState(restrictedTo?.id ?? null);
  const [refusal, setRefusal] = useState<string | null>(null);

  function send(restrictionChange: RestrictionChange): void {
    setRefusal(null);
    change.mutate(restrictionChange, {
      onSuccess: ({ question: changed }) => {
        const now = changed.clients[0] ?? null;
        setClientId(now?.id ?? null);
        toast.success(
          now === null ? "The restriction was removed." : `It is now restricted to ${now.name}.`,
        );
      },
      onError: (reason) => setRefusal(whatWentWrong(reason)),
    });
  }

  function restrict(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (clientId !== null) send({ act: "restrict", request: { clientId } });
  }

  // Nothing to choose and nothing to remove, and an unrestricted Question shows no badge.
  if (clients.data?.length === 0 && restrictedTo === null) return null;

  return (
    <section
      aria-labelledby="who-can-see-it"
      className="border-border flex flex-col gap-3 border-t pt-section"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 id="who-can-see-it" className="text-lg font-semibold">
          Who can see it
        </h2>
        <QuestionClients clients={question.clients} />
      </div>
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
                clientId === null || clientId === restrictedTo?.id || change.isPending
              }
            >
              Restrict
            </Button>
          </div>
        </QuestionClientChoice>
      </form>
      {/* Offered to every Viewer, because only the API says who may remove it (ADR-0002). */}
      {restrictedTo !== null && (
        <Button
          variant="outline"
          size="sm"
          className="self-start"
          disabled={change.isPending}
          onClick={() => send({ act: "remove-restriction" })}
        >
          Remove the restriction
        </Button>
      )}
    </section>
  );
}

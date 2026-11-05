import type { Question } from "@iqb/shared";
import { cn } from "cn";
import { ArrowBigUpIcon } from "lucide-react";
import { useState } from "react";
import { upvotesWording } from "@/features/questions/upvote-count";
import { useUpvoteQuestion } from "@/features/questions/questions.queries";
import { whatWentWrong } from "@/platform/api-client";
import { ActNotDone } from "@/ui/act-not-done";
import { Button } from "@/ui/shadcn/button";

type Refusal = { title: string; reason: string };

/** One button that gives the Upvote or takes it back, pressed while the Viewer holds one. */
export function UpvoteButton({ question }: { question: Question }) {
  const upvote = useUpvoteQuestion(question.id);
  const [refusal, setRefusal] = useState<Refusal | null>(null);
  const { count, mine } = question.upvotes;

  function toggle(): void {
    setRefusal(null);
    // Held from the click, since the summary may have changed by the time the API answers.
    const title = mine ? "Your Upvote was not taken back." : "Your Upvote was not saved.";
    upvote.mutate(
      { give: !mine },
      { onError: (reason) => setRefusal({ title, reason: whatWentWrong(reason) }) },
    );
  }

  return (
    <div className="flex flex-col items-start gap-3">
      {refusal !== null && <ActNotDone title={refusal.title} reason={refusal.reason} />}
      <div className={cn("-ml-1.5 flex items-center gap-1", mine && "text-brand-action")}>
        <Button
          size="icon-sm"
          variant="ghost"
          className={cn(
            "hover:bg-hover",
            mine
              ? "text-brand-action hover:text-brand-action"
              : "text-muted-foreground hover:text-muted-foreground",
          )}
          aria-label="Upvote"
          aria-pressed={mine}
          disabled={upvote.isPending}
          onClick={toggle}
        >
          <ArrowBigUpIcon aria-hidden="true" className={cn("size-5.5", mine && "fill-current")} />
        </Button>
        <span aria-hidden="true" className="font-semibold">
          {count}
        </span>
        <span className="sr-only" aria-live="polite">
          {upvotesWording(question.upvotes)}
        </span>
      </div>
    </div>
  );
}

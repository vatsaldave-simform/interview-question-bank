import { highestRating, lowestRating, type Question } from "@iqb/shared";
import { cn } from "cn";
import { StarIcon } from "lucide-react";
import { useState } from "react";
import { useRateQuestion } from "@/features/questions/questions.queries";
import { whatWentWrong } from "@/platform/api-client";
import { ActNotDone } from "@/ui/act-not-done";
import { Button } from "@/ui/shadcn/button";

const ratingValues = Array.from(
  { length: highestRating - lowestRating + 1 },
  (_, index) => lowestRating + index,
);

/** Buttons rather than a radio group, whose arrow keys would send a Rating for every value
 * they pass on the way. */
export function RatingControl({ question }: { question: Question }) {
  const rate = useRateQuestion(question.id);
  const [refusal, setRefusal] = useState<string | null>(null);
  const { mine } = question.rating;

  function send(value: number): void {
    setRefusal(null);
    rate.mutate({ value }, { onError: (reason) => setRefusal(whatWentWrong(reason)) });
  }

  return (
    <div className="flex flex-col gap-3">
      {refusal !== null && <ActNotDone title="Your Rating was not saved." reason={refusal} />}
      <div role="group" aria-labelledby="your-rating" className="flex flex-col items-start gap-1.5">
        <span id="your-rating" className="text-[0.9375rem] font-semibold">
          Your Rating
        </span>
        <div className="-ml-1.5 flex">
          {ratingValues.map((value) => (
            <Button
              key={value}
              size="icon-sm"
              variant="ghost"
              // Every star up to the Viewer's Rating is filled, but only that one is pressed.
              className={cn(
                "hover:bg-hover",
                mine !== null && value <= mine
                  ? "text-brand-red hover:text-brand-red"
                  : "text-muted-foreground hover:text-muted-foreground",
              )}
              aria-label={`${value} out of ${highestRating}`}
              aria-pressed={value === mine}
              disabled={rate.isPending}
              onClick={() => send(value)}
            >
              <StarIcon
                aria-hidden="true"
                className={cn("size-5.5", mine !== null && value <= mine && "fill-current")}
              />
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}

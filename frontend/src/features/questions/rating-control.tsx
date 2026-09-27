import { highestRating, lowestRating, type Question } from "@iqb/shared";
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
      <div
        role="group"
        aria-labelledby="your-rating"
        className="flex flex-wrap items-center gap-2"
      >
        <span id="your-rating" className="text-sm">
          Your Rating
        </span>
        {ratingValues.map((value) => (
          <Button
            key={value}
            size="sm"
            variant={value === mine ? "default" : "outline"}
            aria-label={`${value} out of ${highestRating}`}
            aria-pressed={value === mine}
            disabled={rate.isPending}
            onClick={() => send(value)}
          >
            {value}
          </Button>
        ))}
      </div>
    </div>
  );
}

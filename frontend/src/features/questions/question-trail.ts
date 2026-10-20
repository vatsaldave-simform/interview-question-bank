import type { StepBack } from "@/ui/page-trail";

export const backToBrowse: StepBack[] = [{ page: "browse" }];

/** The Question is named just "Question" until it has loaded. */
export function backToTheQuestion(questionId: string, text = "Question"): StepBack[] {
  return [
    ...backToBrowse,
    { name: text, link: { to: "/questions/$questionId", params: { questionId } } },
  ];
}

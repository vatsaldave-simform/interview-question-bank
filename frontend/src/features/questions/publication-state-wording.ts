import type { PublicationState } from "@iqb/shared";

export const publicationStateWording: Record<PublicationState, { name: string; meaning: string }> =
  {
    pending: {
      name: "Pending",
      meaning: "Awaiting a Reviewer. It is not in the bank until it is Published.",
    },
    published: { name: "Published", meaning: "In the bank." },
    rejected: {
      name: "Rejected",
      meaning: "Not in the bank. Its Author may edit it and resubmit it.",
    },
  };

import { QueryClient } from "@tanstack/react-query";
import { ApiFailure } from "@/platform/api-client";

/** One per page load, made here rather than at module scope so a test gets its own and no
 * cache is shared between them. */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // A refusal is an answer, so asking again only says the same thing more slowly.
        // Only a request nothing answered is worth repeating, which is what the free tier
        // waking up looks like from here (ADR-0012).
        retry: (attempts, reason) =>
          reason instanceof ApiFailure && reason.unanswered && attempts < 2,
      },
    },
  });
}

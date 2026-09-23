import { describe, expect, it } from "vitest";
import { ApiFailure } from "@/platform/api-client";
import { createQueryClient } from "@/platform/query-client";

function shouldRetry(attempts: number, reason: Error): boolean {
  const retry = createQueryClient().getDefaultOptions().queries?.retry;
  if (typeof retry !== "function") throw new Error("The query client has no retry rule.");
  return retry(attempts, reason) as boolean;
}

describe("a query whose request failed", () => {
  it("is not asked again when the API refused it", () => {
    expect(shouldRetry(0, new ApiFailure(403, "forbidden", "Not yours to read."))).toBe(false);
  });

  it("is asked again when nothing answered at all", () => {
    expect(shouldRetry(0, new ApiFailure(0, "internal_error", "Unreachable."))).toBe(true);
  });

  it("gives up rather than asking for ever", () => {
    expect(shouldRetry(5, new ApiFailure(0, "internal_error", "Unreachable."))).toBe(false);
  });
});

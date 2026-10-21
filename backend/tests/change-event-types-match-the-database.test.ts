import { changeEventKinds, changeEventTypes } from "@iqb/shared";
import { describe, expect, it } from "vitest";
import { ChangeEventType as storedTypes } from "../src/generated/prisma/enums.ts";

/**
 * The database enum needs a migration to change, so it stays beside the table in `shared`.
 * This is what fails when one is edited and the other is not.
 */
describe("the Change Event types", () => {
  it("are the same in the shared table and in the database enum", () => {
    expect([...changeEventTypes].sort()).toEqual(Object.values(storedTypes).sort());
  });

  it("let only a refused Near-Duplicate go with or without a Question (ADR-0014)", () => {
    const optional = changeEventTypes.filter(
      (type) => changeEventKinds[type].question === "optional",
    );
    expect(optional).toEqual(["near_duplicate_refused"]);
  });

  it("name another Question only in the two Near-Duplicate events (ADR-0028)", () => {
    const naming = changeEventTypes.filter((type) => changeEventKinds[type].namesAnotherQuestion);
    expect(naming).toEqual(["near_duplicate_refused", "near_duplicate_overridden"]);
  });
});

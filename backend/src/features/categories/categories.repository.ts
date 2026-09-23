import { categoryNames, type CategoryWithTags } from "@iqb/shared";
import type { Database } from "../../platform/database.ts";

/**
 * Every Category in the closed list, in that list's order, and nothing the database holds
 * beyond it: a Category row the enum does not name is one no request can filter by
 * (ADR-0024).
 */
export async function findEveryCategoryWithTags(database: Database): Promise<CategoryWithTags[]> {
  const rows = await database.category.findMany({
    where: { name: { in: [...categoryNames] } },
    select: {
      name: true,
      displayName: true,
      tags: { select: { value: true }, orderBy: { value: "asc" } },
    },
  });
  const byName = new Map(rows.map((row) => [row.name, row]));

  return categoryNames.flatMap((name) => {
    const row = byName.get(name);
    if (row === undefined) return [];
    return [{ name, displayName: row.displayName, tags: row.tags.map((tag) => tag.value) }];
  });
}

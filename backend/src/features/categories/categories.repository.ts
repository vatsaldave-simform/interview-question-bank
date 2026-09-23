import { categoryNames, type CategoryWithTags } from "@iqb/shared";
import type { Database } from "../../platform/database.ts";

/** Only the Categories the closed list names, in its order, because no request can filter
 * by a Category row that the list leaves out (ADR-0024). */
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

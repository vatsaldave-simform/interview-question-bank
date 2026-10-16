import type { Viewer } from "@iqb/shared";
import { Link } from "@tanstack/react-router";
import { useId } from "react";
import { pagesShownTo, type PageId, type ShownPage } from "@/platform/app-pages";
import { Card, CardDescription, CardHeader, CardTitle } from "@/ui/shadcn/card";

/** Keyed on every page but Home, so a page added to the list cannot be left without one. */
const whatEachPageIsFor: Record<Exclude<PageId, "home">, string> = {
  browse: "Search and filter every Question you may see.",
  "add-a-question": "A Reviewer reads it before it is in the bank.",
  "your-questions": "Your Pending and Rejected Questions, with the reason.",
  "review-queue": "Pending Questions waiting on a Reviewer.",
  "role-requests": "Viewers asking for a different role.",
  viewers: "Everyone who can log in, or could before they were Deactivated.",
  clients: "Who holds a Grant against each Client.",
};

export function HomeShortcuts({ viewer }: { viewer: Viewer }) {
  return (
    <section aria-labelledby="shortcuts" className="flex flex-col gap-3">
      <h2 id="shortcuts" className="text-lg font-semibold">
        Shortcuts
      </h2>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {pagesShownTo(viewer)
          .filter((page): page is Exclude<ShownPage, { id: "home" }> => page.id !== "home")
          .map((page) => (
            <li key={page.id} className="flex">
              <ShortcutCard page={page} description={whatEachPageIsFor[page.id]} />
            </li>
          ))}
      </ul>
    </section>
  );
}

function ShortcutCard({ page, description }: { page: ShownPage; description: string }) {
  const descriptionId = useId();
  const { to, name, icon: Icon } = page;
  return (
    <Card className="flex-1">
      <CardHeader className="gap-2">
        <CardTitle>
          <Link
            to={to}
            aria-describedby={descriptionId}
            // Stretched over the whole card, so the card is what a Viewer clicks.
            className="focus-visible:ring-ring flex items-center gap-2 rounded-sm outline-none after:absolute after:inset-0 focus-visible:ring-2"
          >
            <Icon aria-hidden="true" className="text-primary size-4 shrink-0" />
            {name}
          </Link>
        </CardTitle>
        <CardDescription id={descriptionId}>{description}</CardDescription>
      </CardHeader>
    </Card>
  );
}

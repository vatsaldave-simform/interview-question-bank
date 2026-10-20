import type { Viewer } from "@iqb/shared";
import { Link } from "@tanstack/react-router";
import { pagesShownTo, type PageId, type ShownPage } from "@/platform/app-pages";
import { Card, CardTitle } from "@/ui/shadcn/card";

/** Where a shortcut says more than the sidebar's name for the page. */
const shortcutLabel: Partial<Record<PageId, string>> = { browse: "Browse the bank" };

export function HomeShortcuts({ viewer }: { viewer: Viewer }) {
  return (
    <section aria-label="Shortcuts">
      <ul className="flex flex-wrap gap-2">
        {pagesShownTo(viewer)
          .filter((page) => page.id !== "home")
          .map((page) => (
            <li key={page.id}>
              <ShortcutPill page={page} />
            </li>
          ))}
      </ul>
    </section>
  );
}

function ShortcutPill({ page }: { page: ShownPage }) {
  const { id, to, name, icon: Icon } = page;
  return (
    <Card className="rounded-full py-2 pr-3.5 pl-3">
      <CardTitle className="text-sm">
        <Link
          to={to}
          // Stretched over the whole pill, so the pill is what a Viewer clicks.
          className="focus-visible:ring-ring flex items-center gap-2 rounded-full outline-none after:absolute after:inset-0 after:rounded-full focus-visible:ring-2"
        >
          <Icon aria-hidden="true" className="text-muted-foreground size-4 shrink-0" />
          {shortcutLabel[id] ?? name}
        </Link>
      </CardTitle>
    </Card>
  );
}

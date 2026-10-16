import type { Viewer } from "@iqb/shared";
import { Link, type LinkProps } from "@tanstack/react-router";
import {
  Building2Icon,
  ClipboardCheckIcon,
  FileTextIcon,
  LibraryIcon,
  SquarePlusIcon,
  UserPlusIcon,
  UsersIcon,
  type LucideIcon,
} from "lucide-react";
import { useId } from "react";
import { Card, CardDescription, CardHeader, CardTitle } from "@/ui/shadcn/card";

type Shortcut = {
  to: NonNullable<LinkProps["to"]>;
  name: string;
  icon: LucideIcon;
  description: string;
};

const browse: Shortcut = {
  to: "/questions",
  name: "Browse",
  icon: LibraryIcon,
  description: "Search and filter every Question you may see.",
};

const forAuthors: Shortcut[] = [
  {
    to: "/questions/new",
    name: "Add a Question",
    icon: SquarePlusIcon,
    description: "A Reviewer reads it before it is in the bank.",
  },
  {
    to: "/questions/own",
    name: "Your Questions",
    icon: FileTextIcon,
    description: "Your Pending and Rejected Questions, with the reason.",
  },
];

const forReviewers: Shortcut[] = [
  {
    to: "/review",
    name: "Review queue",
    icon: ClipboardCheckIcon,
    description: "Pending Questions waiting on a Reviewer.",
  },
];

const forAdministrators: Shortcut[] = [
  {
    to: "/administration/role-requests",
    name: "Role Requests",
    icon: UserPlusIcon,
    description: "Viewers asking for a different role.",
  },
  {
    to: "/administration/viewers",
    name: "Viewers",
    icon: UsersIcon,
    description: "Everyone who can log in, or could before they were Deactivated.",
  },
  {
    to: "/administration/clients",
    name: "Clients",
    icon: Building2Icon,
    description: "Who holds a Grant against each Client.",
  },
];

/** The same pages the sidebar lists for the role, because hiding one keeps nobody out: the
 * API refuses its page anyway. */
function shortcutsFor(viewer: Viewer): Shortcut[] {
  return [
    browse,
    ...(viewer.role === "reader" ? [] : forAuthors),
    ...(viewer.role === "reviewer" ? forReviewers : []),
    ...(viewer.isAdministrator ? forAdministrators : []),
  ];
}

export function HomeShortcuts({ viewer }: { viewer: Viewer }) {
  return (
    <section aria-labelledby="shortcuts" className="flex flex-col gap-3">
      <h2 id="shortcuts" className="text-lg font-semibold">
        Shortcuts
      </h2>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {shortcutsFor(viewer).map((shortcut) => (
          <li key={shortcut.name} className="flex">
            <ShortcutCard shortcut={shortcut} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function ShortcutCard({ shortcut: { to, name, icon: Icon, description } }: { shortcut: Shortcut }) {
  const descriptionId = useId();
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

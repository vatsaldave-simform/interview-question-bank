import type { Viewer } from "@iqb/shared";
import { Link, type LinkComponentProps } from "@tanstack/react-router";
import {
  Building2Icon,
  ChevronsUpDownIcon,
  CircleUserRoundIcon,
  ClipboardCheckIcon,
  FileTextIcon,
  LibraryIcon,
  MenuIcon,
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
  SquarePlusIcon,
  UserPlusIcon,
  UsersIcon,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { chooseSidebarShrunk, useSidebarShrunk } from "@/platform/sidebar-choice";
import { chooseTheme, themeChoices, useThemeChoice, type ThemeChoice } from "@/platform/theme";
import { Button } from "@/ui/shadcn/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/ui/shadcn/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/ui/shadcn/sidebar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/ui/shadcn/tooltip";

/** Handed in from where the routes are put together, because the lists they count belong
 * to features (ADR-0030). */
export type SidebarMarks = {
  useAnyQuestionWaiting: () => boolean;
  useOpenRoleRequestCount: () => number;
};

type AppSidebarProps = { viewer: Viewer; onSignOut: () => void; marks: SidebarMarks };

export function AppSidebar({ viewer, onSignOut, marks }: AppSidebarProps) {
  useShortcutWithoutCookie();
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="flex-row items-center justify-between gap-2 p-4 group-data-[collapsible=icon]:flex-col group-data-[collapsible=icon]:p-2">
        <BrandLink stacked />
        <ShrinkButton />
      </SidebarHeader>
      <SidebarContent>
        <nav aria-label="Main menu">
          {/* Hiding these links keeps nobody out: the API refuses their pages anyway. */}
          <PageGroup label="Questions">
            <PageLink
              to="/questions"
              activeOptions={{ exact: true, includeSearch: false }}
              icon={LibraryIcon}
            >
              Browse
            </PageLink>
            {viewer.role !== "reader" && (
              <>
                <PageLink to="/questions/new" icon={SquarePlusIcon}>
                  Add a Question
                </PageLink>
                <PageLink to="/questions/own" icon={FileTextIcon}>
                  Your Questions
                </PageLink>
              </>
            )}
          </PageGroup>
          {viewer.role === "reviewer" && (
            <PageGroup label="Review">
              <ReviewQueueLink useAnyQuestionWaiting={marks.useAnyQuestionWaiting} />
            </PageGroup>
          )}
          {viewer.isAdministrator && (
            <PageGroup label="Administration">
              <RoleRequestsLink useOpenRoleRequestCount={marks.useOpenRoleRequestCount} />
              <PageLink to="/administration/viewers" icon={UsersIcon}>
                Viewers
              </PageLink>
              <PageLink to="/administration/clients" icon={Building2Icon}>
                Clients
              </PageLink>
            </PageGroup>
          )}
        </nav>
      </SidebarContent>
      <SidebarFooter>
        <AccountMenu email={viewer.email} onSignOut={onSignOut} />
      </SidebarFooter>
    </Sidebar>
  );
}

/** The bar above the page on a phone, where the sidebar is a drawer behind its menu button. */
export function PhoneBar() {
  const { isMobile, openMobile, setOpenMobile } = useSidebar();
  const opener = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);
  useEffect(() => {
    // The library's drawer has no button of its own to hand focus back to when it closes.
    if (wasOpen.current && !openMobile) opener.current?.focus();
    wasOpen.current = openMobile;
  }, [openMobile]);
  if (!isMobile) return null;
  return (
    <div className="bg-sidebar border-sidebar-border flex items-center gap-2 border-b px-4 py-2">
      <Button
        ref={opener}
        variant="ghost"
        size="icon"
        aria-label="Open the menu"
        aria-expanded={openMobile}
        onClick={() => setOpenMobile(true)}
      >
        <MenuIcon aria-hidden="true" />
      </Button>
      <BrandLink />
    </div>
  );
}

/** Stacked in the sidebar, which is too narrow for the logo and the name side by side. */
function BrandLink({ stacked = false }: { stacked?: boolean }) {
  const { setOpenMobile } = useSidebar();
  return (
    <Link
      to="/"
      onClick={() => setOpenMobile(false)}
      className={`focus-visible:ring-sidebar-ring flex min-w-0 rounded-md text-sm font-semibold outline-none focus-visible:ring-2 ${stacked ? "flex-col items-start gap-1.5" : "items-center gap-3"}`}
    >
      {/* The name beside it already says where the link goes, so the picture adds nothing to read out. */}
      <img
        src="/simform-logo.svg"
        alt=""
        // Shrunk, the box is cut to the logo's mark, which is its left-hand part.
        className="h-6 w-auto shrink-0 object-cover object-left group-data-[collapsible=icon]:w-[1.3rem]"
      />
      <span className="truncate group-data-[collapsible=icon]:sr-only">Interview Question Bank</span>
    </Link>
  );
}

/** Not shown on a phone, where the sidebar is a drawer that is either open or gone. */
function ShrinkButton() {
  const { isMobile } = useSidebar();
  const shrunk = useSidebarShrunk();
  if (isMobile) return null;
  const label = shrunk ? "Expand the sidebar" : "Shrink the sidebar";
  const Icon = shrunk ? PanelLeftOpenIcon : PanelLeftCloseIcon;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-8 shrink-0"
          aria-label={label}
          onClick={() => chooseSidebarShrunk(!shrunk)}
        >
          <Icon aria-hidden="true" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="right" hidden={!shrunk}>
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

function PageGroup({ label, children }: { label: string; children: ReactNode }) {
  const labelId = useId();
  return (
    <SidebarGroup role="group" aria-labelledby={labelId}>
      <SidebarGroupLabel id={labelId}>{label}</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>{children}</SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

type PageLinkProps = Omit<LinkComponentProps, "className" | "children"> & {
  icon: LucideIcon;
  children: string;
  mark?: Mark | null;
};

/** How a mark looks, and the words a screen reader and the shrunk strip's tooltip give for it. */
type Mark = { look: ReactNode; words: string };

/** The fill on the current page follows the `aria-current` the router sets on it, which
 * stays on a section's link on the pages inside it, such as one Client's page. */
function PageLink({ icon: Icon, children, mark, ...props }: PageLinkProps) {
  const { isMobile, setOpenMobile } = useSidebar();
  // A comma, because a screen reader joins the hidden words to the link's name without a space.
  const named = mark ? `${children}, ${mark.words}` : children;
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        asChild
        // Left out on a phone, because even a hidden tooltip takes the first Escape in the drawer.
        {...(isMobile ? {} : { tooltip: named })}
        className="relative aria-[current=page]:bg-sidebar-primary aria-[current=page]:text-sidebar-primary-foreground aria-[current=page]:font-medium"
      >
        <Link {...props} onClick={() => setOpenMobile(false)}>
          <Icon aria-hidden="true" />
          <span className="truncate">{children}</span>
          {mark && (
            <>
              <span
                aria-hidden="true"
                // On the icon's corner in the shrunk strip, where the end of the link is cut off.
                className="ml-auto flex shrink-0 group-data-[collapsible=icon]:absolute group-data-[collapsible=icon]:top-1 group-data-[collapsible=icon]:right-1"
              >
                {mark.look}
              </span>
              <span className="sr-only">{`, ${mark.words}`}</span>
            </>
          )}
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

/** Its own component, like the Role Requests link, so the hook runs only while the link
 * shows, and a Viewer it is hidden from never asks for the list behind it. */
function ReviewQueueLink({ useAnyQuestionWaiting }: Pick<SidebarMarks, "useAnyQuestionWaiting">) {
  const mark = useAnyQuestionWaiting()
    ? {
        look: <span className="bg-primary size-2 rounded-full" />,
        words: "Pending Questions waiting",
      }
    : null;
  return (
    <PageLink to="/review" icon={ClipboardCheckIcon} mark={mark}>
      Review queue
    </PageLink>
  );
}

function RoleRequestsLink({
  useOpenRoleRequestCount,
}: Pick<SidebarMarks, "useOpenRoleRequestCount">) {
  const count = useOpenRoleRequestCount();
  const mark =
    count === 0
      ? null
      : {
          look: (
            // The shrunk strip has no room for digits, so there it is a dot like the other mark.
            <span className="bg-primary text-primary-foreground flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-medium tabular-nums group-data-[collapsible=icon]:size-2 group-data-[collapsible=icon]:min-w-0 group-data-[collapsible=icon]:p-0">
              <span className="group-data-[collapsible=icon]:hidden">{count}</span>
            </span>
          ),
          words: `${count} open`,
        };
  return (
    <PageLink to="/administration/role-requests" icon={UserPlusIcon} mark={mark}>
      Role Requests
    </PageLink>
  );
}

function AccountMenu({ email, onSignOut }: { email: string; onSignOut: () => void }) {
  const theme = useThemeChoice();
  const { isMobile, state, setOpenMobile } = useSidebar();
  const besideAStrip = state === "collapsed" && !isMobile;
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton size="lg" className="group-data-[collapsible=icon]:justify-center">
              <CircleUserRoundIcon aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate group-data-[collapsible=icon]:sr-only">
                {email}
              </span>
              <ChevronsUpDownIcon
                aria-hidden="true"
                className="group-data-[collapsible=icon]:hidden"
              />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            side={besideAStrip ? "right" : "top"}
            align={besideAStrip ? "end" : "start"}
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56"
          >
            <DropdownMenuItem asChild>
              <Link to="/account" onClick={() => setOpenMobile(false)}>
                Your account
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel id="theme-choice-label" className="text-muted-foreground text-xs">
              Theme
            </DropdownMenuLabel>
            <DropdownMenuRadioGroup
              aria-labelledby="theme-choice-label"
              value={theme}
              onValueChange={(value) => {
                const picked = themeChoices.find((one) => one === value);
                if (picked) chooseTheme(picked);
              }}
            >
              {themeChoices.map((choice) => (
                <DropdownMenuRadioItem key={choice} value={choice}>
                  {themeWording[choice]}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onSignOut}>Log out</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

const themeWording: Record<ThemeChoice, string> = {
  light: "Light",
  dark: "Dark",
  device: "Match my device",
};

/** The library's own Ctrl+B saves the sidebar's state in a cookie, which the API would receive
 * because it shares this app's address, so the key is caught here before the library sees it. */
function useShortcutWithoutCookie() {
  const { isMobile, openMobile, setOpenMobile } = useSidebar();
  const shrunk = useSidebarShrunk();
  useEffect(() => {
    const catchShortcut = (event: KeyboardEvent) => {
      if (event.key !== "b" || !(event.metaKey || event.ctrlKey)) return;
      event.preventDefault();
      // A listener added with `capture` runs before the library's, so stopping here stops it.
      event.stopPropagation();
      if (isMobile) setOpenMobile(!openMobile);
      else chooseSidebarShrunk(!shrunk);
    };
    window.addEventListener("keydown", catchShortcut, { capture: true });
    return () => window.removeEventListener("keydown", catchShortcut, { capture: true });
  }, [isMobile, openMobile, setOpenMobile, shrunk]);
}

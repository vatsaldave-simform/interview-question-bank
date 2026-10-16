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
  SquarePlusIcon,
  UserPlusIcon,
  UsersIcon,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useId, useRef, type ReactNode } from "react";
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

/** Every page the Viewer may use, grouped, with their account at the bottom. On a phone the
 * library shows it as a drawer instead. */
export function AppSidebar({ viewer, onSignOut }: { viewer: Viewer; onSignOut: () => void }) {
  useShortcutWithoutCookie();
  return (
    <Sidebar>
      <SidebarHeader className="p-4">
        <BrandLink />
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
              <PageLink to="/review" icon={ClipboardCheckIcon}>
                Review queue
              </PageLink>
            </PageGroup>
          )}
          {viewer.isAdministrator && (
            <PageGroup label="Administration">
              <PageLink to="/administration/role-requests" icon={UserPlusIcon}>
                Role Requests
              </PageLink>
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
    <div className="border-sidebar-border flex items-center gap-2 border-b px-4 py-2">
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

function BrandLink() {
  const { setOpenMobile } = useSidebar();
  return (
    <Link
      to="/"
      onClick={() => setOpenMobile(false)}
      className="focus-visible:ring-sidebar-ring flex min-w-0 items-center gap-3 rounded-md text-sm font-semibold outline-none focus-visible:ring-2"
    >
      {/* The name beside it already says where the link goes, so the picture adds nothing to read out. */}
      <img src="/simform-logo.svg" alt="" className="h-6 w-auto shrink-0" />
      <span className="truncate">Interview Question Bank</span>
    </Link>
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
};

/** The fill on the current page follows the `aria-current` the router sets on it, which
 * stays on a section's link on the pages inside it, such as one Client's page. */
function PageLink({ icon: Icon, children, ...props }: PageLinkProps) {
  const { setOpenMobile } = useSidebar();
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        asChild
        className="aria-[current=page]:bg-sidebar-accent aria-[current=page]:text-sidebar-accent-foreground aria-[current=page]:font-medium"
      >
        <Link {...props} onClick={() => setOpenMobile(false)}>
          <Icon aria-hidden="true" />
          <span>{children}</span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

function AccountMenu({ email, onSignOut }: { email: string; onSignOut: () => void }) {
  const theme = useThemeChoice();
  const { setOpenMobile } = useSidebar();
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton size="lg">
              <CircleUserRoundIcon aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate">{email}</span>
              <ChevronsUpDownIcon aria-hidden="true" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            side="top"
            align="start"
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

/** The library's own Ctrl+B saves the sidebar's state in a cookie, and this app shares its
 * address with the API, so that cookie would reach the server. The key is caught first. */
function useShortcutWithoutCookie() {
  const { isMobile, openMobile, setOpenMobile } = useSidebar();
  useEffect(() => {
    const catchShortcut = (event: KeyboardEvent) => {
      if (event.key !== "b" || !(event.metaKey || event.ctrlKey)) return;
      event.preventDefault();
      // Stopped on its way down, so the library's listener on the way back up never hears it.
      event.stopPropagation();
      if (isMobile) setOpenMobile(!openMobile);
    };
    window.addEventListener("keydown", catchShortcut, { capture: true });
    return () => window.removeEventListener("keydown", catchShortcut, { capture: true });
  }, [isMobile, openMobile, setOpenMobile]);
}

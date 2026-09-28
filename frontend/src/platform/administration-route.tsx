import {
  createRoute,
  Link,
  Outlet,
  redirect,
  type LinkComponentProps,
} from "@tanstack/react-router";
import { signedInRoute } from "@/platform/signed-in-route";

/** Here and not in a feature, because the console is a view of several (ADR-0015). */
export const administrationRoute = createRoute({
  getParentRoute: () => signedInRoute,
  path: "/administration",
  // No `beforeLoad` check, because the API refuses each list on the console and it says so.
  component: AdministrationFrame,
});

/** The Role Requests come first, because that is where work waits for an Administrator. */
export const administrationStartRoute = createRoute({
  getParentRoute: () => administrationRoute,
  path: "/",
  beforeLoad: () => {
    throw redirect({ to: "/administration/role-requests", replace: true });
  },
});

function AdministrationFrame() {
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 md:flex-row md:gap-10">
      <nav aria-label="Administration" className="md:w-44 md:shrink-0">
        <ul className="flex flex-wrap gap-x-4 border-b md:flex-col md:gap-1 md:border-b-0">
          <li>
            <MenuLink to="/administration/role-requests">Role Requests</MenuLink>
          </li>
          <li>
            <MenuLink to="/administration/viewers">Viewers</MenuLink>
          </li>
          <li>
            <MenuLink to="/administration/clients">Clients</MenuLink>
          </li>
        </ul>
      </nav>
      <div className="flex min-w-0 flex-1 flex-col gap-8">
        <Outlet />
      </div>
    </div>
  );
}

/** The mark on the current page follows the `aria-current` the router sets on it, which
 * stays on Clients while one Client's page is open. */
function MenuLink(props: Omit<LinkComponentProps, "className">) {
  return (
    <Link
      {...props}
      className="text-muted-foreground hover:text-foreground aria-[current=page]:border-primary aria-[current=page]:text-foreground -mb-px block border-b-2 border-transparent py-2 text-sm md:mb-0 md:rounded-md md:border-b-0 md:border-l-2 md:rounded-l-none md:px-3 md:aria-[current=page]:bg-accent"
    />
  );
}

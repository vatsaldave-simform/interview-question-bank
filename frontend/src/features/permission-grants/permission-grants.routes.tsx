import { createRoute } from "@tanstack/react-router";
import { ClientGrants } from "@/features/permission-grants/client-grants";
import { administrationRoute } from "@/platform/administration-route";

/** Here and not with the Clients, so a Client does not have to know what is held against it. */
const clientGrantsRoute = createRoute({
  getParentRoute: () => administrationRoute,
  path: "/clients/$clientId",
  component: OneClientsGrants,
});

function OneClientsGrants() {
  const { clientId } = clientGrantsRoute.useParams();
  return <ClientGrants clientId={clientId} />;
}

export const permissionGrantRoutes = [clientGrantsRoute];

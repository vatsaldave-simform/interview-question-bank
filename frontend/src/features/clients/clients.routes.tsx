import { createRoute } from "@tanstack/react-router";
import { ClientList } from "@/features/clients/client-list";
import { administrationRoute } from "@/platform/administration-route";

const clientListRoute = createRoute({
  getParentRoute: () => administrationRoute,
  path: "/clients",
  component: ClientList,
});

export const clientRoutes = [clientListRoute];

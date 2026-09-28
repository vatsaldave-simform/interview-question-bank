import { createRoute } from "@tanstack/react-router";
import { RoleRequestQueue } from "@/features/role-requests/role-request-queue";
import { administrationRoute } from "@/platform/administration-route";

const roleRequestQueueRoute = createRoute({
  getParentRoute: () => administrationRoute,
  path: "/role-requests",
  component: RoleRequestQueue,
});

export const roleRequestRoutes = [roleRequestQueueRoute];

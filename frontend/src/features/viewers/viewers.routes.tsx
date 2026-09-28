import { createRoute } from "@tanstack/react-router";
import { ViewerList } from "@/features/viewers/viewer-list";
import { administrationRoute } from "@/platform/administration-route";

const viewerListRoute = createRoute({
  getParentRoute: () => administrationRoute,
  path: "/viewers",
  component: ViewerList,
});

export const viewerRoutes = [viewerListRoute];

import { createRoute } from "@tanstack/react-router";
import { browseSearchSchema } from "@/features/questions/browse.schema";
import { BrowseScreen } from "@/features/questions/browse-screen";
import { signedInRoute } from "@/platform/signed-in-route";

const browseRoute = createRoute({
  getParentRoute: () => signedInRoute,
  path: "/",
  validateSearch: browseSearchSchema,
  component: Browse,
});

function Browse() {
  const search = browseRoute.useSearch();
  const navigate = browseRoute.useNavigate();
  return (
    <BrowseScreen search={search} onSearchChange={(next) => void navigate({ search: next })} />
  );
}

export const questionRoutes = [browseRoute];

import { createRoute } from "@tanstack/react-router";
import { browseSearchSchema } from "@/features/questions/browse.schema";
import { BrowseScreen } from "@/features/questions/browse-screen";
import { QuestionScreen } from "@/features/questions/question-screen";
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

const questionRoute = createRoute({
  getParentRoute: () => signedInRoute,
  path: "/questions/$questionId",
  component: OneQuestion,
});

function OneQuestion() {
  const { questionId } = questionRoute.useParams();
  return <QuestionScreen questionId={questionId} />;
}

export const questionRoutes = [browseRoute, questionRoute];

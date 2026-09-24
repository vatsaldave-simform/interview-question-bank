import { createRoute } from "@tanstack/react-router";
import { browseSearchSchema } from "@/features/questions/browse.schema";
import { BrowseScreen } from "@/features/questions/browse-screen";
import { ContributeScreen } from "@/features/questions/contribute-screen";
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

const contributeRoute = createRoute({
  getParentRoute: () => signedInRoute,
  path: "/questions/new",
  component: Contribute,
});

function Contribute() {
  const navigate = contributeRoute.useNavigate();
  return (
    <ContributeScreen
      onAdded={(question) =>
        void navigate({ to: "/questions/$questionId", params: { questionId: question.id } })
      }
    />
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

export const questionRoutes = [browseRoute, contributeRoute, questionRoute];

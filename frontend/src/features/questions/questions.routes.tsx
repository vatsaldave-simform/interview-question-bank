import { createRoute } from "@tanstack/react-router";
import { browseSearchSchema } from "@/features/questions/browse.schema";
import { BrowseScreen } from "@/features/questions/browse-screen";
import { ContributeScreen } from "@/features/questions/contribute-screen";
import { EditScreen } from "@/features/questions/edit-screen";
import { OwnQuestionsScreen } from "@/features/questions/own-questions-screen";
import { pageSearchSchema } from "@/features/questions/question-pages.schema";
import { QuestionScreen } from "@/features/questions/question-screen";
import { ReviewScreen } from "@/features/questions/review-screen";
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

const editRoute = createRoute({
  getParentRoute: () => signedInRoute,
  path: "/questions/$questionId/edit",
  component: Edit,
});

function Edit() {
  const { questionId } = editRoute.useParams();
  const navigate = editRoute.useNavigate();
  return (
    <EditScreen
      questionId={questionId}
      onSaved={() => void navigate({ to: "/questions/$questionId", params: { questionId } })}
    />
  );
}

const reviewRoute = createRoute({
  getParentRoute: () => signedInRoute,
  path: "/review",
  validateSearch: pageSearchSchema,
  component: Review,
});

function Review() {
  const { offset = 0 } = reviewRoute.useSearch();
  const navigate = reviewRoute.useNavigate();
  return (
    <ReviewScreen
      offset={offset}
      onMove={(next) => void navigate({ search: { offset: next === 0 ? undefined : next } })}
    />
  );
}

const ownQuestionsRoute = createRoute({
  getParentRoute: () => signedInRoute,
  path: "/questions/own",
  validateSearch: pageSearchSchema,
  component: OwnQuestions,
});

function OwnQuestions() {
  const { offset = 0 } = ownQuestionsRoute.useSearch();
  const navigate = ownQuestionsRoute.useNavigate();
  return (
    <OwnQuestionsScreen
      offset={offset}
      onMove={(next) => void navigate({ search: { offset: next === 0 ? undefined : next } })}
    />
  );
}

export const questionRoutes = [
  browseRoute,
  contributeRoute,
  ownQuestionsRoute,
  questionRoute,
  editRoute,
  reviewRoute,
];

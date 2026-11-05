import {
  addQuestionRequestSchema,
  editQuestionRequestSchema,
  listQuestionsRequestSchema,
  publishQuestionRequestSchema,
  questionPageRequestSchema,
  rejectQuestionRequestSchema,
  returnQuestionRequestSchema,
  rolesThatMayAddAQuestion,
  type PendingQuestionListResponse,
  type Question,
  type QuestionHistoryResponse,
  type QuestionListResponse,
  type QuestionResponse,
  type UpvoteSummary,
  type Viewer,
} from "@iqb/shared";
import { Router } from "express";
import { authenticatedViewer } from "../auth/authenticated-viewer.ts";
import { requireRole } from "../auth/require-role.middleware.ts";
import { actOnQuestion, addQuestion, listQuestions } from "./questions.service.ts";
import {
  findEventsAboutVisibleQuestion,
  findOwnUnpublishedQuestions,
  findPendingQuestionsForReview,
  findVisibleQuestionById,
  type QuestionFromDb,
  type QuestionPage,
} from "./questions.repository.ts";
import { withUpvoteSummaries, withUpvoteSummary } from "../upvotes/upvotes.repository.ts";
import { withAuthors } from "../viewers/viewers.repository.ts";
import { upvoteRoutes } from "../upvotes/upvotes.routes.ts";
import { questionIdNamed } from "./question-id.ts";
import { NotFoundError } from "../../platform/errors.ts";
import type { Database } from "../../platform/database.ts";

export function questionRoutes(database: Database): Router {
  const router = Router();

  // On the route rather than on the router, because a Reader may still read the bank.
  router.post("/", requireRole(...rolesThatMayAddAQuestion), async (req, res) => {
    const viewer = authenticatedViewer(req);
    const request = addQuestionRequestSchema.parse(req.body);

    const question = await addQuestion(database, viewer, request);

    const body = await toResponse(database, viewer, question);
    res.status(201).json(body);
  });

  router.get("/", async (req, res) => {
    const viewer = authenticatedViewer(req);
    const request = listQuestionsRequestSchema.parse(req.query);

    const questions = await listQuestions(database, viewer, request);

    res.json(await toListResponse(database, viewer, questions, request));
  });

  // Both lists sit above `/:id`, which would otherwise read their names as ids.
  router.get("/pending", requireRole("reviewer"), async (req, res) => {
    const viewer = authenticatedViewer(req);
    const page = questionPageRequestSchema.parse(req.query);

    const questions = await findPendingQuestionsForReview(database, viewer, page);

    const authored = await withAuthors(database, questions);
    const summarised = await withUpvoteSummaries(database, viewer, authored);
    const body: PendingQuestionListResponse = {
      questions: summarised.map(toQuestion),
      limit: page.limit,
      offset: page.offset,
    };
    res.json(body);
  });

  // A Viewer who may not add a Question is refused rather than handed a list that is always
  // empty.
  router.get("/own", requireRole(...rolesThatMayAddAQuestion), async (req, res) => {
    const viewer = authenticatedViewer(req);
    const page = questionPageRequestSchema.parse(req.query);

    const questions = await findOwnUnpublishedQuestions(database, viewer, page);

    res.json(await toListResponse(database, viewer, questions, page));
  });

  router.get("/:id", async (req, res) => {
    const viewer = authenticatedViewer(req);
    const id = questionIdNamed(req);

    const question = await findVisibleQuestionById(database, viewer, id);
    if (question === null) throw new NotFoundError();

    const body = await toResponse(database, viewer, question);
    res.json(body);
  });

  // Any Viewer who can see the Question may read how it got there, so no `requireRole`:
  // a Reader reads history like anybody else.
  router.get("/:id/history", async (req, res) => {
    const viewer = authenticatedViewer(req);
    const id = questionIdNamed(req);

    const events = await findEventsAboutVisibleQuestion(database, viewer, id);
    if (events === null) throw new NotFoundError();

    const body: QuestionHistoryResponse = { events };
    res.json(body);
  });

  // No `requireRole` here, unlike the add route above. This route names a Question, and a
  // role refused before the Question is looked up would say the Question exists; who may
  // edit is decided inside, after the visibility check has passed (ADR-0002).
  router.patch("/:id", async (req, res) => {
    const viewer = authenticatedViewer(req);
    const id = questionIdNamed(req);
    const request = editQuestionRequestSchema.parse(req.body);

    const question = await actOnQuestion(database, viewer, id, { act: "edit", ...request });

    const body = await toResponse(database, viewer, question);
    res.json(body);
  });

  // No `requireRole` on any of these, down to the last route, for the reason the edit route
  // has none.
  router.post("/:id/publish", async (req, res) => {
    const viewer = authenticatedViewer(req);
    const id = questionIdNamed(req);
    // Express leaves the body undefined when none was sent, and that is a publish too.
    const request = publishQuestionRequestSchema.parse(req.body ?? {});

    const question = await actOnQuestion(database, viewer, id, { act: "publish", ...request });

    const body = await toResponse(database, viewer, question);
    res.json(body);
  });

  router.post("/:id/reject", async (req, res) => {
    const viewer = authenticatedViewer(req);
    const id = questionIdNamed(req);
    const request = rejectQuestionRequestSchema.parse(req.body);

    const question = await actOnQuestion(database, viewer, id, { act: "reject", ...request });

    const body = await toResponse(database, viewer, question);
    res.json(body);
  });

  router.post("/:id/resubmit", async (req, res) => {
    const viewer = authenticatedViewer(req);
    const id = questionIdNamed(req);

    const question = await actOnQuestion(database, viewer, id, { act: "resubmit" });

    const body = await toResponse(database, viewer, question);
    res.json(body);
  });

  router.post("/:id/return", async (req, res) => {
    const viewer = authenticatedViewer(req);
    const id = questionIdNamed(req);
    const request = returnQuestionRequestSchema.parse(req.body);

    const question = await actOnQuestion(database, viewer, id, { act: "return", ...request });

    const body = await toResponse(database, viewer, question);
    res.json(body);
  });

  router.use("/:id/upvote", upvoteRoutes(database));

  return router;
}

async function toResponse(
  database: Database,
  viewer: Viewer,
  question: QuestionFromDb,
): Promise<QuestionResponse> {
  return { question: toQuestion(await withUpvoteSummary(database, viewer, question)) };
}

function toQuestion<Q extends QuestionFromDb & { upvotes: UpvoteSummary }>({
  createdAt,
  ...question
}: Q): Omit<Q, "createdAt"> & Question {
  return { ...question, createdAt: createdAt.toISOString() };
}

async function toListResponse(
  database: Database,
  viewer: Viewer,
  questions: QuestionFromDb[],
  page: QuestionPage,
): Promise<QuestionListResponse> {
  const summarised = await withUpvoteSummaries(database, viewer, questions);
  return { questions: summarised.map(toQuestion), limit: page.limit, offset: page.offset };
}

import {
  addQuestionRequestSchema,
  classifyQuestionRequestSchema,
  editQuestionRequestSchema,
  listQuestionsRequestSchema,
  publishQuestionRequestSchema,
  questionPageRequestSchema,
  rejectQuestionRequestSchema,
  returnQuestionRequestSchema,
  type ChangeEvent,
  type Question,
  type QuestionHistoryResponse,
  type QuestionListResponse,
  type QuestionResponse,
  type RatingSummary,
  type Viewer,
} from "@iqb/shared";
import { Router } from "express";
import { authenticatedViewer } from "../auth/authenticated-viewer.ts";
import { requireRole } from "../auth/require-role.middleware.ts";
import {
  addQuestion,
  classifyQuestion,
  declassifyQuestion,
  editQuestion,
  listQuestions,
  publishQuestion,
  rejectQuestion,
  resubmitQuestion,
  returnQuestion,
} from "./questions.service.ts";
import {
  findEventsAboutVisibleQuestion,
  findOwnUnpublishedQuestions,
  findPendingQuestionsForReview,
  findVisibleQuestionById,
  type QuestionFromDb,
  type QuestionPage,
} from "./questions.repository.ts";
import type { ChangeEventFromDb } from "../change-events/change-events.repository.ts";
import { withRatingSummaries, withRatingSummary } from "../ratings/ratings.repository.ts";
import { ratingRoutes } from "../ratings/ratings.routes.ts";
import { questionIdNamed } from "./question-id.ts";
import { NotFoundError } from "../../platform/errors.ts";
import type { Database } from "../../platform/database.ts";

/** The Question as the API answers with it: only the timestamp needs changing. */
function toQuestion(question: QuestionFromDb & { rating: RatingSummary }): Question {
  return { ...question, createdAt: question.createdAt.toISOString() };
}

async function toResponse(
  database: Database,
  viewer: Viewer,
  question: QuestionFromDb,
): Promise<QuestionResponse> {
  return { question: toQuestion(await withRatingSummary(database, viewer, question)) };
}

async function toListResponse(
  database: Database,
  viewer: Viewer,
  questions: QuestionFromDb[],
  page: QuestionPage,
): Promise<QuestionListResponse> {
  const rated = await withRatingSummaries(database, viewer, questions);
  return { questions: rated.map(toQuestion), limit: page.limit, offset: page.offset };
}

/** The Change Event as the API answers with it. The time is called what it is here: the
 * event is when something happened, not when a row was created. */
function toEventResponse({ createdAt, ...event }: ChangeEventFromDb): ChangeEvent {
  return { ...event, at: createdAt.toISOString() };
}

export function questionRoutes(database: Database): Router {
  const router = Router();

  // A Reader may not add one: the constraint is on Question content, not on all writes
  // (CONTEXT.md), so this sits on the route rather than on the router.
  router.post("/", requireRole("author", "reviewer"), async (req, res) => {
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

    res.json(await toListResponse(database, viewer, questions, page));
  });

  // The roles that may add a Question: a Reader may add none, so they are refused rather
  // than handed a list that is always empty.
  router.get("/own", requireRole("author", "reviewer"), async (req, res) => {
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

    const body: QuestionHistoryResponse = { events: events.map(toEventResponse) };
    res.json(body);
  });

  // No `requireRole` here, unlike the add route above. This route names a Question, and a
  // role refused before the Question is looked up would say the Question exists; who may
  // edit is decided inside, after the visibility check has passed (ADR-0002).
  router.patch("/:id", async (req, res) => {
    const viewer = authenticatedViewer(req);
    const id = questionIdNamed(req);
    const request = editQuestionRequestSchema.parse(req.body);

    const question = await editQuestion(database, viewer, id, request);

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

    const question = await publishQuestion(database, viewer, id, request);

    const body = await toResponse(database, viewer, question);
    res.json(body);
  });

  router.post("/:id/reject", async (req, res) => {
    const viewer = authenticatedViewer(req);
    const id = questionIdNamed(req);
    const { reason } = rejectQuestionRequestSchema.parse(req.body);

    const question = await rejectQuestion(database, viewer, id, reason);

    const body = await toResponse(database, viewer, question);
    res.json(body);
  });

  router.post("/:id/resubmit", async (req, res) => {
    const viewer = authenticatedViewer(req);
    const id = questionIdNamed(req);

    const question = await resubmitQuestion(database, viewer, id);

    const body = await toResponse(database, viewer, question);
    res.json(body);
  });

  router.post("/:id/return", async (req, res) => {
    const viewer = authenticatedViewer(req);
    const id = questionIdNamed(req);
    const { reason } = returnQuestionRequestSchema.parse(req.body);

    const question = await returnQuestion(database, viewer, id, reason);

    const body = await toResponse(database, viewer, question);
    res.json(body);
  });

  router.post("/:id/classify", async (req, res) => {
    const viewer = authenticatedViewer(req);
    const id = questionIdNamed(req);
    const { clientId } = classifyQuestionRequestSchema.parse(req.body);

    const question = await classifyQuestion(database, viewer, id, clientId);

    const body = await toResponse(database, viewer, question);
    res.json(body);
  });

  router.post("/:id/declassify", async (req, res) => {
    const viewer = authenticatedViewer(req);
    const id = questionIdNamed(req);

    const question = await declassifyQuestion(database, viewer, id);

    const body = await toResponse(database, viewer, question);
    res.json(body);
  });

  router.use("/:id/rating", ratingRoutes(database));

  return router;
}

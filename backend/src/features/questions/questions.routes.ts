import {
  addQuestionRequestSchema,
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
} from "@iqb/shared";
import { Router, type Request } from "express";
import { z } from "zod";
import { authenticatedViewer } from "../auth/authenticated-viewer.ts";
import { requireRole } from "../auth/require-role.middleware.ts";
import {
  addQuestion,
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
import { NotFoundError } from "../../platform/errors.ts";
import type { Database } from "../../platform/database.ts";

const questionIdSchema = z.uuid();

/** A malformed id is answered as a missing one rather than as a bad request: it names no
 * Question, and there is one answer for that (ADR-0002). */
function questionIdNamed(req: Request): string {
  const id = questionIdSchema.safeParse(req.params["id"]);
  if (!id.success) throw new NotFoundError();
  return id.data;
}

/** The Question as the API answers with it: only the timestamp needs changing. */
function toResponse(question: QuestionFromDb): Question {
  return { ...question, createdAt: question.createdAt.toISOString() };
}

function toListResponse(questions: QuestionFromDb[], page: QuestionPage): QuestionListResponse {
  return { questions: questions.map(toResponse), limit: page.limit, offset: page.offset };
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
    const request = addQuestionRequestSchema.parse(req.body);

    const question = await addQuestion(database, authenticatedViewer(req), request);

    const body: QuestionResponse = { question: toResponse(question) };
    res.status(201).json(body);
  });

  router.get("/", async (req, res) => {
    const request = listQuestionsRequestSchema.parse(req.query);

    const questions = await listQuestions(database, authenticatedViewer(req), request);

    res.json(toListResponse(questions, request));
  });

  // Both lists sit above `/:id`, which would otherwise read their names as ids.
  router.get("/pending", requireRole("reviewer"), async (req, res) => {
    const page = questionPageRequestSchema.parse(req.query);

    const questions = await findPendingQuestionsForReview(database, authenticatedViewer(req), page);

    res.json(toListResponse(questions, page));
  });

  // The roles that may add a Question: a Reader may add none, so they are refused rather
  // than handed a list that is always empty.
  router.get("/own", requireRole("author", "reviewer"), async (req, res) => {
    const page = questionPageRequestSchema.parse(req.query);

    const questions = await findOwnUnpublishedQuestions(database, authenticatedViewer(req), page);

    res.json(toListResponse(questions, page));
  });

  router.get("/:id", async (req, res) => {
    const id = questionIdNamed(req);

    const question = await findVisibleQuestionById(database, authenticatedViewer(req), id);
    if (question === null) throw new NotFoundError();

    const body: QuestionResponse = { question: toResponse(question) };
    res.json(body);
  });

  // Any Viewer who can see the Question may read how it got there, so no `requireRole`:
  // a Reader reads history like anybody else.
  router.get("/:id/history", async (req, res) => {
    const id = questionIdNamed(req);

    const events = await findEventsAboutVisibleQuestion(database, authenticatedViewer(req), id);
    if (events === null) throw new NotFoundError();

    const body: QuestionHistoryResponse = { events: events.map(toEventResponse) };
    res.json(body);
  });

  // No `requireRole` here, unlike the add route above. This route names a Question, and a
  // role refused before the Question is looked up would say the Question exists; who may
  // edit is decided inside, after the visibility check has passed (ADR-0002).
  router.patch("/:id", async (req, res) => {
    const id = questionIdNamed(req);
    const request = editQuestionRequestSchema.parse(req.body);

    const question = await editQuestion(database, authenticatedViewer(req), id, request);

    const body: QuestionResponse = { question: toResponse(question) };
    res.json(body);
  });

  // No `requireRole` on any of these, for the reason the edit route has none.
  router.post("/:id/publish", async (req, res) => {
    const id = questionIdNamed(req);
    // Express leaves the body undefined when none was sent, and that is a publish too.
    const request = publishQuestionRequestSchema.parse(req.body ?? {});

    const question = await publishQuestion(database, authenticatedViewer(req), id, request);

    const body: QuestionResponse = { question: toResponse(question) };
    res.json(body);
  });

  router.post("/:id/reject", async (req, res) => {
    const id = questionIdNamed(req);
    const { reason } = rejectQuestionRequestSchema.parse(req.body);

    const question = await rejectQuestion(database, authenticatedViewer(req), id, reason);

    const body: QuestionResponse = { question: toResponse(question) };
    res.json(body);
  });

  router.post("/:id/resubmit", async (req, res) => {
    const id = questionIdNamed(req);

    const question = await resubmitQuestion(database, authenticatedViewer(req), id);

    const body: QuestionResponse = { question: toResponse(question) };
    res.json(body);
  });

  router.post("/:id/return", async (req, res) => {
    const id = questionIdNamed(req);
    const { reason } = returnQuestionRequestSchema.parse(req.body);

    const question = await returnQuestion(database, authenticatedViewer(req), id, reason);

    const body: QuestionResponse = { question: toResponse(question) };
    res.json(body);
  });

  return router;
}

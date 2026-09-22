import {
  addQuestionRequestSchema,
  editQuestionRequestSchema,
  listQuestionsRequestSchema,
  type Question,
  type QuestionListResponse,
  type QuestionResponse,
} from "@iqb/shared";
import { Router, type Request } from "express";
import { z } from "zod";
import { authenticatedViewer } from "../auth/authenticated-viewer.js";
import { requireRole } from "../auth/require-role.middleware.js";
import { addQuestion, editQuestion, listQuestions } from "./questions.service.js";
import {
  findVisibleQuestionById,
  type QuestionFromDb,
} from "./questions.repository.js";
import { NotFoundError } from "../../platform/errors.js";
import type { Database } from "../../platform/database.js";

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

    const body: QuestionListResponse = {
      questions: questions.map(toResponse),
      limit: request.limit,
      offset: request.offset,
    };
    res.json(body);
  });

  router.get("/:id", async (req, res) => {
    const id = questionIdNamed(req);

    const question = await findVisibleQuestionById(database, authenticatedViewer(req), id);
    if (question === null) throw new NotFoundError();

    const body: QuestionResponse = { question: toResponse(question) };
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

  return router;
}

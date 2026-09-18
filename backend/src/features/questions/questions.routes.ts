import { addQuestionRequestSchema, type Question, type QuestionResponse } from "@iqb/shared";
import { Router } from "express";
import { z } from "zod";
import { authenticatedViewer } from "../auth/authenticated-viewer.js";
import { requireRole } from "../auth/require-role.middleware.js";
import { addQuestion } from "./questions.service.js";
import {
  findVisibleQuestionById,
  type QuestionFromDb,
} from "./questions.repository.js";
import { NotFoundError } from "../../platform/errors.js";
import type { Database } from "../../platform/database.js";

const questionIdSchema = z.uuid();

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

  router.get("/:id", async (req, res) => {
    // A malformed id is answered as a missing one rather than as a bad request: it
    // names no Question, and there is one answer for that (ADR-0002).
    const id = questionIdSchema.safeParse(req.params.id);
    if (!id.success) throw new NotFoundError();

    const question = await findVisibleQuestionById(database, authenticatedViewer(req), id.data);
    if (question === null) throw new NotFoundError();

    const body: QuestionResponse = { question: toResponse(question) };
    res.json(body);
  });

  return router;
}

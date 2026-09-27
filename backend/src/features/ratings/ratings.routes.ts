import { rateQuestionRequestSchema, type RatingResponse } from "@iqb/shared";
import { Router } from "express";
import { authenticatedViewer } from "../auth/authenticated-viewer.ts";
import { questionIdNamed } from "../questions/question-id.ts";
import { rateQuestion } from "./ratings.service.ts";
import type { Database } from "../../platform/database.ts";

export function ratingRoutes(database: Database): Router {
  // The Question's id is in the path this router is mounted under, not in its own.
  const router = Router({ mergeParams: true });

  // No `requireRole`: a Reader may rate, since the rule against writing is about Question
  // content (CONTEXT.md), and the Author rule needs the Question looked up first (ADR-0002).
  router.put("/", async (req, res) => {
    const viewer = authenticatedViewer(req);
    const id = questionIdNamed(req);
    const { value } = rateQuestionRequestSchema.parse(req.body);

    const rating = await rateQuestion(database, viewer, id, value);

    const body: RatingResponse = { rating };
    res.json(body);
  });

  return router;
}

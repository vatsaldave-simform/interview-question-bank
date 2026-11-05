import type { UpvoteResponse } from "@iqb/shared";
import { Router } from "express";
import { authenticatedViewer } from "../auth/authenticated-viewer.ts";
import { questionIdNamed } from "../questions/question-id.ts";
import { takeBackUpvote, upvoteQuestion } from "./upvotes.service.ts";
import type { Database } from "../../platform/database.ts";

export function upvoteRoutes(database: Database): Router {
  // The Question's id is in the path this router is mounted under, not in its own.
  const router = Router({ mergeParams: true });

  // No `requireRole`: a Reader may upvote, since the rule against writing is about Question
  // content (CONTEXT.md).
  router.put("/", async (req, res) => {
    const viewer = authenticatedViewer(req);
    const id = questionIdNamed(req);

    const upvotes = await upvoteQuestion(database, viewer, id);

    const body: UpvoteResponse = { upvotes };
    res.json(body);
  });

  router.delete("/", async (req, res) => {
    const viewer = authenticatedViewer(req);
    const id = questionIdNamed(req);

    const upvotes = await takeBackUpvote(database, viewer, id);

    const body: UpvoteResponse = { upvotes };
    res.json(body);
  });

  return router;
}

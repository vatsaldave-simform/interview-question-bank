import { existsSync } from "node:fs";
import { join } from "node:path";
import express, { Router, type RequestHandler } from "express";

/**
 * The built client, served by the API on one origin (ADR-0012). Mounted after every
 * API route, so what reaches here is either a file the client build produced or a path
 * only the client's router knows about.
 */
export function frontendRoutes(frontendDir: string): Router {
  const indexFile = join(frontendDir, "index.html");
  if (!existsSync(indexFile)) {
    throw new Error(
      `No client build at ${indexFile}. Build it with \`pnpm --filter @iqb/frontend build\`, ` +
        `or leave FRONTEND_DIR unset to run the API without one.`,
    );
  }

  const router = Router();
  // `index: false`: the fallback below is the only thing that decides what an unrouted
  // request means, rather than sharing that job with the static middleware.
  router.use(express.static(frontendDir, { index: false }));
  router.get(/.*/, sendFrontend(indexFile));
  return router;
}

/**
 * A path whose last segment carries an extension is asking for a file, and the static
 * middleware above has already established there is no such file. Answering it with
 * index.html would turn a missing bundle into a parse error in the browser, which is a
 * much harder thing to read than a 404. Everything else is a route the frontend's own
 * router owns — a shared or bookmarked view (story 44).
 *
 * The cost of the heuristic: a frontend route whose last segment contains a dot is
 * refused rather than served. Nothing routes that way today, and the alternative — a
 * missing bundle answered with HTML — is the worse failure to debug.
 */
function sendFrontend(indexFile: string): RequestHandler {
  return (req, res, next) => {
    if (looksLikeAnAsset(req.path)) {
      next();
      return;
    }
    res.sendFile(indexFile, (error?: Error) => {
      if (error) next(error);
    });
  };
}

function looksLikeAnAsset(path: string): boolean {
  return (path.split("/").pop() ?? "").includes(".");
}

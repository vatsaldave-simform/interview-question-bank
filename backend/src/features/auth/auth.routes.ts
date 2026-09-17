import {
  loginRequestSchema,
  type CurrentViewerResponse,
  type LoginResponse,
  type Viewer,
} from "@iqb/shared";
import { Router } from "express";
import { signAccessToken } from "./access-token.js";
import { authenticatedViewer } from "./authenticated-viewer.js";
import type { AuthDependencies } from "./auth.middleware.js";
import { hashPassword, verifyPassword } from "./password.js";
import { findViewerByEmail } from "../viewers/viewers.repository.js";
import { UnauthenticatedError } from "../../platform/errors.js";
import { log } from "../../platform/logger.js";

/** The credentials were wrong. Which half was wrong is never said, nor logged. */
const badCredentials = () => new UnauthenticatedError("Those credentials are not valid.");

/**
 * The one route reachable without a token, because it is how a token is obtained.
 * Mounted ahead of the authentication gate for that reason alone.
 */
export function publicAuthRoutes({ database, accessToken }: AuthDependencies): Router {
  const router = Router();

  router.post("/login", async (req, res) => {
    const credentials = loginRequestSchema.parse(req.body);

    const viewer = await findViewerByEmail(database, credentials.email);
    if (!viewer) {
      // Hash the presented password and throw the result away. Hashing costs what
      // verifying costs, so an address with no account takes as long to refuse as a
      // wrong password does; without this the response time alone is an account
      // oracle, which is the thing ADR-0016 refuses to hand out on the reset page.
      await hashPassword(credentials.password);
      throw badCredentials();
    }
    if (!(await verifyPassword(credentials.password, viewer.passwordHash))) {
      throw badCredentials();
    }

    const body: LoginResponse = {
      accessToken: await signAccessToken(viewer.id, accessToken),
      expiresInSeconds: accessToken.lifetimeSeconds,
      viewer: { id: viewer.id, email: viewer.email, role: viewer.role } satisfies Viewer,
    };
    log().info({ viewerId: viewer.id, role: viewer.role }, "viewer signed in");
    res.json(body);
  });

  return router;
}

/** Mounted behind the gate: it answers for whoever the presented token authenticates. */
export function authenticatedAuthRoutes(): Router {
  const router = Router();

  // What the client asks after a reload, once it has recovered an access token.
  router.get("/me", (req, res) => {
    const body: CurrentViewerResponse = { viewer: authenticatedViewer(req) };
    res.json(body);
  });

  return router;
}

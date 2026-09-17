import { z } from "zod";

/**
 * The three roles a Viewer holds about Questions, in the spelling that travels on the
 * wire and sits in the database. Administrator is not here: it is a separate authority
 * held alongside one of these rather than a fourth value replacing them (ADR-0015).
 */
export const viewerRoles = ["reader", "author", "reviewer"] as const;
export const viewerRoleSchema = z.enum(viewerRoles);
export type ViewerRole = z.infer<typeof viewerRoleSchema>;

/**
 * The authenticated Viewer, as every response describes them. Deliberately small:
 * nothing here is a credential, so it is safe in a login response and in a log line.
 */
export const viewerSchema = z
  .object({
    id: z.uuid(),
    email: z.email(),
    role: viewerRoleSchema,
  })
  .strict();
export type Viewer = z.infer<typeof viewerSchema>;

/**
 * Credentials. The email is lower-cased here rather than at the call site, so the
 * address a Viewer types is matched the same way wherever it arrives from.
 */
export const loginRequestSchema = z
  .object({
    email: z
      .string()
      .trim()
      .toLowerCase()
      .pipe(z.email()),
    password: z.string().min(1),
  })
  .strict();
export type LoginRequest = z.infer<typeof loginRequestSchema>;

/**
 * The access token is short-lived and returned in the body, for the client to hold in
 * memory alone (ADR-0008). `expiresInSeconds` is what lets the client refresh before
 * expiry instead of discovering it through a failed request.
 */
export const loginResponseSchema = z
  .object({
    accessToken: z.string().min(1),
    expiresInSeconds: z.number().int().positive(),
    viewer: viewerSchema,
  })
  .strict();
export type LoginResponse = z.infer<typeof loginResponseSchema>;

/** Who the current access token authenticates. The client asks this after a reload. */
export const currentViewerResponseSchema = z.object({ viewer: viewerSchema }).strict();
export type CurrentViewerResponse = z.infer<typeof currentViewerResponseSchema>;

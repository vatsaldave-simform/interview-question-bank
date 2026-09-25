import { z } from "zod";

/**
 * The three roles a Viewer holds about Questions, in the spelling the API uses and the
 * database stores. Administrator is not here: it is a separate authority
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
    /** Held alongside `role` rather than instead of it (ADR-0015). */
    isAdministrator: z.boolean(),
    /** Always false in a login, refresh or `/me` answer, since a Deactivated Viewer gets
     * none of those; only an administrative act answers with a true one. */
    isDeactivated: z.boolean(),
  })
  .strict();
export type Viewer = z.infer<typeof viewerSchema>;

/** A Viewer named in something about them, the way ADR-0035 names one: an id is not
 * something a person can read. */
export const namedViewerSchema = z.object({ id: z.uuid(), email: z.email() }).strict();
export type NamedViewer = z.infer<typeof namedViewerSchema>;

/**
 * Lower-cased here rather than at the call site, so an address is stored and matched the
 * same way wherever it arrives from.
 */
const emailAddressSchema = z.string().trim().toLowerCase().pipe(z.email());

export const loginRequestSchema = z
  .object({ email: emailAddressSchema, password: z.string().min(1) })
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

/**
 * A refresh answers with exactly what a login answers with, so a client that has just
 * recovered a session and one that has just started one take the same path afterwards.
 */
export const refreshResponseSchema = loginResponseSchema;
export type RefreshResponse = LoginResponse;

/** Who the current access token authenticates. The client asks this after a reload. */
export const currentViewerResponseSchema = z.object({ viewer: viewerSchema }).strict();
export type CurrentViewerResponse = z.infer<typeof currentViewerResponseSchema>;

/** An Administrator setting a Viewer's role directly, with no Role Request involved. */
export const changeRoleRequestSchema = z.object({ role: viewerRoleSchema }).strict();
export type ChangeRoleRequest = z.infer<typeof changeRoleRequestSchema>;

/** No password and no Administrator authority: the Viewer sets the first themselves, and
 * the second is only ever given by appointing them (ADR-0015, ADR-0016). */
export const createViewerRequestSchema = z
  .object({ email: emailAddressSchema, role: viewerRoleSchema })
  .strict();
export type CreateViewerRequest = z.infer<typeof createViewerRequestSchema>;

/**
 * At least 15 characters, the NIST SP 800-63B-4 minimum for a password that is the only
 * factor, and at most 128, so the hasher is never handed a huge input.
 */
export const setPasswordRequestSchema = z
  .object({ token: z.string().min(1), password: z.string().min(15).max(128) })
  .strict();
export type SetPasswordRequest = z.infer<typeof setPasswordRequestSchema>;

/** An address and nothing else, answered the same whether or not it has an account
 * (ADR-0016). */
export const passwordResetRequestSchema = z.object({ email: emailAddressSchema }).strict();
export type PasswordResetRequest = z.infer<typeof passwordResetRequestSchema>;

/** What an administrative act against one Viewer answers with: that Viewer as they are
 * now. */
export const viewerResponseSchema = z.object({ viewer: viewerSchema }).strict();
export type ViewerResponse = z.infer<typeof viewerResponseSchema>;

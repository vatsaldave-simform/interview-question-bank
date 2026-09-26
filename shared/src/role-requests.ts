import { z } from "zod";
import { namedViewerSchema, viewerRoleSchema } from "./auth.js";

export const roleRequestStates = ["open", "granted", "denied"] as const;
export const roleRequestStateSchema = z.enum(roleRequestStates);
export type RoleRequestState = z.infer<typeof roleRequestStateSchema>;

/** The same shape to the requester and to an Administrator, so the reason a requester
 * reads is exactly the one the Administrator wrote. */
export const roleRequestSchema = z
  .object({
    id: z.uuid(),
    /** Who asked, never the Administrator who decided. */
    viewer: namedViewerSchema,
    /** The role they asked for, which may be any other role: there is no ladder
     * (ADR-0016). */
    role: viewerRoleSchema,
    state: roleRequestStateSchema,
    /** Always there on a denial, and there on a grant only if the Administrator gave one. */
    reason: z.string().nullable(),
    createdAt: z.iso.datetime(),
    decidedAt: z.iso.datetime().nullable(),
  })
  .strict();
export type RoleRequest = z.infer<typeof roleRequestSchema>;

/** Only the role: who is asking is the Viewer the request acts as. */
export const raiseRoleRequestRequestSchema = z.object({ role: viewerRoleSchema }).strict();
export type RaiseRoleRequestRequest = z.infer<typeof raiseRoleRequestRequestSchema>;

export const roleRequestResponseSchema = z.object({ roleRequest: roleRequestSchema }).strict();
export type RoleRequestResponse = z.infer<typeof roleRequestResponseSchema>;

export const roleRequestListResponseSchema = z
  .object({ roleRequests: z.array(roleRequestSchema) })
  .strict();
export type RoleRequestListResponse = z.infer<typeof roleRequestListResponseSchema>;

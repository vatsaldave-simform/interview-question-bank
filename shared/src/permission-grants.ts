import { z } from "zod";
import { namedViewerSchema } from "./auth.js";
import { clientSchema } from "./clients.js";

/** The pair and nothing else: which Viewer may see which Client's Questions. */
export const permissionGrantSchema = z
  .object({ client: clientSchema, viewer: namedViewerSchema })
  .strict();
export type PermissionGrant = z.infer<typeof permissionGrantSchema>;

/** The Client is in the path, so the body names only the Viewer. */
export const issuePermissionGrantRequestSchema = z.object({ viewerId: z.uuid() }).strict();
export type IssuePermissionGrantRequest = z.infer<typeof issuePermissionGrantRequestSchema>;

export const permissionGrantResponseSchema = z.object({ grant: permissionGrantSchema }).strict();
export type PermissionGrantResponse = z.infer<typeof permissionGrantResponseSchema>;

export const permissionGrantListResponseSchema = z
  .object({ grants: z.array(permissionGrantSchema) })
  .strict();
export type PermissionGrantListResponse = z.infer<typeof permissionGrantListResponseSchema>;

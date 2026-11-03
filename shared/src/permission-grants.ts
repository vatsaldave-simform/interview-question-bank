import { z } from "zod";
import { permissionGrantSchema } from "./change-events.js";

/** The Client is in the path, so the body names only the Viewer. */
export const issuePermissionGrantRequestSchema = z.object({ viewerId: z.uuid() }).strict();
export type IssuePermissionGrantRequest = z.infer<typeof issuePermissionGrantRequestSchema>;

export const permissionGrantResponseSchema = z.object({ grant: permissionGrantSchema }).strict();
export type PermissionGrantResponse = z.infer<typeof permissionGrantResponseSchema>;

export const permissionGrantListResponseSchema = z
  .object({ grants: z.array(permissionGrantSchema) })
  .strict();
export type PermissionGrantListResponse = z.infer<typeof permissionGrantListResponseSchema>;

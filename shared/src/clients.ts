import { z } from "zod";

export const clientSchema = z.object({ id: z.uuid(), name: z.string() }).strict();
export type Client = z.infer<typeof clientSchema>;

/** Trimmed before it is measured, so whitespace alone is empty. */
export const createClientRequestSchema = z
  .object({ name: z.string().trim().min(1).max(200) })
  .strict();
export type CreateClientRequest = z.infer<typeof createClientRequestSchema>;

export const clientResponseSchema = z.object({ client: clientSchema }).strict();
export type ClientResponse = z.infer<typeof clientResponseSchema>;

/** Only the Clients the requesting Viewer holds a Permission Grant for, so a picker never
 * reveals that an engagement exists. */
export const clientListResponseSchema = z.object({ clients: z.array(clientSchema) }).strict();
export type ClientListResponse = z.infer<typeof clientListResponseSchema>;

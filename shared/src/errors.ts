import { z } from "zod";

/**
 * The codes the API answers with.
 *
 * `not_found` covers both "no such Question" and "a Question you hold no Permission
 * Grant for", deliberately: the two must be indistinguishable (ADR-0002).
 */
export const errorCodes = [
  "invalid_request",
  "unauthenticated",
  "forbidden",
  "not_found",
  "conflict",
  "rate_limited",
  "internal_error",
] as const;

export const errorCodeSchema = z.enum(errorCodes);
export type ErrorCode = z.infer<typeof errorCodeSchema>;

/**
 * Every error response the API sends has this body and nothing else.
 *
 * Note what is absent. The request id travels in the `x-request-id` response header
 * instead, because two responses that have to be byte-identical to a client (the
 * zero-match guarantee) cannot carry anything that varies per request.
 */
export const apiErrorSchema = z
  .object({
    error: z
      .object({
        code: errorCodeSchema,
        message: z.string(),
        details: z.unknown().optional(),
      })
      .strict(),
  })
  .strict();

export type ApiError = z.infer<typeof apiErrorSchema>;

/** The fields a refused body got wrong, read from what `z.treeifyError` writes, where a
 * refusal inside a list is filed under `items` rather than `errors`. */
export const refusedFieldsSchema = z.object({
  properties: z.record(
    z.string(),
    z.object({ errors: z.array(z.string()), items: z.array(z.unknown()).optional() }),
  ),
});

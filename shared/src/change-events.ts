import { z } from "zod";
import { namedViewerSchema, viewerRoleSchema } from "./auth.js";
import { clientSchema } from "./clients.js";
import { permissionGrantSchema } from "./permission-grants.js";
import { nearDuplicateSchema, provenanceSchema, questionTagSchema } from "./questions.js";

/**
 * What a Change Event says happened. Publishing and Rejecting add their own (ADR-0006).
 */
export const changeEventTypes = [
  "question_added",
  "question_edited",
  "near_duplicate_refused",
  "near_duplicate_overridden",
  "administrator_appointed",
  "administrator_withdrawn",
  "role_changed",
  "client_created",
  "permission_grant_issued",
  "permission_grant_revoked",
  "viewer_created",
] as const;
export const changeEventTypeSchema = z.enum(changeEventTypes);
export type ChangeEventType = z.infer<typeof changeEventTypeSchema>;

/**
 * The whole content of a Question as it was added. Whole rather than a reference to the
 * Question, because an event has to still say what happened after later edits, and
 * because a refused submission that stored no Question has nothing to point at.
 */
export const questionAddedSchema = z
  .object({
    text: z.string(),
    answerNotes: z.string(),
    provenance: provenanceSchema,
    source: z.string().nullable(),
    tags: z.array(questionTagSchema),
  })
  .strict();
export type QuestionAdded = z.infer<typeof questionAddedSchema>;

/**
 * A submission refused because it closely resembled something already in the bank. The
 * whole attempt is here, Near-Duplicates included, because no Question was stored to point
 * and this row is the only record the attempt ever leaves (ADR-0006).
 */
export const nearDuplicateRefusedSchema = z
  .object({
    attempted: questionAddedSchema,
    nearDuplicates: z.array(nearDuplicateSchema),
  })
  .strict();
export type NearDuplicateRefused = z.infer<typeof nearDuplicateRefusedSchema>;

/**
 * An Author saying a match was wrong and submitting anyway. The Question this names is
 * the one that was stored, and the Viewer on the event is who made the call.
 */
export const nearDuplicateOverriddenSchema = z
  .object({ nearDuplicates: z.array(nearDuplicateSchema) })
  .strict();
export type NearDuplicateOverridden = z.infer<typeof nearDuplicateOverriddenSchema>;

/** One field as it was, and as it became. */
function changedFrom<T extends z.ZodTypeAny>(value: T) {
  return z.object({ before: value, after: value }).strict();
}

/** An Administrator appointing another Viewer. The event's own `viewerId` is who did
 * it, which is not always the Viewer this payload names (ADR-0015 permits appointing
 * oneself, and self and target are then the same Viewer). */
export const administratorAppointedSchema = z.object({ viewer: namedViewerSchema }).strict();
export type AdministratorAppointed = z.infer<typeof administratorAppointedSchema>;

/** The Administrator authority withdrawn from a Viewer. */
export const administratorWithdrawnSchema = z.object({ viewer: namedViewerSchema }).strict();
export type AdministratorWithdrawn = z.infer<typeof administratorWithdrawnSchema>;

/** An Administrator setting a Viewer's role directly, with no Role Request involved. */
export const roleChangedSchema = z
  .object({ viewer: namedViewerSchema, role: changedFrom(viewerRoleSchema) })
  .strict();
export type RoleChanged = z.infer<typeof roleChangedSchema>;

/** An Administrator creating a Client. */
export const clientCreatedSchema = z.object({ client: clientSchema }).strict();
export type ClientCreated = z.infer<typeof clientCreatedSchema>;

/** The Viewer this names may be the one who issued it (ADR-0015). */
export const permissionGrantIssuedSchema = z.object({ grant: permissionGrantSchema }).strict();
export type PermissionGrantIssued = z.infer<typeof permissionGrantIssuedSchema>;

/** A revoked Grant's row is gone, so this is the only record that it was ever held. */
export const permissionGrantRevokedSchema = z.object({ grant: permissionGrantSchema }).strict();
export type PermissionGrantRevoked = z.infer<typeof permissionGrantRevokedSchema>;

/** An Administrator creating a Viewer, with the role they were given. */
export const viewerCreatedSchema = z
  .object({ viewer: namedViewerSchema, role: viewerRoleSchema })
  .strict();
export type ViewerCreated = z.infer<typeof viewerCreatedSchema>;

/**
 * Only the fields the edit changed, each with what it was and what it became. A field
 * the edit left alone is absent, and so is one it named with the value already there.
 */
export const questionEditedSchema = z
  .object({
    text: changedFrom(z.string()).optional(),
    answerNotes: changedFrom(z.string()).optional(),
    tags: changedFrom(z.array(questionTagSchema)).optional(),
  })
  .strict();
export type QuestionEdited = z.infer<typeof questionEditedSchema>;

/** What every Change Event says, whatever happened: which Question, which Viewer, when. */
const changeEventSchema = z.object({
  id: z.uuid(),
  /** Null for an event about a submission that stored no Question (ADR-0006). */
  questionId: z.uuid().nullable(),
  viewerId: z.uuid(),
  /** Sent because the id is not something a person can read, and the email is the only
   * name a Viewer has (ADR-0035). */
  viewerEmail: z.email(),
  at: z.iso.datetime(),
});

/**
 * A Change Event as the API answers with one. The type and the payload are read together,
 * so a caller that has looked at the type knows the shape of what it is holding.
 */
export const changeEventResponseSchema = z.discriminatedUnion("type", [
  changeEventSchema.extend({ type: z.literal("question_added"), payload: questionAddedSchema }),
  changeEventSchema.extend({ type: z.literal("question_edited"), payload: questionEditedSchema }),
  changeEventSchema.extend({
    type: z.literal("near_duplicate_refused"),
    payload: nearDuplicateRefusedSchema,
  }),
  changeEventSchema.extend({
    type: z.literal("near_duplicate_overridden"),
    payload: nearDuplicateOverriddenSchema,
  }),
  changeEventSchema.extend({
    type: z.literal("administrator_appointed"),
    payload: administratorAppointedSchema,
  }),
  changeEventSchema.extend({
    type: z.literal("administrator_withdrawn"),
    payload: administratorWithdrawnSchema,
  }),
  changeEventSchema.extend({ type: z.literal("role_changed"), payload: roleChangedSchema }),
  changeEventSchema.extend({ type: z.literal("client_created"), payload: clientCreatedSchema }),
  changeEventSchema.extend({
    type: z.literal("permission_grant_issued"),
    payload: permissionGrantIssuedSchema,
  }),
  changeEventSchema.extend({
    type: z.literal("permission_grant_revoked"),
    payload: permissionGrantRevokedSchema,
  }),
  changeEventSchema.extend({ type: z.literal("viewer_created"), payload: viewerCreatedSchema }),
]);
export type ChangeEvent = z.infer<typeof changeEventResponseSchema>;

/** The history of one Question, oldest first, because a history is read forwards. */
export const questionHistoryResponseSchema = z
  .object({ events: z.array(changeEventResponseSchema) })
  .strict();
export type QuestionHistoryResponse = z.infer<typeof questionHistoryResponseSchema>;

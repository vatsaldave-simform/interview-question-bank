import {
  administratorAppointedSchema,
  administratorWithdrawnSchema,
  changeEventKinds,
  clientCreatedSchema,
  nearDuplicateOverriddenSchema,
  nearDuplicateRefusedSchema,
  permissionGrantIssuedSchema,
  permissionGrantRevokedSchema,
  questionAddedSchema,
  questionClassifiedSchema,
  questionDeclassifiedSchema,
  questionEditedSchema,
  questionPublishedSchema,
  questionRejectedSchema,
  questionResubmittedSchema,
  questionReturnedSchema,
  roleChangedSchema,
  roleRequestDeniedSchema,
  roleRequestGrantedSchema,
  viewerCreatedSchema,
  viewerDeactivatedSchema,
  viewerReactivatedSchema,
  type AdministratorAppointed,
  type AdministratorWithdrawn,
  type ClientCreated,
  type NearDuplicateOverridden,
  type NearDuplicateRefused,
  type ChangeEvent,
  type ChangeEventType,
  type PermissionGrantIssued,
  type PermissionGrantRevoked,
  type QuestionAdded,
  type QuestionClassified,
  type QuestionDeclassified,
  type QuestionEdited,
  type QuestionPublished,
  type QuestionRejected,
  type QuestionResubmitted,
  type QuestionReturned,
  type RoleChanged,
  type RoleRequestDenied,
  type RoleRequestGranted,
  type ViewerCreated,
  type ViewerDeactivated,
  type Viewer,
  type ViewerReactivated,
} from "@iqb/shared";
import type { Prisma } from "../../generated/prisma/client.ts";
import type { DatabaseOrTransaction } from "../../platform/database.ts";

/** What each kind of event says about its Question, as the caller must write it. */
type QuestionOf = {
  required: { questionId: string };
  never: { questionId?: undefined };
  optional: { questionId: string | null };
};

/** The type and the payload travel together, so an edit's before and after cannot be
 * filed as an addition. Whether a Question may be named comes from the type's entry in
 * the table in `@iqb/shared`. */
export type ChangeEventToInsert = {
  [Type in ChangeEventType]: {
    type: Type;
    payload: Extract<ChangeEvent, { type: Type }>["payload"];
  } & QuestionOf[(typeof changeEventKinds)[Type]["question"]];
}[ChangeEventType];

/**
 * The kinds whose payload names a Question other than the one the event hangs off. Only
 * the Viewer the event names may read one, because its presence alone says that other
 * Question exists (ADR-0028).
 */
export const aboutAnotherQuestion = [
  "near_duplicate_refused",
  "near_duplicate_overridden",
] as const satisfies readonly ChangeEventType[];

/** `viewer` is the Viewer who did it. */
export async function insertChangeEvent(
  database: DatabaseOrTransaction,
  viewer: Viewer,
  event: ChangeEventToInsert,
): Promise<void> {
  // Refused here, because the log is append-only and a wrong payload could not be fixed
  // afterwards (ADR-0027).
  changeEventKinds[event.type].payload.parse(event.payload);
  await database.changeEvent.create({
    data: {
      questionId: event.questionId ?? null,
      viewerId: viewer.id,
      type: event.type,
      payload: event.payload,
    },
  });
}

/** Exported because the history is read through the same condition every Question read
 * goes through, and that condition lives next to them (ADR-0003). */
export const changeEventFieldsToRead = {
  id: true,
  questionId: true,
  viewerId: true,
  viewer: { select: { email: true } },
  type: true,
  payload: true,
  createdAt: true,
} satisfies Prisma.ChangeEventSelect;

type ChangeEventRow = Prisma.ChangeEventGetPayload<{ select: typeof changeEventFieldsToRead }>;

/** A Change Event as the rest of the code sees one: its payload is the shape its type
 * says, rather than whatever JSON happens to be in the column. */
export type ChangeEventFromDb = {
  id: string;
  questionId: string | null;
  viewerId: string;
  viewerEmail: string;
  createdAt: Date;
} & (
  | { type: "question_added"; payload: QuestionAdded }
  | { type: "question_edited"; payload: QuestionEdited }
  | { type: "near_duplicate_refused"; payload: NearDuplicateRefused }
  | { type: "near_duplicate_overridden"; payload: NearDuplicateOverridden }
  | { type: "administrator_appointed"; payload: AdministratorAppointed }
  | { type: "administrator_withdrawn"; payload: AdministratorWithdrawn }
  | { type: "role_changed"; payload: RoleChanged }
  | { type: "client_created"; payload: ClientCreated }
  | { type: "permission_grant_issued"; payload: PermissionGrantIssued }
  | { type: "permission_grant_revoked"; payload: PermissionGrantRevoked }
  | { type: "viewer_created"; payload: ViewerCreated }
  | { type: "viewer_deactivated"; payload: ViewerDeactivated }
  | { type: "viewer_reactivated"; payload: ViewerReactivated }
  | { type: "role_request_granted"; payload: RoleRequestGranted }
  | { type: "role_request_denied"; payload: RoleRequestDenied }
  | { type: "question_published"; payload: QuestionPublished }
  | { type: "question_rejected"; payload: QuestionRejected }
  | { type: "question_resubmitted"; payload: QuestionResubmitted }
  | { type: "question_returned"; payload: QuestionReturned }
  | { type: "question_classified"; payload: QuestionClassified }
  | { type: "question_declassified"; payload: QuestionDeclassified }
);

/** Parsed rather than cast, for the reason a Tag's Category is parsed: a payload that
 * does not match its type means the rows and the code are out of sync (ADR-0024). */
export function toChangeEventFromDb(row: ChangeEventRow): ChangeEventFromDb {
  const happened = {
    id: row.id,
    questionId: row.questionId,
    viewerId: row.viewerId,
    viewerEmail: row.viewer.email,
    createdAt: row.createdAt,
  };
  switch (row.type) {
    case "question_added":
      return { ...happened, type: row.type, payload: questionAddedSchema.parse(row.payload) };
    case "question_edited":
      return { ...happened, type: row.type, payload: questionEditedSchema.parse(row.payload) };
    case "near_duplicate_refused":
      return {
        ...happened,
        type: row.type,
        payload: nearDuplicateRefusedSchema.parse(row.payload),
      };
    case "near_duplicate_overridden":
      return {
        ...happened,
        type: row.type,
        payload: nearDuplicateOverriddenSchema.parse(row.payload),
      };
    case "administrator_appointed":
      return {
        ...happened,
        type: row.type,
        payload: administratorAppointedSchema.parse(row.payload),
      };
    case "administrator_withdrawn":
      return {
        ...happened,
        type: row.type,
        payload: administratorWithdrawnSchema.parse(row.payload),
      };
    case "role_changed":
      return { ...happened, type: row.type, payload: roleChangedSchema.parse(row.payload) };
    case "client_created":
      return { ...happened, type: row.type, payload: clientCreatedSchema.parse(row.payload) };
    case "permission_grant_issued":
      return {
        ...happened,
        type: row.type,
        payload: permissionGrantIssuedSchema.parse(row.payload),
      };
    case "permission_grant_revoked":
      return {
        ...happened,
        type: row.type,
        payload: permissionGrantRevokedSchema.parse(row.payload),
      };
    case "viewer_created":
      return { ...happened, type: row.type, payload: viewerCreatedSchema.parse(row.payload) };
    case "viewer_deactivated":
      return {
        ...happened,
        type: row.type,
        payload: viewerDeactivatedSchema.parse(row.payload),
      };
    case "viewer_reactivated":
      return {
        ...happened,
        type: row.type,
        payload: viewerReactivatedSchema.parse(row.payload),
      };
    case "role_request_granted":
      return {
        ...happened,
        type: row.type,
        payload: roleRequestGrantedSchema.parse(row.payload),
      };
    case "role_request_denied":
      return {
        ...happened,
        type: row.type,
        payload: roleRequestDeniedSchema.parse(row.payload),
      };
    case "question_published":
      return {
        ...happened,
        type: row.type,
        payload: questionPublishedSchema.parse(row.payload),
      };
    case "question_rejected":
      return { ...happened, type: row.type, payload: questionRejectedSchema.parse(row.payload) };
    case "question_resubmitted":
      return {
        ...happened,
        type: row.type,
        payload: questionResubmittedSchema.parse(row.payload),
      };
    case "question_returned":
      return { ...happened, type: row.type, payload: questionReturnedSchema.parse(row.payload) };
    case "question_classified":
      return {
        ...happened,
        type: row.type,
        payload: questionClassifiedSchema.parse(row.payload),
      };
    case "question_declassified":
      return {
        ...happened,
        type: row.type,
        payload: questionDeclassifiedSchema.parse(row.payload),
      };
  }
}

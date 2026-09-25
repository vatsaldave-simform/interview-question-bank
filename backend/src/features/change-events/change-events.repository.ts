import {
  administratorAppointedSchema,
  administratorWithdrawnSchema,
  clientCreatedSchema,
  nearDuplicateOverriddenSchema,
  nearDuplicateRefusedSchema,
  permissionGrantIssuedSchema,
  permissionGrantRevokedSchema,
  questionAddedSchema,
  questionEditedSchema,
  roleChangedSchema,
  viewerCreatedSchema,
  viewerDeactivatedSchema,
  viewerReactivatedSchema,
  type AdministratorAppointed,
  type AdministratorWithdrawn,
  type ClientCreated,
  type NearDuplicateOverridden,
  type NearDuplicateRefused,
  type ChangeEventType,
  type PermissionGrantIssued,
  type PermissionGrantRevoked,
  type QuestionAdded,
  type QuestionEdited,
  type RoleChanged,
  type ViewerCreated,
  type ViewerDeactivated,
  type ViewerReactivated,
} from "@iqb/shared";
import type { Prisma } from "../../generated/prisma/client.ts";
import type { DatabaseOrTransaction } from "../../platform/database.ts";

/** The type and the payload travel together, so an edit's before and after cannot be
 * filed as an addition, and only a refused submission may name no Question (ADR-0006). */
export type NewChangeEvent =
  | {
      type: "question_added";
      questionId: string;
      viewerId: string;
      payload: QuestionAdded;
    }
  | {
      type: "question_edited";
      questionId: string;
      viewerId: string;
      payload: QuestionEdited;
    }
  | {
      /** Null, never an id: nothing was stored, which is the whole point of this one. */
      type: "near_duplicate_refused";
      questionId: null;
      viewerId: string;
      payload: NearDuplicateRefused;
    }
  | {
      type: "near_duplicate_overridden";
      questionId: string;
      viewerId: string;
      payload: NearDuplicateOverridden;
    }
  | {
      /** No Question is ever involved in an administrative act (ADR-0015). */
      type: "administrator_appointed";
      questionId: null;
      viewerId: string;
      payload: AdministratorAppointed;
    }
  | {
      type: "administrator_withdrawn";
      questionId: null;
      viewerId: string;
      payload: AdministratorWithdrawn;
    }
  | {
      type: "role_changed";
      questionId: null;
      viewerId: string;
      payload: RoleChanged;
    }
  | {
      type: "client_created";
      questionId: null;
      viewerId: string;
      payload: ClientCreated;
    }
  | {
      type: "permission_grant_issued";
      questionId: null;
      viewerId: string;
      payload: PermissionGrantIssued;
    }
  | {
      type: "permission_grant_revoked";
      questionId: null;
      viewerId: string;
      payload: PermissionGrantRevoked;
    }
  | {
      type: "viewer_created";
      questionId: null;
      viewerId: string;
      payload: ViewerCreated;
    }
  | {
      type: "viewer_deactivated";
      questionId: null;
      viewerId: string;
      payload: ViewerDeactivated;
    }
  | {
      type: "viewer_reactivated";
      questionId: null;
      viewerId: string;
      payload: ViewerReactivated;
    };

/**
 * The kinds whose payload names a Question other than the one the event hangs off. Only
 * the Viewer the event names may read one, because its presence alone says that other
 * Question exists (ADR-0028).
 */
export const aboutAnotherQuestion = [
  "near_duplicate_refused",
  "near_duplicate_overridden",
] as const satisfies readonly ChangeEventType[];

export async function insertChangeEvent(
  database: DatabaseOrTransaction,
  event: NewChangeEvent,
): Promise<void> {
  await database.changeEvent.create({
    data: {
      questionId: event.questionId,
      viewerId: event.viewerId,
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
      return { ...happened, type: row.type, payload: nearDuplicateRefusedSchema.parse(row.payload) };
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
  }
}

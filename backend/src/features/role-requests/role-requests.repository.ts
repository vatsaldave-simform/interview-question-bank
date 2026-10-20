import type { NamedViewer, ViewerRole } from "@iqb/shared";
import type { Prisma, RoleRequestState } from "../../generated/prisma/client.ts";
import type { Database, DatabaseOrTransaction } from "../../platform/database.ts";

const publicFields = {
  id: true,
  viewer: { select: { id: true, email: true, role: true } },
  role: true,
  state: true,
  reason: true,
  createdAt: true,
  decidedAt: true,
} satisfies Prisma.RoleRequestSelect;

type RoleRequestRow = Prisma.RoleRequestGetPayload<{ select: typeof publicFields }>;

export type RoleRequestFromDb = {
  id: string;
  viewer: NamedViewer;
  role: ViewerRole;
  heldRole: ViewerRole;
  state: RoleRequestState;
  reason: string | null;
  createdAt: Date;
  decidedAt: Date | null;
};

function toRoleRequestFromDb({
  viewer: { role: heldRole, ...viewer },
  ...roleRequest
}: RoleRequestRow): RoleRequestFromDb {
  return { ...roleRequest, viewer, heldRole };
}

export type RoleRequestDecision =
  | { state: "granted"; reason: string | null }
  | { state: "denied"; reason: string };

/** Throws P2002 when the Viewer already holds an open one: the partial unique index is
 * the check, and nothing looks first (ADR-0041). */
export function insertRoleRequest(
  database: DatabaseOrTransaction,
  viewerId: string,
  role: ViewerRole,
): Promise<RoleRequestFromDb> {
  return database.roleRequest
    .create({ data: { viewerId, role }, select: publicFields })
    .then(toRoleRequestFromDb);
}

export async function findRoleRequestById(
  database: DatabaseOrTransaction,
  id: string,
): Promise<RoleRequestFromDb | null> {
  const roleRequest = await database.roleRequest.findUnique({
    where: { id },
    select: publicFields,
  });
  return roleRequest === null ? null : toRoleRequestFromDb(roleRequest);
}

export async function findRoleRequestsOf(
  database: Database,
  viewerId: string,
): Promise<RoleRequestFromDb[]> {
  const roleRequests = await database.roleRequest.findMany({
    where: { viewerId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: publicFields,
  });
  return roleRequests.map(toRoleRequestFromDb);
}

export async function findOpenRoleRequests(database: Database): Promise<RoleRequestFromDb[]> {
  const roleRequests = await database.roleRequest.findMany({
    where: { state: "open" },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: publicFields,
  });
  return roleRequests.map(toRoleRequestFromDb);
}

/** Null when the Role Request is not open, because the state is in the `where`: of two
 * decisions at once, the second waits on the row and then finds nothing to change. */
export async function decideRoleRequest(
  database: DatabaseOrTransaction,
  id: string,
  decision: RoleRequestDecision,
): Promise<RoleRequestFromDb | null> {
  const [decided] = await database.roleRequest.updateManyAndReturn({
    where: { id, state: "open" },
    data: { state: decision.state, reason: decision.reason, decidedAt: new Date() },
    select: publicFields,
  });
  return decided === undefined ? null : toRoleRequestFromDb(decided);
}

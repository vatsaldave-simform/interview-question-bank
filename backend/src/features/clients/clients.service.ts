import type { Client, ClientCreated, Viewer } from "@iqb/shared";
import { Prisma } from "../../generated/prisma/client.ts";
import { insertChangeEvent } from "../change-events/change-events.repository.ts";
import { insertClient } from "./clients.repository.ts";
import type { Database } from "../../platform/database.ts";
import { ConflictError } from "../../platform/errors.ts";

/**
 * Creating a Client grants nobody anything, the creator included: an Administrator sees
 * it only after issuing themselves a Permission Grant, in the open (ADR-0015).
 */
export async function createClient(
  database: Database,
  actingViewer: Viewer,
  name: string,
): Promise<Client> {
  try {
    return await database.$transaction(async (transaction) => {
      const client = await insertClient(transaction, name);
      const payload: ClientCreated = { client };
      await insertChangeEvent(transaction, {
        type: "client_created",
        questionId: null,
        viewerId: actingViewer.id,
        payload,
      });
      return client;
    });
  } catch (error) {
    // Caught from the unique index rather than checked first, so two requests racing for
    // one name cannot both pass the check.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new ConflictError("A Client with that name already exists.");
    }
    throw error;
  }
}

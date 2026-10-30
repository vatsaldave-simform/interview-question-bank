import type { Client, ClientCreated, Viewer } from "@iqb/shared";
import { Prisma } from "../../generated/prisma/client.ts";
import { insertChangeEvent } from "../change-events/change-events.repository.ts";
import { insertClient } from "./clients.repository.ts";
import type { Database } from "../../platform/database.ts";
import { ConflictError } from "../../platform/errors.ts";

/** Every Viewer sees the new Client at once, because a Client hides nothing (ADR-0050). */
export async function createClient(
  database: Database,
  viewer: Viewer,
  name: string,
): Promise<Client> {
  try {
    return await database.$transaction(async (transaction) => {
      const client = await insertClient(transaction, name);
      const payload: ClientCreated = { client };
      await insertChangeEvent(transaction, viewer, {
        type: "client_created",
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

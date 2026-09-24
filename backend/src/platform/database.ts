import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type Prisma } from "../generated/prisma/client.ts";

export type Database = PrismaClient;

/** The transaction a write is running in, so that a row and the Change Event that
 * describes it cannot happen without each other. */
export type DatabaseOrTransaction = Database | Prisma.TransactionClient;

export type DatabaseOptions = {
  /**
   * How many connections this process may hold open. Required, so the default lives in
   * the environment schema alone. It has to stay well under the server's limit, and
   * nothing routes through a pooler (ADR-0012).
   */
  poolMax: number;
};

/** Prisma 7 talks to PostgreSQL through a driver adapter rather than its own engine. */
export function createDatabase(connectionString: string, { poolMax }: DatabaseOptions): Database {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString, max: poolMax }) });
}

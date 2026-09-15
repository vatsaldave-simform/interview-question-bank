import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.js";

export type Database = PrismaClient;

/** Prisma 7 talks to PostgreSQL through a driver adapter rather than its own engine. */
export function createDatabase(connectionString: string): Database {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

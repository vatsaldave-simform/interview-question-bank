import type { SeedClient } from "./clients.seed.ts";

// Made up, like the demo Clients: real client material in the hosted bank would undo the
// case for publishing the demo logins (ADR-0012).

export const harbourline: SeedClient = { name: "Harbourline Logistics" };

export const brightwater: SeedClient = { name: "Brightwater Bank" };

export const fernhill: SeedClient = { name: "Fernhill Retail" };

export const hostedClients: readonly SeedClient[] = [harbourline, brightwater, fernhill];

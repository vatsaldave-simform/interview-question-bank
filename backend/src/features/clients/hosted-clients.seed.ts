import type { SeedClient } from "./clients.seed.ts";

// Made up, like the demo Clients: real client material in the hosted bank would undo the
// case for publishing the demo logins (ADR-0012).

/** John needs a Grant to restrict a Question to a Client, and Jane needs one to review
 * it, because review does not get past Visibility (ADR-0013). */
const authorAndReviewer = ["john.doe@iqb.test", "jane.doe@iqb.test"];

export const harbourline: SeedClient = {
  name: "Harbourline Logistics",
  grantedTo: [...authorAndReviewer, "shane.austin@iqb.test"],
};

export const brightwater: SeedClient = {
  name: "Brightwater Bank",
  grantedTo: [...authorAndReviewer, "cody.rhodes@iqb.test"],
};

/** Held by no Reader, and Dwayne holds no Grant at all, so each Reader sees a
 * different bank. */
export const fernhill: SeedClient = {
  name: "Fernhill Retail",
  grantedTo: authorAndReviewer,
};

export const hostedClients: readonly SeedClient[] = [harbourline, brightwater, fernhill];

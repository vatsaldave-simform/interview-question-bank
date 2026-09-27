import type { Provenance } from "@iqb/shared";

export const provenanceWording: Record<Provenance, { name: string; meaning: string }> = {
  original: { name: "Original", meaning: "Written by its Author." },
  adapted: { name: "Adapted", meaning: "Reworked from a public work." },
  inherited: {
    name: "Inherited",
    meaning: "Carried in from an existing document. Where it came from is not known.",
  },
};

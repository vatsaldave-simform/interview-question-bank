import type { RequestedRole } from "@iqb/shared";

/** Every role a Role Request may name, Reader included, so an old one still reads as it
 * was asked (ADR-0055). */
export const roleWording: Record<RequestedRole, string> = {
  reader: "Reader",
  author: "Author",
  reviewer: "Reviewer",
};

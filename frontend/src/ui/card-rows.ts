/** The last row's padding stands in for the card's, so the list pulls the card's in. */
export const cardRows = "divide-border -mb-2 flex flex-col divide-y";

/** The tint sits behind the row and reaches past its text, as in the artifact. */
export const cardRow =
  "hover:before:bg-hover relative isolate flex flex-col gap-2 py-3 before:absolute before:inset-y-0 before:-inset-x-2 before:-z-10 before:rounded-lg before:transition-colors before:duration-150";

/** Stretched over the whole row, so a click anywhere opens it but a screen reader hears only the
 * title. */
export const cardRowLink =
  "line-clamp-2 font-medium outline-hidden after:absolute after:inset-y-0 after:-inset-x-2 after:rounded-lg focus-visible:after:ring-2 focus-visible:after:ring-ring";

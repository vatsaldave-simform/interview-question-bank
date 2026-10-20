/** A list of rows on a card, such as on Home. The last row's padding stands in for the card's. */
export const cardRows = "divide-border -mb-2 flex flex-col divide-y";

/** One row, tinted when pointed at. The tint reaches past the text, as in the artifact. */
export const cardRow =
  "hover:before:bg-hover relative isolate flex flex-col gap-2 py-3 before:absolute before:inset-y-0 before:-inset-x-2 before:-z-10 before:rounded-lg";

/** The row's title, stretched over the whole row, so a click anywhere opens it but a screen
 * reader names it by the title alone. */
export const cardRowLink =
  "line-clamp-2 font-medium outline-none after:absolute after:inset-y-0 after:-inset-x-2 after:rounded-lg focus-visible:after:ring-2 focus-visible:after:ring-ring";

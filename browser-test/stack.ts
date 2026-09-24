/** Not 3000 and 5434, so a run never collides with a stack someone already has up. */
export const apiPort = process.env.BROWSER_TEST_PORT ?? "3100";
export const databasePort = process.env.BROWSER_TEST_DB_PORT ?? "5436";

/** Its own compose project, so the run gets its own database and never writes to the
 * development bank (ADR-0036). */
export const composeProject = "iqb-browser-test";

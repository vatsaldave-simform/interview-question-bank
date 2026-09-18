import { pino, type DestinationStream, type Logger } from "pino";
import { currentRequestContext } from "./request-context.js";

export type LoggerOptions = {
  level: string;
  /** Pretty output is deliberately absent: the logs are JSON everywhere, including dev. */
  destination?: DestinationStream;
};

export function createLogger({ level, destination }: LoggerOptions): Logger {
  return destination ? pino({ level }, destination) : pino({ level });
}

let rootLogger: Logger = pino({ level: "silent" });

/** Called once at startup, and by the app factory, so `log()` has somewhere to write. */
export function setRootLogger(logger: Logger): void {
  rootLogger = logger;
}

/**
 * The logger to write with. Inside a request this is the child logger made for that
 * request, carrying `requestId`, so a line logged anywhere in the call stack can be
 * traced back to the request that caused it without passing a logger argument through
 * every function. Outside a request it is the root logger.
 */
export function log(): Logger {
  return currentRequestContext()?.logger ?? rootLogger;
}

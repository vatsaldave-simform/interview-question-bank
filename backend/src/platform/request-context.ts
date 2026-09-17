import { AsyncLocalStorage } from "node:async_hooks";
import type { Logger } from "pino";

export type RequestContext = {
  requestId: string;
  logger: Logger;
};

const storage = new AsyncLocalStorage<RequestContext>();

export function runWithRequestContext<T>(context: RequestContext, fn: () => T): T {
  return storage.run(context, fn);
}

export function currentRequestContext(): RequestContext | undefined {
  return storage.getStore();
}

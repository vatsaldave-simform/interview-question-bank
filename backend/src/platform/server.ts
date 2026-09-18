import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { Express } from "express";
import type { Logger } from "pino";

export type ServerOptions = {
  app: Express;
  port: number;
  logger: Logger;
  /** Closes whatever the server owns beyond its sockets. Runs after the last request. */
  onShutdown?: () => Promise<void>;
  /**
   * How long in-flight requests get before their sockets are closed anyway. Required,
   * so the default lives in the environment schema alone.
   */
  shutdownTimeoutMs: number;
};

export type RunningServer = {
  url: string;
  port: number;
  /** Safe to call twice: several signals arriving at once still shut down once. */
  stop: () => Promise<void>;
};

export async function startServer({
  app,
  port,
  logger,
  onShutdown,
  shutdownTimeoutMs,
}: ServerOptions): Promise<RunningServer> {
  const server = createServer(app);

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, () => {
      server.off("error", reject);
      resolve();
    });
  });

  const address = server.address() as AddressInfo;
  logger.info({ port: address.port }, "server listening");

  let stopping: Promise<void> | undefined;

  const stop = (): Promise<void> => {
    stopping ??= shutDown(server, logger, shutdownTimeoutMs, onShutdown);
    return stopping;
  };

  return { url: `http://127.0.0.1:${address.port}`, port: address.port, stop };
}

async function shutDown(
  server: Server,
  logger: Logger,
  shutdownTimeoutMs: number,
  onShutdown?: () => Promise<void>,
): Promise<void> {
  logger.info("shutting down");

  const closed = new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });

  // Keep-alive sockets sitting idle would hold the close open for their full timeout.
  server.closeIdleConnections();
  const forceClose = setTimeout(() => {
    logger.warn({ shutdownTimeoutMs }, "in-flight requests outlasted the grace period");
    server.closeAllConnections();
  }, shutdownTimeoutMs);
  forceClose.unref();

  try {
    await closed;
  } finally {
    clearTimeout(forceClose);
    await onShutdown?.();
    logger.info("shutdown complete");
  }
}

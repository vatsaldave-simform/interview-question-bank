/**
 * Reads a value until it settles, for the things that land a moment after the response
 * does: a log line written on the response's `finish` event, a connection Postgres has
 * not yet noticed is gone.
 */
export async function readUntil<T>(
  read: () => Promise<T> | T,
  settled: (value: T) => boolean,
  { attempts = 50, intervalMs = 20 } = {},
): Promise<T> {
  let value = await read();
  for (let attempt = 0; attempt < attempts && !settled(value); attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
    value = await read();
  }
  return value;
}

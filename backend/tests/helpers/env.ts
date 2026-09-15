/** Runs `body` against a different DATABASE_URL, then puts the old one back. */
export async function withDatabaseUrl<T>(url: string, body: () => Promise<T>): Promise<T> {
  const previous = process.env.DATABASE_URL;
  process.env.DATABASE_URL = url;
  try {
    return await body();
  } finally {
    process.env.DATABASE_URL = previous;
  }
}

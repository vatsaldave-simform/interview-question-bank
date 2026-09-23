/**
 * Read and write the part of the address after `?` the way the API reads its own query:
 * a name given twice is a list, and every value is plain text. The router's default
 * writes JSON instead, which would make a shared link look nothing like the request it
 * sends (ADR-0025).
 */
export function parseSearch(searchText: string): Record<string, string | string[]> {
  const read: Record<string, string | string[]> = {};
  for (const [name, value] of new URLSearchParams(searchText)) {
    const already = read[name];
    read[name] = already === undefined ? value : [already, value].flat();
  }
  return read;
}

/** Only text, numbers and lists of them are written; a value left undefined is not. */
export function stringifySearch(search: Record<string, unknown>): string {
  const written = new URLSearchParams();
  for (const [name, value] of Object.entries(search)) {
    for (const one of Array.isArray(value) ? value : [value]) {
      if (one !== undefined) written.append(name, String(one));
    }
  }
  const text = written.toString();
  return text === "" ? "" : `?${text}`;
}

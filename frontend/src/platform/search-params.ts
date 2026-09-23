/** Reads a name given twice as a list, the way the API reads its query, where the
 * router's default would read JSON and make a shared link unlike the request (ADR-0025). */
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

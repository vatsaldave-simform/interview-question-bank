/** The Tags chosen in one Category after one of them is ticked or unticked. */
export function chosenAfter(
  chosen: readonly string[],
  tag: string,
  checked: boolean | "indeterminate",
): string[] {
  return checked === true ? [...chosen, tag] : chosen.filter((one) => one !== tag);
}

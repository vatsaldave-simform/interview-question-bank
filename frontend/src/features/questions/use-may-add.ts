import { mayAdd } from "@iqb/shared";
import { useSession } from "@/platform/session";

/** Asks the rule the API refuses by, so a page offers adding only where it would be let
 * through (ADR-0045). */
export function useMayAdd(): boolean {
  const session = useSession();
  return session.status === "signed-in" && mayAdd(session.viewer);
}

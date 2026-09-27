import { roleRequestListResponseSchema } from "@iqb/shared";
import { useQuery } from "@tanstack/react-query";
import { callApi } from "@/platform/api-client";

/** Oldest first, as the API sends them, so the one waiting longest is at the top. */
export function useOpenRoleRequests() {
  return useQuery({
    queryKey: ["role-requests", "open"],
    queryFn: ({ signal }) =>
      callApi("/api/role-requests", roleRequestListResponseSchema, { signal }),
    select: (answer) => answer.roleRequests,
  });
}

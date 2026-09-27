import {
  roleRequestListResponseSchema,
  roleRequestResponseSchema,
  type DecideRoleRequestRequest,
} from "@iqb/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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

export function useDecideRoleRequest(roleRequestId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (decision: DecideRoleRequestRequest) =>
      callApi(
        `/api/role-requests/${encodeURIComponent(roleRequestId)}/decision`,
        roleRequestResponseSchema,
        { method: "POST", body: decision },
      ),
    // The Viewer list too, because granting changes the requester's role.
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ["role-requests"] }),
        queryClient.invalidateQueries({ queryKey: ["viewers"] }),
      ]),
  });
}

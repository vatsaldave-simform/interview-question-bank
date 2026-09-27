import {
  roleRequestListResponseSchema,
  roleRequestResponseSchema,
  type DecideRoleRequestRequest,
  type RaiseRoleRequestRequest,
} from "@iqb/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { callApi } from "@/platform/api-client";
import { currentViewerQuery } from "@/platform/current-viewer";

/** Oldest first, as the API sends them, so the one waiting longest is at the top. */
export function useOpenRoleRequests() {
  return useQuery({
    queryKey: ["role-requests", "open"],
    queryFn: ({ signal }) =>
      callApi("/api/role-requests", roleRequestListResponseSchema, { signal }),
    select: (answer) => answer.roleRequests,
  });
}

/** Newest first, as the API sends them, so the first one is what became of the latest. */
export function useMyRoleRequests() {
  return useQuery({
    queryKey: ["role-requests", "mine"],
    queryFn: ({ signal }) =>
      callApi("/api/role-requests/mine", roleRequestListResponseSchema, { signal }),
    select: (answer) => answer.roleRequests,
  });
}

export function useRaiseRoleRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: RaiseRoleRequestRequest) =>
      callApi("/api/role-requests", roleRequestResponseSchema, { method: "POST", body: request }),
    // After a refusal too: an open request, or the role held, may have changed since this
    // screen asked.
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ["role-requests"] }),
        queryClient.invalidateQueries({ queryKey: currentViewerQuery.queryKey }),
      ]),
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
    // An Administrator may have granted their own, and only the API says what they hold now.
    onSuccess: () => queryClient.prefetchQuery(currentViewerQuery),
    // After a refusal too, because another Administrator may have decided it first.
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ["role-requests"] }),
        // Granting changes the requester's role.
        queryClient.invalidateQueries({ queryKey: ["viewers"] }),
      ]),
  });
}

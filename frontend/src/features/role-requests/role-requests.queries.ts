import {
  roleRequestListResponseSchema,
  roleRequestResponseSchema,
  type DecideRoleRequestRequest,
  type RaiseRoleRequestRequest,
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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["role-requests"] }),
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

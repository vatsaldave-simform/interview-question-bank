import {
  clientListResponseSchema,
  clientResponseSchema,
  type CreateClientRequest,
} from "@iqb/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { callApi } from "@/platform/api-client";

/** Every Client, which only an Administrator is answered with (ADR-0042). */
export function useEveryClient() {
  return useQuery({
    queryKey: ["clients", "all"],
    queryFn: ({ signal }) => callApi("/api/clients/all", clientListResponseSchema, { signal }),
    select: (answer) => answer.clients,
  });
}

export function useCreateClient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: CreateClientRequest) =>
      callApi("/api/clients", clientResponseSchema, { method: "POST", body: request }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["clients"] }),
  });
}

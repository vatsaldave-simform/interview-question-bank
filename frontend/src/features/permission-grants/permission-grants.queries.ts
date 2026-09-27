import { permissionGrantListResponseSchema, permissionGrantResponseSchema } from "@iqb/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { callApi, callApiWithoutAnswer } from "@/platform/api-client";

function grantsPath(clientId: string): string {
  return `/api/clients/${encodeURIComponent(clientId)}/grants`;
}

export function useGrantsAgainst(clientId: string) {
  return useQuery({
    queryKey: ["permission-grants", clientId],
    queryFn: ({ signal }) =>
      callApi(grantsPath(clientId), permissionGrantListResponseSchema, { signal }),
    select: (answer) => answer.grants,
  });
}

type GrantAct = { act: "issue" | "revoke"; viewerId: string };

export function useActOnGrants(clientId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ act, viewerId }: GrantAct): Promise<void> => {
      if (act === "revoke") {
        const path = `${grantsPath(clientId)}/${encodeURIComponent(viewerId)}`;
        return callApiWithoutAnswer(path, { method: "DELETE" });
      }
      await callApi(grantsPath(clientId), permissionGrantResponseSchema, {
        method: "POST",
        body: { viewerId },
      });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["permission-grants", clientId] }),
  });
}

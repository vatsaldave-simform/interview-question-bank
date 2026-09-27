import { permissionGrantListResponseSchema } from "@iqb/shared";
import { useQuery } from "@tanstack/react-query";
import { callApi } from "@/platform/api-client";

export function useGrantsAgainst(clientId: string) {
  return useQuery({
    queryKey: ["permission-grants", clientId],
    queryFn: ({ signal }) =>
      callApi(
        `/api/clients/${encodeURIComponent(clientId)}/grants`,
        permissionGrantListResponseSchema,
        { signal },
      ),
    select: (answer) => answer.grants,
  });
}

import { clientListResponseSchema } from "@iqb/shared";
import { useQuery } from "@tanstack/react-query";
import { callApi } from "@/platform/api-client";

/** Every Client, which only an Administrator is answered with (ADR-0042). */
export function useEveryClient() {
  return useQuery({
    queryKey: ["clients", "all"],
    queryFn: ({ signal }) => callApi("/api/clients/all", clientListResponseSchema, { signal }),
    select: (answer) => answer.clients,
  });
}

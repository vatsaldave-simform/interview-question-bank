import { viewerListResponseSchema } from "@iqb/shared";
import { useQuery } from "@tanstack/react-query";
import { callApi } from "@/platform/api-client";

export function useEveryViewer() {
  return useQuery({
    queryKey: ["viewers", "all"],
    queryFn: ({ signal }) => callApi("/api/viewers", viewerListResponseSchema, { signal }),
    select: (answer) => answer.viewers,
  });
}

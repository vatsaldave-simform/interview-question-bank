import { viewerListResponseSchema } from "@iqb/shared";
import { useQuery } from "@tanstack/react-query";
import { callApi } from "@/platform/api-client";

export function useViewerList() {
  return useQuery({
    queryKey: ["viewers", "list"],
    queryFn: ({ signal }) => callApi("/api/viewers", viewerListResponseSchema, { signal }),
    select: (answer) => answer.viewers,
  });
}

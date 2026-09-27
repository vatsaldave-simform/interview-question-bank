import {
  viewerListResponseSchema,
  viewerResponseSchema,
  type CreateViewerRequest,
} from "@iqb/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { callApi } from "@/platform/api-client";

export function useEveryViewer() {
  return useQuery({
    queryKey: ["viewers", "all"],
    queryFn: ({ signal }) => callApi("/api/viewers", viewerListResponseSchema, { signal }),
    select: (answer) => answer.viewers,
  });
}

export function useCreateViewer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: CreateViewerRequest) =>
      callApi("/api/viewers", viewerResponseSchema, { method: "POST", body: request }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["viewers"] }),
  });
}

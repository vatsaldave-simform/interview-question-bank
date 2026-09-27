import { currentViewerResponseSchema } from "@iqb/shared";
import { queryOptions, useQuery } from "@tanstack/react-query";
import { callApi } from "@/platform/api-client";
import { followViewer } from "@/platform/session";

/** The session holds what the last sign-in or refresh said, and an Administrator may have
 * changed the Viewer since, so this asks the API and puts its answer in the session. */
export const currentViewerQuery = queryOptions({
  queryKey: ["auth", "me"],
  queryFn: async ({ signal }) => {
    const { viewer } = await callApi("/api/auth/me", currentViewerResponseSchema, { signal });
    followViewer(viewer);
    return viewer;
  },
});

export function useCurrentViewer() {
  return useQuery(currentViewerQuery);
}

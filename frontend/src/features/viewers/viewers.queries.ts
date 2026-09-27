import {
  viewerListResponseSchema,
  viewerResponseSchema,
  type CreateViewerRequest,
  type Viewer,
  type ViewerRole,
} from "@iqb/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { callApi } from "@/platform/api-client";
import { currentSession, replaceSession } from "@/platform/session";

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

/** What an Administrator does to one Viewer from the console. */
export type ViewerAct =
  | { act: "change-role"; role: ViewerRole }
  | { act: "appoint" }
  | { act: "withdraw" }
  | { act: "deactivate" }
  | { act: "reactivate" };

function requestFor(viewerId: string, act: ViewerAct) {
  const viewerPath = `/api/viewers/${encodeURIComponent(viewerId)}`;
  switch (act.act) {
    case "change-role":
      return { path: `${viewerPath}/role`, method: "PATCH", body: { role: act.role } } as const;
    case "appoint":
      return { path: `${viewerPath}/administrator`, method: "POST" } as const;
    case "withdraw":
      return { path: `${viewerPath}/administrator`, method: "DELETE" } as const;
    case "deactivate":
      return { path: `${viewerPath}/deactivation`, method: "POST" } as const;
    case "reactivate":
      return { path: `${viewerPath}/deactivation`, method: "DELETE" } as const;
  }
}

/** So an Administrator who acts on themselves sees the change now, not when the session
 * next renews. */
function followInSession(viewer: Viewer): void {
  const session = currentSession();
  if (session.status === "signed-in" && session.viewer.id === viewer.id) {
    replaceSession({ ...session, viewer });
  }
}

export function useActOnViewer(viewerId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (act: ViewerAct) => {
      const { path, ...sending } = requestFor(viewerId, act);
      return callApi(path, viewerResponseSchema, sending);
    },
    onSuccess: ({ viewer }) => {
      followInSession(viewer);
      return queryClient.invalidateQueries({ queryKey: ["viewers"] });
    },
  });
}

import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { createQueryClient } from "@/platform/query-client";
import { useSession } from "@/platform/session";
import { createAppRouter } from "@/routes";

export function App() {
  const [queryClient] = useState(createQueryClient);
  const [router] = useState(createAppRouter);
  const session = useSession();

  useEffect(() => {
    // The API answers each Viewer differently, so a cached answer must not outlive the
    // session: the next Viewer in this tab would see it before their own request returns.
    if (session.status === "signed-out") queryClient.clear();
    // Handing the router a new context does not re-run `beforeLoad` on the routes already
    // matched, so without this a Viewer who logged out would keep looking at the shell.
    void router.invalidate();
  }, [queryClient, router, session]);

  return (
    // Query's provider wraps the router because a route's loader reaches the cache through
    // it: the cache has to exist before any route can run.
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} context={{ session }} />
    </QueryClientProvider>
  );
}

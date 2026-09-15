import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const apiOrigin = process.env.API_ORIGIN ?? "http://localhost:3000";

/**
 * In production one Express service serves this client and the API from one origin
 * (ADR-0012). The dev server stands in for that, proxying the API's paths through
 * without rewriting them, so a URL means the same thing in development as it does in
 * the deployed image. /health and /ready are proxied too: they stay at the root rather
 * than under /api, because they answer the platform rather than the application.
 */
export default defineConfig({
  server: {
    port: Number(process.env.FRONTEND_PORT ?? 5173),
    proxy: Object.fromEntries(
      ["/api", "/health", "/ready"].map((path) => [
        path,
        { target: apiOrigin, changeOrigin: true },
      ]),
    ),
  },
});

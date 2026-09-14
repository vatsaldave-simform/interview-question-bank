import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/**
 * The dev server proxies /api to the backend so the client talks to a same-origin
 * URL in development. Deciding how the deployed client reaches the API, and the CORS
 * that comes with credentialed requests (ADR-0008), belongs to the client shell ticket.
 */
export default defineConfig({
  server: {
    port: Number(process.env.FRONTEND_PORT ?? 5173),
    proxy: {
      "/api": {
        target: process.env.API_ORIGIN ?? "http://localhost:3000",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
});

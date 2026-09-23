import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config.ts";

/** Built on the Vite config rather than beside it, so the `@/` alias is written once and
 * a test resolves an import exactly as the built client does. */
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      // The components under test render, so they need a DOM.
      environment: "jsdom",
      globals: false,
      setupFiles: ["./tests/helpers/test-dom.ts"],
      include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    },
  }),
);

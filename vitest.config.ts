import { defineConfig } from "vitest/config";

/**
 * The unit tests cover src/lib only — pure TypeScript with no React Native
 * imports, which is exactly why the calculation lives there. Running them needs
 * no Metro bundler, no simulator and no native runtime, so `npm test` is fast
 * enough to run on every change.
 */
export default defineConfig({
  test: {
    include: ["src/lib/**/*.test.ts"],
    environment: "node",
  },
});

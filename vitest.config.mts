import { defineConfig } from "vitest/config";

export default defineConfig({
  // Resolves the @/* alias straight from tsconfig.json — no plugin needed.
  resolve: { tsconfigPaths: true },
  test: {
    environment: "node",
    setupFiles: ["./test/setup.ts"],
    include: ["src/**/*.test.ts"],
    clearMocks: true,
    restoreMocks: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      reportsDirectory: "./coverage",
      include: ["src/lib/**/*.ts", "src/app/api/**/*.ts"],
      exclude: [
        "**/*.test.ts",
        // Thin client factories (9 and 43 lines) — mocked in every consumer's tests.
        "src/lib/supabase/**",
        // Dead scaffolding: every exported array is empty.
        "src/lib/sample-data.ts",
        // Declaration-only modules.
        "src/lib/translation/types.ts",
        "src/lib/review-constants.ts",
        // 77-row data table; its one function is covered by provinces.test.ts.
        "src/lib/provinces.ts",
        // A React hook. Hooks and components are outside this pass's scope, so
        // it is excluded rather than dragging in a renderer for 23 lines.
        "src/lib/use-is-mobile.ts",
      ],
      // Enabled in Step 6, once the suite is broad enough to clear it.
      // thresholds: { lines: 90, functions: 90, branches: 90, statements: 90 },
    },
  },
});

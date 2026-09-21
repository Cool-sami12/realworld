import { defineConfig } from "vite";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/qa/**/*.test.js"],
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 20000,
  },
});

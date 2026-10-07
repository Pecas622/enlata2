import { defineConfig, loadEnv } from "vite";
import path from "node:path";

export default defineConfig(({ mode }) => ({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    env: loadEnv(mode, process.cwd(), ""),
    include: ["src/**/*.test.ts", "tests/db/**/*.test.ts"],
    fileParallelism: false,
  },
}));

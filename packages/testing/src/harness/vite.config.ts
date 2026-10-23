import { join } from "node:path";
import { defineConfig } from "vite";

export const HARNESS_PORT = 5174;

export default defineConfig({
  root: import.meta.dirname,
  server: {
    port: HARNESS_PORT,
    strictPort: true,
    fs: { allow: [join(import.meta.dirname, "..", "..", "..", "..")] },
  },
  build: { target: "es2023" },
});

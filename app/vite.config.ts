import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";

// Builds to ONE self-contained dist/index.html (JS, CSS and card data inlined),
// so it can be published as an artifact or opened straight from disk.
export default defineConfig({
  plugins: [react(), viteSingleFile()],
  server: { fs: { allow: [".."] } }, // packages/ and packs/ live one level up
  test: { globals: true, environment: "node" },
} as any);

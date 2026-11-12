import { defineConfig, Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";

const ENGINE_PORT = Number(process.env.RKAPRO_PORT ?? 7911);

/** `npm run dev` also starts the duel engine (sim/server.mjs), so one command gives the whole app. */
const duelEngine = (): Plugin => ({
  name: "rkapro-duel-engine",
  apply: "serve",
  async configureServer(server) {
    if (process.env.VITEST) return;
    try {
      const { start } = await import("../sim/server.mjs" as string);
      const s = await start(ENGINE_PORT);
      server.httpServer?.once("close", () => s.close());
      server.config.logger.info(`  duel engine on http://127.0.0.1:${ENGINE_PORT}`);
    } catch (e) {
      // most likely the port is taken by an engine that is already running: use that one
      server.config.logger.warn(`  duel engine not started here (${(e as Error).message})`);
    }
  },
});

// Builds to ONE self-contained dist/index.html (JS, CSS and card data inlined),
// so it can be published as an artifact or opened straight from disk. The duel tab needs the engine (dev server or desktop app).
export default defineConfig({
  plugins: [react(), viteSingleFile(), duelEngine()],
  server: { fs: { allow: [".."] }, proxy: { "/api": `http://127.0.0.1:${ENGINE_PORT}` } }, // packages/ and packs/ live one level up
  test: { globals: true, environment: "node" },
} as any);

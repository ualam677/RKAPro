// `npm run dev:check`: the dev server for scripts/ui-check.mjs. Same app, but the knowledge base and the save folder are
// throwaway copies in the temp folder, so the check's test reports, promoted lines and drill results never touch yours.
import { spawn } from "child_process";
import { cpSync, rmSync, mkdirSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { fileURLToPath } from "url";

const kb = path.join(tmpdir(), "rkapro-check-kb"), saves = path.join(tmpdir(), "rkapro-check-saves");
rmSync(kb, { recursive: true, force: true }); rmSync(saves, { recursive: true, force: true }); mkdirSync(saves, { recursive: true });
cpSync(fileURLToPath(new URL("../../packs/galaxy-eyes/knowledge", import.meta.url)), kb, { recursive: true });
const vite = fileURLToPath(new URL("../node_modules/vite/bin/vite.js", import.meta.url));
spawn(process.execPath, [vite, "--port", "5173", "--strictPort"], { stdio: "inherit", env: { ...process.env, RKAPRO_KB: kb, RKAPRO_SAVES: saves } })
  .on("exit", (c) => process.exit(c ?? 0));

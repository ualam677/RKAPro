// Starts the desktop app. VS Code terminals can carry ELECTRON_RUN_AS_NODE=1, which turns Electron into plain Node
// ("electron does not provide an export named BrowserWindow"), so it is removed here.
import { spawn } from "child_process";
import { createRequire } from "module";
const electron = createRequire(import.meta.url)("electron"); // path to the Electron binary
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
spawn(electron, ["electron/main.mjs", ...process.argv.slice(2)], { stdio: "inherit", env }).on("exit", (c) => process.exit(c ?? 0));

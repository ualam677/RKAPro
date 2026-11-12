// Desktop shell (thin): starts the duel engine in this process and shows the app in a window.
//   npm run desktop        builds the UI, then opens the window (engine + UI served from one local port)
//   RKAPRO_DEV_URL=http://localhost:5173 node scripts/desktop.mjs    use the running Vite dev server instead
import { app, BrowserWindow, shell } from "electron";

const dev = process.env.RKAPRO_DEV_URL;
let url = dev;
if (!dev) {
  const { start } = await import("../../sim/server.mjs");
  const server = await start(0); // any free port; the server also serves app/dist/index.html
  url = `http://127.0.0.1:${server.address().port}/`;
}

// Never `await app.whenReady()` at the top level: Electron fires "ready" only after this module has finished loading.
app.whenReady().then(() => {
  const win = new BrowserWindow({ width: 1500, height: 1000, title: "RKAPro", autoHideMenuBar: true, backgroundColor: "#0f1115" });
  win.webContents.setWindowOpenHandler(({ url: u }) => { shell.openExternal(u); return { action: "deny" }; }); // links open in the browser, not in the app
  win.loadURL(url);
});
app.on("window-all-closed", () => app.quit());

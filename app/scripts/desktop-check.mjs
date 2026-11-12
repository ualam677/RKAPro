// Launches the real desktop app (Electron) and checks that the duel screen comes up with a hand dealt.
//   npm run build && node scripts/desktop-check.mjs [outDir]
import { _electron } from "playwright-core";
import { mkdirSync } from "fs";
import path from "path";
const out = process.argv[2] ?? "ui-shots"; mkdirSync(out, { recursive: true });
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE; // set inside VS Code; it would turn Electron into plain Node
const app = await _electron.launch({ args: ["electron/main.mjs"], env });
const page = await app.firstWindow();
try {
  await page.getByRole("dialog", { name: "New duel" }).waitFor({ timeout: 30000 });
  await page.getByRole("button", { name: "Start duel" }).click();
  await page.getByTestId("hand").locator(".dcard").nth(4).waitFor({ timeout: 15000 });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(out, "8-desktop.png") });
  console.log("ok   desktop app: window opened, engine answered, 5 cards in hand; title:", await page.title());
} catch (e) { console.log("FAIL desktop app:", String(e).split("\n")[0]); await page.screenshot({ path: path.join(out, "FAIL-desktop.png") }).catch(() => {}); process.exitCode = 1; }
await app.close();

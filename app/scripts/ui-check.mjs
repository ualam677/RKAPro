// UI smoke check with headless Edge (playwright-core, no browser download).
//   npm run dev   (in another terminal; default http://localhost:5173)
//   node scripts/ui-check.mjs [outDir] [baseUrl]
// Drives the real app, asserts what must be on screen, writes screenshots. Exits 1 on the first failed step.
import { chromium } from "playwright-core";
import { mkdirSync } from "fs";
import path from "path";

const out = process.argv[2] ?? "ui-shots"; const base = process.argv[3] ?? "http://localhost:5173";
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
const errors = []; page.on("pageerror", (e) => errors.push(String(e))); page.on("console", (m) => { if (m.type() === "error" && !/favicon/.test(m.location().url)) errors.push(m.text() + " " + m.location().url); });
const shot = (name, full = true) => page.screenshot({ path: path.join(out, name + ".png"), fullPage: full });
const step = async (name, fn) => { try { await fn(); console.log("ok  ", name); } catch (e) { console.log("FAIL", name, "\n    ", String(e).split("\n")[0]); await shot("FAIL-" + name.replace(/\W+/g, "-")); await browser.close(); process.exit(1); } };
const only = process.env.ONLY?.split(",");
const section = async (name, fn) => { if (!only || only.includes(name)) await fn(); };

await page.goto(base);
await page.evaluate(() => { localStorage.clear(); }); await page.reload();

await section("lab", async () => {
  await step("load current list", async () => {
    await page.getByRole("button", { name: "Load my current list" }).click();
    await page.getByTestId("exact-stats").waitFor();
  });
  await step("exact stats show the verified numbers", async () => {
    const t = await page.getByTestId("exact-stats").innerText();
    for (const want of ["93.3%", "85.4%", "41.3%", "6.7%", "74.0%"]) if (!t.includes(want)) throw new Error("missing " + want);
  });
  await step("per-card value table", async () => {
    await page.getByRole("button", { name: /one copy less/ }).click();
    await page.locator("table.marginals tbody tr").first().waitFor();
    if ((await page.locator("table.marginals tbody tr").count()) < 15) throw new Error("too few rows");
  });
  await page.getByTestId("exact-stats").screenshot({ path: path.join(out, "1-lab-stats.png") });
});

if (errors.length) { console.log("PAGE ERRORS:\n" + errors.join("\n")); await browser.close(); process.exit(1); }
await browser.close();
console.log("done, screenshots in", out);

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
  await step("quick calculator: tags, pair, open-with rule", async () => {
    const q = page.getByTestId("quick-calc");
    if (!/[1-9][0-9]* starters/.test(await q.innerText())) throw new Error("no starters tagged");
    const sel = q.locator("select");
    await sel.nth(0).selectOption("Photon Orbital"); await sel.nth(1).selectOption("Galaxy Summoner");
    await q.getByRole("button", { name: "Add pair" }).click();
    await sel.nth(2).selectOption("Galaxy Soldier"); await q.getByRole("button", { name: "Add rule" }).click();
    const t = await q.innerText();
    if (!t.includes("Pair: Photon Orbital + Galaxy Summoner") || !t.includes("Open 1 to 3 × Galaxy Soldier")) throw new Error("rows missing");
  });
  await step("Normal Summon flag changes the 2-plays number, and the tag is remembered", async () => {
    const q = page.getByTestId("quick-calc");
    const two = async () => (await q.locator("tr", { hasText: "2 plays" }).innerText());
    const before = await two();
    for (const name of ["Photon Delta Wing", "Galaxy Wizard"]) await page.locator(".card", { has: page.locator(".card-name", { hasText: name }) }).first().getByLabel("Needs Normal Summon").check();
    await page.waitForTimeout(200);
    if ((await two()) === before) throw new Error("2-plays number did not move");
    const mem = await page.evaluate(() => JSON.parse(localStorage.getItem("rkapro-roles-v1") ?? "{}"));
    if (!mem["Photon Delta Wing"]?.ns) throw new Error("tag not remembered");
  });
  await page.getByTestId("quick-calc").screenshot({ path: path.join(out, "2-lab-quick.png") });
});

await section("files", async () => {
  // The native folder dialog cannot be driven headless: stand in the browser's private file system for the picked folder.
  await page.evaluate(() => { window.showDirectoryPicker = () => navigator.storage.getDirectory(); });
  const f = page.getByTestId("deck-files");
  await step("deck folder: save the current deck as .ydk, list it, import it back", async () => {
    if (!(await page.getByTestId("exact-stats").count())) await page.getByRole("button", { name: "Load my current list" }).click();
    await f.getByRole("button", { name: "Add a deck folder" }).click();
    await f.getByLabel("Deck name").fill("UI check deck");
    await f.getByRole("button", { name: "Save current deck here" }).click();
    await f.getByRole("button", { name: "UI check deck.ydk" }).click();
    await page.waitForTimeout(300);
    const t = await page.getByTestId("exact-stats").innerText();
    if (!t.includes("93.3%") || !t.includes("43 cards")) throw new Error("re-imported deck differs");
    const ydk = await page.evaluate(async () => (await (await (await navigator.storage.getDirectory()).getFileHandle("UI check deck.ydk")).getFile()).text());
    if (!ydk.startsWith("#created by") || ydk.split("\n").filter((l) => /^\d+$/.test(l)).length !== 58) throw new Error("bad .ydk: " + ydk.slice(0, 80));
  });
  await step("export buttons present", async () => {
    for (const name of ["Download .ydk", "Copy ydke://", "Copy Omega code"]) await f.getByRole("button", { name }).waitFor();
  });
  await f.screenshot({ path: path.join(out, "3-lab-files.png") });
});

if (errors.length) { console.log("PAGE ERRORS:\n" + errors.join("\n")); await browser.close(); process.exit(1); }
await browser.close();
console.log("done, screenshots in", out);

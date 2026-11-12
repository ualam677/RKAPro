// UI smoke check with headless Edge (playwright-core, no browser download).
//   npm run dev:check   (in another terminal: the dev server with a throwaway knowledge base and save folder)
//   node scripts/ui-check.mjs [outDir] [baseUrl]
// Drives the real app, asserts what must be on screen, writes screenshots. Exits 1 on the first failed step.
import { chromium } from "playwright-core";
import { mkdirSync } from "fs";
import path from "path";

const out = process.argv[2] ?? "ui-shots"; const base = process.argv[3] ?? "http://localhost:5173";
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
page.on("dialog", (d) => d.accept()); // confirm boxes (e.g. storing a weaker line)
const errors = []; page.on("pageerror", (e) => errors.push(String(e))); page.on("console", (m) => { if (m.type() === "error" && !/favicon/.test(m.location().url)) errors.push(m.text() + " " + m.location().url); });
const shot = (name, full = true) => page.screenshot({ path: path.join(out, name + ".png"), fullPage: full });
const step = async (name, fn) => { try { await fn(); console.log("ok  ", name); } catch (e) { console.log("FAIL", name, "\n    ", String(e).split("\n")[0]); await shot("FAIL-" + name.replace(/\W+/g, "-")); await browser.close(); process.exit(1); } };
const only = process.env.ONLY?.split(",");
const section = async (name, fn) => { if (!only || only.includes(name)) await fn(); };

await page.goto(base);
await page.evaluate(() => { localStorage.clear(); }); await page.reload();

const tab = (name) => page.getByRole("navigation", { name: "Sections" }).getByRole("button", { name }).click();

await section("duel", async () => {
  const ORB7 = "91714772";
  const hand = page.getByTestId("hand");
  await step("new duel with Orbital 7 forced into the opening hand", async () => {
    await tab("Duel");
    const setup = page.getByRole("dialog", { name: "New duel" });
    await page.waitForTimeout(800);
    if (!(await setup.count())) await page.getByRole("button", { name: "New duel…" }).click(); // a duel is already running on the engine
    await setup.waitFor();
    await setup.getByRole("button", { name: "My current list" }).click();
    await setup.getByRole("button", { name: "Galaxy Defense Robot Orbital 7" }).click();
    await setup.getByRole("button", { name: "Start duel" }).click();
    await page.locator(".turn", { hasText: "Turn 1 · your turn · summons 0" }).waitFor(); // the new duel, not the one that was on screen before
    await hand.locator(`.dcard[data-code="${ORB7}"].can-act`).first().waitFor();
    if ((await hand.locator(".dcard").count()) !== 5) throw new Error("hand is not 5 cards");
  });
  await page.waitForTimeout(800);
  await shot("5-duel-start", false);

  const hint = page.getByTestId("hint"), chat = page.getByTestId("chat"), prompt = page.getByTestId("prompt");
  const idle = async () => (await hint.innerText()).includes("click a glowing card");
  // answer whatever the engine asks with the first offered choice, until the main phase is back
  const resolve = async () => {
    for (let i = 0; i < 25; i++) {
      await page.waitForTimeout(120);
      if (await idle()) return;
      if (await page.locator(".zone.free").count()) { await page.locator(".zone.free").first().click(); continue; }
      if (!(await prompt.count())) continue;
      const first = prompt.locator(".pick, .opts button").first();
      if (await first.count()) { await first.click(); const ok = prompt.getByRole("button", { name: "Confirm" }); if (await ok.count() && await ok.isEnabled()) await ok.click(); }
      else await prompt.getByRole("button", { name: /^(Yes|Done)$/ }).first().click();
    }
    throw new Error("prompts did not resolve; hint: " + (await hint.innerText()));
  };
  const useCard = async (card, verb) => { await card.click(); await page.getByRole("menu").getByRole("menuitem", { name: verb }).first().click(); await resolve(); };

  await step("hovering a card shows its picture and text on the left", async () => {
    await hand.locator(`.dcard[data-code="${ORB7}"]`).first().hover();
    const t = await page.getByTestId("card-detail").innerText();
    if (!t.includes("Galaxy Defense Robot Orbital 7") || !t.includes("Tribute this card")) throw new Error("detail: " + t.slice(0, 120));
  });
  await step("click a card, pick Activate, answer the selection windows", async () => {
    await useCard(hand.locator(`.dcard[data-code="${ORB7}"]`).first(), /^Activate/);
    const log = await chat.innerText();
    if (!log.includes("Chain 1: Galaxy Defense Robot Orbital 7") || !log.includes("Hand → GY")) throw new Error("chat: " + log.slice(-200));
  });
  let savedLog = "";
  await step("quick save, play on (Normal Summon into a clicked zone), undo, quick load", async () => {
    const savesBtn = page.getByRole("button", { name: /^Save states/ });
    const n0 = Number((await savesBtn.innerText()).match(/[0-9]+/)[0]);
    await page.getByRole("button", { name: "Quick save" }).click();
    await page.getByRole("button", { name: `Save states (${n0 + 1})` }).waitFor();
    savedLog = await chat.innerText();
    await hand.locator(".dcard.can-act").first().click();
    const menu = page.getByRole("menu");
    await menu.getByRole("menuitem").first().click(); await resolve();
    const after = await chat.innerText();
    if (after === savedLog) throw new Error("nothing happened after the save");
    await page.getByRole("button", { name: "Undo" }).click(); await page.waitForTimeout(300);
    await page.getByRole("button", { name: "Quick load" }).click(); await page.waitForTimeout(300);
    if ((await chat.innerText()) !== savedLog) throw new Error("quick load did not return to the saved point");
  });
  await shot("6-duel-midturn", false);
  await step("branch: play a different card from the save, save again, tree shows the branch", async () => {
    await hand.locator(".dcard.can-act").last().click();
    await page.getByRole("menu").getByRole("menuitem").first().click(); await resolve();
    await page.getByRole("button", { name: /^Save states/ }).click();
    const dlg = page.getByRole("dialog", { name: "Save states" });
    const branch = `Branch ${Date.now().toString(36)}`; // unique per run: the save folder keeps earlier runs
    await dlg.getByLabel("Save name").fill(branch); await dlg.getByRole("button", { name: "Save here" }).click();
    await dlg.locator(".save-row", { hasText: `↳ ${branch}` }).waitFor();
    await dlg.screenshot({ path: path.join(out, "7-duel-saves.png") });
    await dlg.getByRole("button", { name: "Close" }).click();
  });
  await step("a note is kept in the chat", async () => {
    await chat.getByLabel("Note").fill("ui-check note"); await chat.getByLabel("Note").press("Enter");
    await chat.getByText("ui-check note").waitFor();
  });
  await step("End Phase button ends the turn; the opponent passes; turn 3 is yours", async () => {
    await page.locator(".phase.go", { hasText: "EP" }).click();
    await page.locator(".turn", { hasText: "Turn 3" }).waitFor({ timeout: 8000 });
    if (!(await idle())) await resolve();
  });
  await step("hotkeys: U undoes, Escape closes windows", async () => {
    const before = await chat.innerText();
    await page.keyboard.press("u"); await page.waitForTimeout(400);
    if ((await chat.innerText()) === before) throw new Error("U did not undo");
    await page.getByRole("button", { name: "New duel…" }).click(); await page.getByRole("dialog", { name: "New duel" }).waitFor();
    await page.keyboard.press("Escape"); await page.waitForTimeout(200);
    if (await page.getByRole("dialog", { name: "New duel" }).count()) throw new Error("Escape did not close the window");
  });
  await step("hand size 7 without shuffling deals the first 7 cards of the list", async () => {
    await page.getByRole("button", { name: "New duel…" }).click();
    const setup = page.getByRole("dialog", { name: "New duel" });
    await setup.getByLabel("Hand size").fill("7"); await setup.getByLabel("Shuffle deck").uncheck();
    await setup.getByRole("button", { name: "Start duel" }).click();
    await hand.locator(".dcard").nth(6).waitFor();
    const codes = await hand.locator(".dcard").evaluateAll((els) => els.map((e) => e.dataset.code));
    if (codes.length !== 7 || new Set(codes.slice(0, 3)).size !== 1) throw new Error("not the top of the list: " + codes.join(","));
    await page.getByRole("button", { name: "New duel…" }).click(); // put the defaults back for the next run
    await setup.getByLabel("Hand size").fill("5"); await setup.getByLabel("Shuffle deck").check();
    await setup.getByRole("button", { name: "Start duel" }).click(); await hand.locator(".dcard").nth(4).waitFor();
  });
  await step("That's wrong: a report is saved as a case; a role chip sticks", async () => {
    await hand.locator(".dcard").first().hover();
    const chip = page.getByTestId("card-detail").getByRole("button", { name: "Extender" });
    await chip.click(); await page.getByTestId("card-detail").locator(".chip.on", { hasText: "Extender" }).waitFor();
    await chip.click(); // and off again
    await page.getByRole("button", { name: "That's wrong" }).click();
    const dlg = page.getByRole("dialog", { name: "That's wrong" });
    await dlg.getByLabel("What is wrong, in your words").fill("ui-check: test report");
    await dlg.getByRole("button", { name: "Save report" }).click();
    await dlg.getByText(/Saved as case/).waitFor();
    await dlg.getByRole("button", { name: "Close" }).first().click();
  });
});

await section("drill", async () => {
  const hand = page.getByTestId("hand"), review = page.getByTestId("review");
  await step("drill: deal a hand, end the turn, get a review with several numbers", async () => {
    await tab("Drill");
    // deal until the hand has a starter with a stored line (Orbital 7), so the review has a line to compare with
    for (let tries = 0; tries < 40; tries++) {
      await page.getByRole("button", { name: "Deal a drill hand" }).first().click();
      await hand.locator(".dcard").nth(4).waitFor(); await page.waitForTimeout(150);
      if (await hand.locator('.dcard[data-code="91714772"]').count()) break;
      if (tries === 39) throw new Error("no Orbital 7 hand in 40 deals");
    }
    for (let i = 0; i < 6 && !(await page.locator(".phase.go", { hasText: "EP" }).count()); i++) { await page.keyboard.press("Escape"); await page.waitForTimeout(250); }
    await page.locator(".phase.go", { hasText: "EP" }).click();
    await review.waitFor({ timeout: 10000 });
    const t = await review.innerText();
    for (const want of ["Board (interruptions)", "Nibiru-proof", "Hand traps still in hand", "Your results so far", "Exact odds for this deck"]) if (!t.includes(want)) throw new Error("review lacks: " + want);
    if (!(await page.getByTestId("verdict").innerText()).length) throw new Error("no verdict");
  });
  await step("review asks why only at the deviation; storing my line changes what the class expects", async () => {
    const dev = page.getByTestId("deviation");
    if (await dev.count()) {
      await dev.getByLabel("Why").fill("ui-check: ended the turn on purpose");
      await dev.getByRole("button", { name: "Save my answer" }).click();
      await review.getByText("Saved as a case.").waitFor();
      await dev.getByRole("button", { name: "My line is right: store it" }).click();
      await review.getByText(/from now on .* expects board 0/).waitFor();
      if (!/Matched/.test(await page.getByTestId("verdict").innerText())) throw new Error("verdict did not change after the correction");
    } else {
      // an earlier run of this check already stored "end the turn at once" as the Orbital 7 line in the throwaway knowledge base
      if (!/Matched/.test(await page.getByTestId("verdict").innerText()) || !(await review.innerText()).includes("(user)")) throw new Error("no deviation, and not because of a stored user line");
      console.log("     (a user line from an earlier run is already stored: no deviation, verdict matched)");
    }
  });
  await review.screenshot({ path: path.join(out, "10-drill-review.png") });
  await step("next hand deals again", async () => {
    await review.getByRole("button", { name: "Next hand" }).click();
    await hand.locator(".dcard").nth(4).waitFor(); if (await review.count()) throw new Error("review still open");
  });
});

await section("editor", async () => {
  const main = page.getByTestId("ed-main"), extra = page.getByTestId("ed-extra"), side = page.getByTestId("ed-side"), results = page.getByTestId("ed-results");
  const count = async (z) => Number((await z.locator(".ed-zone-title b").innerText()).trim());
  await step("deck editor: search, add to Main / Extra / Side, remove, card text", async () => {
    await tab("Deck editor");
    await page.getByLabel("Search").fill("galaxy-eyes photon dragon");
    await results.locator(".ed-result", { hasText: "Galaxy-Eyes Photon Dragon" }).first().waitFor();
    const m0 = await count(main), s0 = await count(side), e0 = await count(extra);
    const row = results.locator(".ed-result").filter({ has: page.locator("b", { hasText: /^Galaxy-Eyes Photon Dragon$/ }) }).first();
    await row.hover();
    if (!(await page.getByTestId("ed-detail").innerText()).includes("Galaxy-Eyes Photon Dragon")) throw new Error("no card text");
    await row.click(); await row.click({ button: "right" });
    if ((await count(main)) !== m0 + 1 || (await count(side)) !== s0 + 1) throw new Error("add to Main/Side failed");
    await page.getByLabel("Search").fill("number 62"); await page.getByLabel("Card type").selectOption("extra");
    await results.locator(".ed-result").first().click();
    if ((await count(extra)) !== e0 + 1) throw new Error("Extra Deck card did not go to the Extra Deck");
    await side.locator(".ecard").last().click();
    if ((await count(side)) !== s0) throw new Error("remove failed");
  });
  await step("deck editor: 3-copy limit, and the deck reaches the duel", async () => {
    await page.getByLabel("Card type").selectOption(""); await page.getByLabel("Search").fill("ash blossom");
    const row = results.locator(".ed-result").first();
    for (let i = 0; i < 4; i++) await row.click();
    await page.getByRole("status").filter({ hasText: /Already 3 copies/ }).waitFor();
    await page.screenshot({ path: path.join(out, "11-deck-editor.png") });
    await tab("Duel"); await page.getByRole("button", { name: "New duel…" }).click();
    await page.getByRole("dialog", { name: "New duel" }).getByRole("button", { name: "Deck lab deck" }).waitFor();
    await page.keyboard.press("Escape");
  });
});

await section("lab", async () => {
  await tab("Deck lab");
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

await section("history", async () => {
  const hist = page.getByTestId("history");
  await step("an edit becomes a version with its change in odds; restore brings the old list back", async () => {
    if (!(await page.getByTestId("exact-stats").count())) await page.getByRole("button", { name: "Load my current list" }).click();
    await hist.waitFor({ timeout: 5000 });
    await page.locator(".card", { has: page.locator(".card-name", { hasText: "Galaxy War Drake" }) }).first().getByRole("button", { name: "more" }).click();
    await hist.locator("tr", { hasText: "+1 Galaxy War Drake" }).waitFor({ timeout: 5000 });
    const row = await hist.locator("tr", { hasText: "+1 Galaxy War Drake" }).innerText();
    if (!/[+-]\d\.\d/.test(row)) throw new Error("no change in odds shown: " + row);
    await hist.getByRole("button", { name: "Restore" }).first().click();
    await page.waitForTimeout(1600);
    const t = await page.getByTestId("exact-stats").innerText();
    if (!t.includes("43 cards") || !t.includes("93.3%")) throw new Error("restore did not bring the list back");
  });
  await hist.screenshot({ path: path.join(out, "4-lab-history.png") });
});

if (errors.length) { console.log("PAGE ERRORS:\n" + errors.join("\n")); await browser.close(); process.exit(1); }
await browser.close();
console.log("done, screenshots in", out);

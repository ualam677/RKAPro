// Local duel server: the engine runs here (Node), the UI talks to it over HTTP on localhost.
//   node server.mjs [port]        (default 7911; the Vite dev server proxies /api to it, Electron starts it in-process)
// One duel at a time (one wasm heap). Reuses the user's EDOPro install when present: pictures, strings, deck folder.
import http from "node:http";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, existsSync, readdirSync, writeFileSync, mkdirSync, unlinkSync } from "fs";
import { fileURLToPath, pathToFileURL } from "url";
import path from "path";
import { cards, names, errors } from "./engine.mjs";
import { setStrings } from "../packages/engine/client.mjs";
import { createSession, loadSession } from "../packages/engine/session.mjs";
import { shuffled } from "../packages/engine/api.mjs";

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const CDB_DIR = process.env.YGO_CDB_DIR ?? here("./data/babel");
const EDOPRO = process.env.EDOPRO_DIR ?? (existsSync("C:/ProjectIgnis") ? "C:/ProjectIgnis" : null);
const SAVES = process.env.RKAPRO_SAVES ?? here("../saves");
const PIC_CACHE = here("./data/pics");
const PIC_URL = "https://pics.projectignis.org:2096/pics/"; // EDOPro's own picture host; pictures are fetched on demand, never bundled
const DIST = here("../app/dist/index.html");

// ---------- card texts and strings ----------
const texts = new Map(); // id -> { desc, strs[] }
for (const f of ["cards.cdb", ...readdirSync(CDB_DIR).filter((f) => /release-.*\.cdb$/.test(f) && !/rush/.test(f)).sort()]) {
  const db = new DatabaseSync(path.join(CDB_DIR, f));
  for (const r of db.prepare("select * from texts").all()) if (!texts.has(r.id)) texts.set(r.id, { desc: r.desc, strs: Array.from({ length: 16 }, (_, i) => r[`str${i + 1}`] ?? "") });
  db.close();
}
const system = new Map();
const stringsFile = EDOPRO && path.join(EDOPRO, "config/strings.conf");
if (stringsFile && existsSync(stringsFile)) for (const l of readFileSync(stringsFile, "utf8").split(/\r?\n/)) { const m = /^!system (\d+) (.*)$/.exec(l); if (m) system.set(Number(m[1]), m[2]); }
const aliasOf = (id) => cards.get(id)?.alias || id;
setStrings({ system: (n) => system.get(n) ?? null, card: (code, i) => texts.get(code)?.strs[i] || texts.get(aliasOf(code))?.strs[i] || null });

const cardInfo = (id) => {
  const c = cards.get(id); if (!c) return { id, name: `#${id}`, desc: "", type: 0 };
  return { id, name: names.get(id), desc: texts.get(id)?.desc ?? "", type: c.type, atk: c.attack, def: c.defense, level: c.level, attribute: c.attribute, race: Number(c.race), link: c.link_marker ? 1 : 0 };
};
/** Alt-art passcodes (Omega, some .ydk files) -> the passcode the engine knows. */
const canonical = (id) => { if (cards.has(id)) return cards.get(id).alias && cards.has(cards.get(id).alias) && Math.abs(cards.get(id).alias - id) < 20 ? cards.get(id).alias : id; for (let d = 1; d <= 10; d++) if (cards.has(id - d)) return id - d; return id; };

// ---------- the duel ----------
let session = null, currentSave = null;
const FILLER = [...names].find(([, n]) => n === "Dark Magician")[0];
function newDuel({ main, extra = [], seed = Date.now() % 2147483647, hand = [], handSize = 5 }) {
  const m = main.map(canonical), unknown = [...m, ...extra.map(canonical)].filter((c) => !cards.has(c));
  if (unknown.length) throw new Error(`Cards the engine does not know: ${[...new Set(unknown)].join(", ")}. Run node sim/tools/update-data.mjs.`);
  if (m.length < handSize) throw new Error("The Main Deck is smaller than the opening hand");
  const rest = shuffled(m, seed); const top = [];
  for (const c of hand.map(canonical)) { const i = rest.indexOf(c); if (i < 0) throw new Error(`${names.get(c) ?? c} is not in the Main Deck (or not that many copies)`); top.push(rest.splice(i, 1)[0]); }
  session?.destroy(); errors.length = 0;
  session = createSession({ deck0: [...top, ...rest], extra0: extra.map(canonical), deck1: Array(40).fill(FILLER), extra1: [], hand0: handSize, hand1: 5, seed }, session?.settings);
  currentSave = null;
}

// ---------- save states (files, so they survive restarts and can be shared) ----------
const saveFile = (id) => path.join(SAVES, `${id}.json`);
const listSaves = () => (existsSync(SAVES) ? readdirSync(SAVES).filter((f) => f.endsWith(".json")).map((f) => { const { log: _l, ...meta } = JSON.parse(readFileSync(path.join(SAVES, f), "utf8")); return meta; }).sort((a, b) => a.created - b.created) : []);
function save(name) {
  const v = session.view(); mkdirSync(SAVES, { recursive: true });
  const id = `${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
  const meta = { id, name: name || `Turn ${v.turn}, ${v.decisions} decisions`, parent: currentSave, created: Date.now(), turn: v.turn, decisions: v.decisions, steps: v.steps };
  writeFileSync(saveFile(id), JSON.stringify({ ...meta, log: JSON.parse(session.save()) }));
  currentSave = id; return meta;
}
function load(id) {
  const f = JSON.parse(readFileSync(saveFile(id), "utf8"));
  const settings = session?.settings; session?.destroy();
  session = loadSession(JSON.stringify(f.log), settings); currentSave = id;
}

// ---------- http ----------
const state = () => (session ? { ...session.view(), save: currentSave, engineErrors: errors.slice(-3) } : { none: true });
const body = (req) => new Promise((ok, bad) => { let s = ""; req.on("data", (d) => { s += d; if (s.length > 5e6) req.destroy(); }); req.on("end", () => { try { ok(s ? JSON.parse(s) : {}); } catch (e) { bad(e); } }); });
const need = () => { if (!session) throw new Error("No duel yet"); return session; };
const routes = {
  "GET /api/meta": () => ({ edopro: EDOPRO, cards: cards.size, saves: SAVES }),
  "GET /api/duel": () => state(),
  "POST /api/duel/new": (q) => { newDuel(q); return state(); },
  "POST /api/duel/act": (q) => { need().act(q); return state(); },
  "POST /api/duel/undo": (q) => { need().undo(q.n ?? 1); return state(); },
  "POST /api/duel/settings": (q) => { need().setSettings(q); return state(); },
  "POST /api/duel/note": (q) => { need().note(q.text); return state(); },
  "GET /api/saves": () => ({ saves: listSaves(), current: currentSave }),
  "POST /api/saves": (q) => { need(); const meta = save(q.name); return { saved: meta, saves: listSaves(), current: currentSave }; },
  "POST /api/saves/load": (q) => { load(q.id); return state(); },
  "POST /api/saves/delete": (q) => { if (/^[a-z0-9]+$/.test(q.id) && existsSync(saveFile(q.id))) unlinkSync(saveFile(q.id)); if (currentSave === q.id) currentSave = null; return { saves: listSaves(), current: currentSave }; },
  "POST /api/cards": (q) => ({ cards: (q.ids ?? []).slice(0, 500).map((id) => cardInfo(Number(id))) }),
  "GET /api/decks": () => ({ folder: EDOPRO && path.join(EDOPRO, "deck"), decks: EDOPRO && existsSync(path.join(EDOPRO, "deck")) ? readdirSync(path.join(EDOPRO, "deck")).filter((f) => /\.ydk$/i.test(f)).sort((a, b) => a.localeCompare(b)) : [] }),
  "POST /api/decks/read": (q) => { const f = path.basename(String(q.name)); if (!/\.ydk$/i.test(f)) throw new Error("Not a .ydk file"); return { name: f, text: readFileSync(path.join(EDOPRO, "deck", f), "utf8") }; },
};

async function picture(id, res) {
  const local = [EDOPRO && path.join(EDOPRO, "pics", `${id}.jpg`), path.join(PIC_CACHE, `${id}.jpg`)].find((p) => p && existsSync(p));
  let buf = local ? readFileSync(local) : null;
  if (!buf) { // not on disk: fetch once from EDOPro's picture host and keep it in sim/data/pics (git-ignored)
    try { const r = await fetch(`${PIC_URL}${id}.jpg`, { signal: AbortSignal.timeout(8000) }); if (r.ok) { buf = Buffer.from(await r.arrayBuffer()); mkdirSync(PIC_CACHE, { recursive: true }); writeFileSync(path.join(PIC_CACHE, `${id}.jpg`), buf); } } catch { /* offline: the UI draws the card itself */ }
  }
  if (!buf) { res.writeHead(404).end(); return; }
  res.writeHead(200, { "content-type": "image/jpeg", "cache-control": "max-age=86400" }).end(buf);
}

export function start(port = 7911) {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://x");
    try {
      const pic = /^\/api\/pic\/(\d+)$/.exec(url.pathname);
      if (pic) return await picture(Number(canonical(Number(pic[1]))), res);
      const tex = /^\/api\/texture\/([a-z0-9-]+\.(png|jpg))$/.exec(url.pathname); // EDOPro's own card back etc., from the user's install
      if (tex) { const f = EDOPRO && path.join(EDOPRO, "textures", tex[1]); if (!f || !existsSync(f)) return res.writeHead(404).end(); return res.writeHead(200, { "content-type": tex[2] === "png" ? "image/png" : "image/jpeg", "cache-control": "max-age=86400" }).end(readFileSync(f)); }
      const h = routes[`${req.method} ${url.pathname}`];
      if (h) { const out = await h(req.method === "POST" ? await body(req) : {}); return res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(out, (_, v) => (typeof v === "bigint" ? Number(v) : v))); }
      if (req.method === "GET" && !url.pathname.startsWith("/api/") && existsSync(DIST)) return res.writeHead(200, { "content-type": "text/html" }).end(readFileSync(DIST));
      res.writeHead(404, { "content-type": "application/json" }).end(JSON.stringify({ error: "Not found" }));
    } catch (e) {
      res.writeHead(400, { "content-type": "application/json" }).end(JSON.stringify({ error: e.message, ...(session ? { state: state() } : {}) }));
    }
  });
  return new Promise((ok, bad) => { server.once("error", bad); server.listen(port, "127.0.0.1", () => ok(server)); }); // rejects when the port is taken
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const server = await start(Number(process.argv[2] ?? 7911));
  console.log(`RKAPro duel server on http://127.0.0.1:${server.address().port}  (EDOPro: ${EDOPRO ?? "not found"}; ${cards.size} cards)`);
}

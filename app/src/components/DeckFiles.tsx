import { useEffect, useState } from "react";
import { get, set } from "idb-keyval";
import { Deck } from "../lib/deck/types";
import { toYdk } from "../lib/deck/ydk";
import { toYdke } from "../lib/deck/ydke";
import { toOmega } from "../lib/deck/omega";

// Deck folders use the browser's File System Access API (Chromium, so Edge and Electron): the app reads and writes
// .ydk files in folders you pick, e.g. EDOPro's deck folder (several installs = several folders) or a Drive-synced folder.
// The folder handles are kept in IndexedDB; the browser asks for permission again after a restart.
/* eslint-disable @typescript-eslint/no-explicit-any */
type Dir = FileSystemDirectoryHandle;
const FOLDERS_KEY = "rkapro-deck-folders";
const supported = typeof window !== "undefined" && "showDirectoryPicker" in window;

async function allowed(dir: Dir, write: boolean): Promise<boolean> {
  const opts = { mode: write ? "readwrite" : "read" }; const d = dir as any;
  if (!d.queryPermission) return true; // origin-private folders have no permission prompt
  return (await d.queryPermission(opts)) === "granted" || (await d.requestPermission(opts)) === "granted";
}
export async function listYdk(dir: Dir): Promise<string[]> {
  const out: string[] = [];
  for await (const [name, h] of (dir as any).entries()) if (h.kind === "file" && /\.ydk$/i.test(name)) out.push(name);
  return out.sort((a, b) => a.localeCompare(b));
}
export const readYdk = async (dir: Dir, name: string) => (await (await dir.getFileHandle(name)).getFile()).text();
export async function writeYdk(dir: Dir, name: string, text: string) {
  const w = await (await dir.getFileHandle(name, { create: true })).createWritable();
  await w.write(text); await w.close();
}

export function DeckFiles({ deck, onImport }: { deck: Deck | null; onImport: (text: string, fileName: string) => void }) {
  const [folders, setFolders] = useState<Dir[]>([]);
  const [files, setFiles] = useState<Record<string, string[] | null>>({}); // folder name -> files (null = needs permission)
  const [name, setName] = useState("Galaxy-Eyes");
  const [msg, setMsg] = useState("");
  const say = (m: string) => { setMsg(m); setTimeout(() => setMsg(""), 3000); };

  useEffect(() => { if (supported) get<Dir[]>(FOLDERS_KEY).then((f) => f && setFolders(f)).catch(() => {}); }, []);
  async function refresh(dir: Dir, ask: boolean) {
    const d = dir as any;
    const ok = ask ? await allowed(dir, false) : !d.queryPermission || (await d.queryPermission({ mode: "read" })) === "granted";
    setFiles((f) => ({ ...f, [dir.name]: null }));
    if (ok) { const list = await listYdk(dir); setFiles((f) => ({ ...f, [dir.name]: list })); }
  }
  useEffect(() => { folders.forEach((d) => { refresh(d, false).catch(() => {}); }); }, [folders]);

  async function addFolder() {
    try {
      const dir: Dir = await (window as any).showDirectoryPicker({ mode: "readwrite" });
      const next = [...folders.filter((f) => f.name !== dir.name), dir];
      setFolders(next); await set(FOLDERS_KEY, next).catch(() => {}); // some handles cannot be stored; the list still works this session
    } catch { /* picker cancelled */ }
  }
  async function removeFolder(dir: Dir) { const next = folders.filter((f) => f !== dir); setFolders(next); await set(FOLDERS_KEY, next).catch(() => {}); }
  async function save(dir: Dir) {
    if (!deck || !(await allowed(dir, true))) return;
    const file = `${name.replace(/[\\/:*?"<>|]/g, "").trim() || "deck"}.ydk`;
    await writeYdk(dir, file, toYdk(deck)); await refresh(dir, false); say(`Saved ${file} to ${dir.name}`);
  }
  const copy = async (text: string, what: string) => { try { await navigator.clipboard.writeText(text); say(`${what} copied`); } catch { say("Copy was blocked by the browser"); } };
  function download() {
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([toYdk(deck!)], { type: "text/plain" }));
    a.download = `${name || "deck"}.ydk`; a.click(); URL.revokeObjectURL(a.href);
  }

  return (
    <section className="panel" data-testid="deck-files">
      <h2>Deck files <span className="muted">· export and deck folders</span></h2>
      {deck && (
        <div className="row">
          <input className="text" aria-label="Deck name" value={name} onChange={(e) => setName(e.target.value)} />
          <button className="ghost" onClick={download}>Download .ydk</button>
          <button className="ghost" onClick={() => copy(toYdke(deck), "ydke:// link")}>Copy ydke://</button>
          <button className="ghost" onClick={() => copy(toOmega(deck), "Omega code")}>Copy Omega code</button>
          {msg && <span className="muted small" role="status">{msg}</span>}
        </div>
      )}
      {!supported ? <p className="muted small">Deck folders need Edge, Chrome or the desktop app. Import and export above work everywhere.</p> : (
        <>
          <div className="row">
            <button className="ghost" onClick={addFolder}>Add a deck folder</button>
            <span className="muted small">Pick EDOPro's <b>deck</b> folder (add one per install), or a folder that Google Drive keeps in sync.</span>
          </div>
          {folders.map((dir) => (
            <div key={dir.name} className="folder">
              <div className="row">
                <b>{dir.name}</b>
                {files[dir.name] === null && <button className="link" onClick={() => refresh(dir, true)}>Allow access to list decks</button>}
                {deck && <button className="link" onClick={() => save(dir)}>Save current deck here</button>}
                <button className="x" aria-label={`Remove folder ${dir.name}`} onClick={() => removeFolder(dir)}>×</button>
              </div>
              <div className="chips">
                {(files[dir.name] ?? []).map((f) => <button key={f} className="chip" onClick={async () => onImport(await readYdk(dir, f), f)}>{f}</button>)}
                {files[dir.name]?.length === 0 && <span className="muted small">No .ydk files here yet.</span>}
              </div>
            </div>
          ))}
        </>
      )}
    </section>
  );
}

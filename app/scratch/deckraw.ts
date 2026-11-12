import { readFileSync } from "fs";
import { inflateSync } from "fflate";
import { base64ToBytes } from "../src/lib/deck/base64";
import { parseOmegaReplay } from "../src/lib/replay/omega";
for (const f of process.argv.slice(2)) {
  const r = parseOmegaReplay(readFileSync(f, "utf8"));
  const raw = inflateSync(base64ToBytes(r.deckCode!.trim()));
  console.log(f, "len", raw.length, "hdr", raw[0], raw[1], "expected", 2 + 4 * (raw[0] + raw[1]), "keys", Object.keys(r.settings).length);
}

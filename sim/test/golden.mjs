// Golden tests: the recorded lines replayed through the library API (packages/engine/api.mjs) from their action logs.
// Checks: same end board as scripts/verify.sh, the replay's own summon order, determinism, snapshot/restore.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "fs";

export async function golden(routes) {
  const { replay, logToJSON, logFromJSON } = await import("../../packages/engine/api.mjs");
  const { scoreBoard, describeBoard, stateKey } = await import("../board.mjs");
  const { events } = await import("../tools/follow2.mjs");
  const L = JSON.parse(readFileSync(new URL("../../replays/learned.json", import.meta.url), "utf8"));
  for (const ri of routes) {
    const g = JSON.parse(readFileSync(new URL(`../../packs/galaxy-eyes/golden/${ri}.json`, import.meta.url), "utf8"));
    test(`${g.file}: action log reproduces the recorded line`, () => {
      const log = logFromJSON(JSON.stringify(g.log));
      const d = replay(log);
      const side = d.side(0);
      assert.deepEqual({ board: scoreBoard(side).value, ...describeBoard(side) }, g.expect);
      // independent of the fixture: the summons are exactly the ones in the user's replay, in order
      const want = L[ri].events.filter((e) => e.kind === "summon").map((e) => e.name);
      assert.deepEqual(events(d.messages).filter((e) => e.kind === "summon").map((e) => e.name), want);
      const key = stateKey(side);
      // snapshot / restore: go back to the middle, replay the tail, land on the same state
      const half = log.responses.length >> 1;
      d.destroy();
      const d2 = replay(log, half); const snap = d2.snapshot();
      for (const r of log.responses.slice(half)) d2.respond(r);
      assert.equal(stateKey(d2.side(0)), key, "deterministic replay");
      d2.restore(snap); assert.equal(d2.responses.length, half);
      for (const r of log.responses.slice(half)) d2.respond(r);
      assert.equal(stateKey(d2.side(0)), key, "restore then replay");
      assert.equal(logToJSON(d2.actionLog()), logToJSON(log), "action log round-trips");
      d2.destroy();
    });
  }
}

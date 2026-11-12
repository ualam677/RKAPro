// Drill grading and the knowledge base: the user's own recorded lines must grade as "matched" against the stored
// lines built from them, a do-nothing turn must grade "below" with the first deviation named, and a correction
// (promoting your line) must change what the next drill of that hand class expects.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, cpSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { fileURLToPath } from "url";
import "../engine.mjs";
import { logFromJSON } from "../../packages/engine/api.mjs";
import { createSession, loadSession } from "../../packages/engine/session.mjs";
import { knowledge, grade, promote, expectation, compareSteps, summary } from "../drill.mjs";

const packKb = fileURLToPath(new URL("../../packs/galaxy-eyes/knowledge", import.meta.url));
const freshKb = () => { const dir = mkdtempSync(path.join(tmpdir(), "rkapro-kb-")); cpSync(path.join(packKb, "lines"), path.join(dir, "lines"), { recursive: true }); return knowledge(dir); };
const golden = (i) => JSON.parse(readFileSync(new URL(`../../packs/galaxy-eyes/golden/${i}.json`, import.meta.url), "utf8"));
const asSave = (g) => JSON.stringify({ ...g.log, manual: [], notes: [] });

for (const [route, cls, nib] of [[1, "Orbital 7", true], [4, "Infinity Dragon", true], [0, "Delta Wing", false]]) {
  test(`recorded line ${golden(route).file} grades as matched against its stored line`, () => {
    const s = loadSession(asSave(golden(route)));
    const g = grade(freshKb(), s.duel);
    assert.equal(g.class, cls);
    assert.equal(g.board.yours, golden(route).expect.board); assert.equal(g.board.stored, g.board.yours);
    assert.equal(g.nibiru.yours, nib, g.nibiru.why); assert.equal(g.nibiru.stored, nib);
    assert.equal(g.verdict, "matched");
    assert.equal(g.line.deviation, null, "no deviation from the stored steps");
    assert.equal(g.line.followed, g.line.total);
    s.destroy();
  });
}

test("a do-nothing turn grades below, names the first deviation, and a correction changes the next expectation", () => {
  const kb = freshKb(); const cfg = logFromJSON(JSON.stringify(golden(1).log)).config;
  const s = createSession(cfg);
  s.act({ id: s.view().prompt.phases.find((p) => /End/.test(p.label)).id }); // end the turn at once
  const g = grade(kb, s.duel);
  assert.equal(g.verdict, "below"); assert.equal(g.board.yours, 0); assert.equal(g.board.stored, 4.25);
  assert.deepEqual(g.line.deviation, { at: 0, stored: { k: "activate", name: "Galaxy Defense Robot Orbital 7" }, yours: null });
  assert.equal(g.line.followed, 0);
  // correction: "my line is right" -> it becomes the stored line of the class
  const before = expectation(kb, g.hand);
  promote(kb, s.duel, g);
  const after = expectation(kb, g.hand);
  assert.equal(before.board, 4.25); assert.equal(after.board, 0); assert.equal(after.source, "user"); assert.deepEqual(after.steps, []);
  assert.equal(grade(kb, s.duel).verdict, "matched", "the same play now matches what the drill expects");
  // a case keeps the whole position
  const c = kb.saveCase({ kind: "deviation", text: "testing", hand: g.hand, class: g.class, log: JSON.parse(s.save()) });
  assert.equal(kb.cases()[0].id, c.id); assert.equal(kb.cases()[0].log, undefined);
  s.destroy();
});

test("step comparison and the results summary", () => {
  const S = (...n) => n.map((x) => ({ k: "summon", name: x }));
  assert.deepEqual(compareSteps(S("a", "b", "c"), S("a", "x", "c")), { followed: 2, total: 3, yours: 3, deviation: { at: 1, stored: { k: "summon", name: "b" }, yours: { k: "summon", name: "x" } } });
  assert.equal(compareSteps(S("a", "b"), S("a", "b")).deviation, null);
  const sum = summary([{ full: true, nib: true, board: 4, verdict: "matched", class: "X" }, { full: false, nib: false, board: 0, verdict: "below", class: "X" },
    { full: true, nib: false, board: 4, verdict: "better", class: null, hand: ["h"] }, { full: false, nib: false, board: 0, verdict: "expected brick", class: null }], null);
  assert.equal(sum.drills, 4); assert.equal(sum.fullBoard.yours, 0.5); assert.equal(sum.nibiruProof.yours, 0.25); assert.equal(sum.brick.yours, 0.5);
  assert.deepEqual(sum.modelMissed, [{ hand: ["h"], board: 4 }]);
});

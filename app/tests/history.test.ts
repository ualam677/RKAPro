import { describe, expect, it } from "vitest";
import { describeChange, pushVersion, Version } from "../src/lib/history";

const nameOf = (id: number) => ({ 1: "Wizard", 2: "Thrasher", 3: "Ash" })[id] ?? `#${id}`;
const v = (main: Record<number, number>, t = 1) => ({ t, main, extra: [], side: [], stats: { brick: 0.1 } });

describe("deck version history", () => {
  it("describes a change as +/- copies by card name", () => {
    expect(describeChange(null, { 1: 2, 3: 3 }, nameOf)).toBe("Imported (5 cards)");
    expect(describeChange({ 1: 1, 2: 1, 3: 3 }, { 1: 2, 2: 0, 3: 3 }, nameOf)).toBe("+1 Wizard, −1 Thrasher");
  });

  it("skips a version whose Main Deck did not change, and treats 0 copies as absent", () => {
    let h: Version[] = pushVersion([], v({ 1: 1, 2: 1 }), nameOf);
    h = pushVersion(h, v({ 1: 1, 2: 1, 3: 0 }, 2), nameOf);
    expect(h).toHaveLength(1);
    h = pushVersion(h, v({ 1: 2, 2: 0 }, 3), nameOf);
    expect(h.map((x) => x.note)).toEqual(["Imported (2 cards)", "+1 Wizard, −1 Thrasher"]);
    expect(h[1].main).toEqual({ 1: 2 });
  });

  it("a fresh import is labelled as an import, not as a diff", () => {
    const h = pushVersion(pushVersion([], v({ 1: 1 }), nameOf), v({ 3: 3 }, 2), nameOf, true);
    expect(h[1].note).toBe("Imported (3 cards)");
  });
});

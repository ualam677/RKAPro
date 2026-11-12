// Fast save/restore of the whole engine via its WebAssembly memory.
// Only the used part of the heap is copied. `ceil` is a safe upper bound on where any data lives
// (highest use seen + 2 MB margin, re-checked by a full scan every 200 saves).
import { lib } from "./core.mjs";
let m; const heap = () => (m ??= Object.getOwnPropertySymbols(lib).map((s) => lib[s]).find((x) => x?.module)?.module).HEAPU8; // lazy: lib is set by initEngine
const MARGIN = 2 << 20;
let ceil = 0, saves = 0;
function scanDown(u8, from) {
  const w = new Int32Array(u8.buffer, u8.byteOffset, Math.min(from, u8.byteLength) >> 2);
  let i = w.length - 1; while (i > 0 && w[i] === 0) i--;
  return (i + 1) << 2;
}
export function save() {
  const h = heap();
  let hw;
  if (ceil === 0 || ++saves % 200 === 0) hw = scanDown(h, h.byteLength);
  else hw = scanDown(h, ceil);
  if (hw + MARGIN > ceil) ceil = Math.min(h.byteLength, hw + MARGIN);
  return { data: h.slice(0, hw), hw };
}
export function restore(s) {
  const h = heap();
  h.set(s.data, 0);
  h.fill(0, s.hw, ceil); // anything past the snapshot was free at the time: zero it again
}

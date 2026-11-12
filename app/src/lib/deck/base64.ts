// Small isomorphic base64 helpers (browser + Node) so importers have no Node deps.

export function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.trim().replace(/-/g, "+").replace(/_/g, "/");
  const padded = clean + "===".slice((clean.length + 3) % 4);
  const bin = atob(padded);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

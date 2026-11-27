// Bombadil extractor cells shared by properties.ts and the specs' action
// generators. Not re-exported from a spec (specs export only properties
// and action generators).
import { extract } from "@antithesishq/bombadil";

export const path = extract((s) => s.window.location.pathname);
export const onPiece = extract((s) => /\/art\/\d+\/?$/.test(s.window.location.pathname));
export const onArtIndex = extract((s) => /\/art\/?$/.test(s.window.location.pathname));
export const onRoot = extract((s) => s.window.location.pathname === "/");
export const ready = extract((s) => s.document.body.dataset.ready ?? "");
export const renderer = extract((s) => s.document.body.dataset.renderer ?? "");
export const seed = extract((s) => s.document.body.dataset.seed ?? "");
export const audio = extract((s) => s.document.body.dataset.audio ?? "");
export const hud = extract((s) => s.document.body.dataset.hud ?? "");
export const fps = extract((s) => s.document.body.dataset.fps ?? "");
export const bass = extract((s) => s.document.body.dataset.bass ?? "");
export const mid = extract((s) => s.document.body.dataset.mid ?? "");
export const high = extract((s) => s.document.body.dataset.high ?? "");
export const beat = extract((s) => s.document.body.dataset.beat ?? "");
export const glError = extract((s) => s.document.body.dataset.glError ?? "");
export const hash = extract((s) => s.window.location.hash);
export const seedInput = extract((s) => {
  const el = s.document.getElementById("seed");
  return el && "value" in el ? String((el as HTMLInputElement).value) : "";
});
export const focused = extract((s) => s.document.activeElement?.id ?? "");

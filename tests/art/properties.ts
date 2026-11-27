// Shared Bombadil properties for the thin film piece, re-exported by
// tests/art/spec.ts and tests/art/controls.spec.ts.

import { extract, always, eventually } from "@antithesishq/bombadil";
import { onPiece, ready, renderer, seed, audio, hud, fps, bass, mid, high, beat, glError, hash, seedInput } from "./cells.ts";

const visible = (id: string) =>
  extract((s) => {
    const el = s.document.getElementById(id);
    if (!el) return false;
    const st = s.window.getComputedStyle(el);
    return st.display !== "none" && st.visibility !== "hidden" && !el.hidden;
  });

const canvasW = extract((s) => {
  const el = s.document.getElementById("c") as HTMLCanvasElement | null;
  return el ? el.width : 0;
});
const canvasH = extract((s) => {
  const el = s.document.getElementById("c") as HTMLCanvasElement | null;
  return el ? el.height : 0;
});
const hudElShown = visible("hud");
const hudBodyShown = visible("hud-body");

const unit = (s: string) => {
  const v = Number(s);
  return Number.isFinite(v) && v >= 0 && v <= 1.0001;
};

const sliderInRange = (id: string) =>
  extract((s) => {
    const el = s.document.getElementById(id) as HTMLInputElement | null;
    if (!el) return false;
    const v = Number(el.value), min = Number(el.min), max = Number(el.max);
    return Number.isFinite(v) && v >= min && v <= max;
  });

const volumeOk = sliderInRange("volume");
const bpmOk = sliderInRange("bpm");
const cutoffOk = sliderInRange("cutoff");
const resoOk = sliderInRange("resonance");
const speedOk = sliderInRange("speed");
const warpOk = sliderInRange("warp");
const iridOk = sliderInRange("irid");
const reactOk = sliderInRange("react");
const glitchOk = sliderInRange("glitch");

const externalSrc = extract((s) => {
  const nodes = [
    ...Array.from(s.document.querySelectorAll("script[src]")),
    ...Array.from(s.document.querySelectorAll("link[href]")),
    ...Array.from(s.document.querySelectorAll("img[src]")),
    ...Array.from(s.document.querySelectorAll("audio[src], video[src], source[src]")),
  ] as Array<{ getAttribute: (n: string) => string | null }>;
  const urls: string[] = [];
  for (const el of nodes) {
    const raw = el.getAttribute("src") || el.getAttribute("href") || "";
    if (!raw) continue;
    if (/^https?:\/\//i.test(raw) || raw.startsWith("//")) urls.push(raw);
  }
  return urls.join(",");
});

// If exploration clicks the "art" back link, these hold vacuously off-page.
export const first_frame_renders = eventually(() => !onPiece.current || ready.current === "1");

export const canvas_is_sized_once_ready = always(() => {
  if (!onPiece.current || ready.current !== "1") return true;
  return canvasW.current > 0 && canvasH.current > 0;
});

export const renderer_is_webgl = always(() => {
  if (!onPiece.current || ready.current !== "1") return true;
  return renderer.current === "webgl2" || renderer.current === "webgl";
});

export const gl_has_no_compile_error = always(() => {
  if (!onPiece.current) return true;
  return glError.current === "";
});

export const seed_is_a_uint32 = always(() => {
  if (!onPiece.current || seed.current === "") return true;
  return /^\d+$/.test(seed.current) && Number(seed.current) >= 0 && Number(seed.current) <= 0xffffffff;
});

export const seed_is_synced_to_url_hash = always(() => {
  if (!onPiece.current || seedInput.current === "") return true;
  return hash.current === "#seed=" + encodeURIComponent(seedInput.current);
});

export const audio_state_is_known = always(() => !onPiece.current || audio.current === "on" || audio.current === "off");

export const hud_state_is_known = always(() => !onPiece.current || hud.current === "open" || hud.current === "closed");

export const hud_visibility_matches_state = always(() => {
  if (!onPiece.current) return true;
  if (!hudElShown.current) return false;
  if (hud.current === "open") return hudBodyShown.current;
  if (hud.current === "closed") return !hudBodyShown.current;
  return true;
});

export const fps_is_a_finite_non_negative_number = always(() => {
  if (!onPiece.current || fps.current === "") return true;
  const v = Number(fps.current);
  return Number.isFinite(v) && v >= 0 && v < 1000;
});

export const spectrum_bands_are_unit_range = always(() => {
  if (!onPiece.current || ready.current !== "1") return true;
  return unit(bass.current) && unit(mid.current) && unit(high.current);
});

export const beat_is_a_finite_non_negative_number = always(() => {
  if (!onPiece.current || beat.current === "") return true;
  const v = Number(beat.current);
  return Number.isFinite(v) && v >= 0;
});

export const slider_values_stay_in_range = always(() => {
  if (!onPiece.current) return true;
  return volumeOk.current && bpmOk.current && cutoffOk.current && resoOk.current &&
    speedOk.current && warpOk.current && iridOk.current && reactOk.current && glitchOk.current;
});

export const page_has_no_external_network_dependencies = always(() => {
  if (!onPiece.current) return true;
  return externalSrc.current === "";
});

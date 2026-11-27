// Shared Bombadil properties for games/surf, re-exported by spec.ts and
// ride.spec.ts.

import { extract, always } from "@antithesishq/bombadil";

const STATES = ["boot", "menu", "loading", "share", "countdown", "ride", "paused", "results"];

import { state } from "./cells.ts";
const text = (id: string) =>
  extract((s) => s.document.getElementById(id)?.textContent ?? "");
const visible = (id: string) =>
  extract((s) => {
    const el = s.document.getElementById(id);
    if (!el) return false;
    const st = s.window.getComputedStyle(el);
    return st.display !== "none" && st.visibility !== "hidden" && !el.hidden;
  });

const score = text("score");
const flow = text("flow");
const mult = text("mult");
const accuracy = text("r-acc");
const pulses = text("r-pulses");
const bestFlow = text("r-flow");
const menuShown = visible("menu");
const hudShown = visible("hud");
const resultsShown = visible("results");
const pausedShown = visible("paused");
const shareShown = visible("share");

const num = (s: string) => Number(s.replace(/[^0-9.-]/g, ""));

export const state_is_known = always(() => STATES.includes(state.current));

// Exactly the panel for the current state is on screen.
export const panels_match_state = always(() => {
  const s = state.current;
  if (s === "menu") return menuShown.current && !hudShown.current && !resultsShown.current;
  if (s === "ride" || s === "countdown") return hudShown.current && !menuShown.current && !resultsShown.current;
  if (s === "paused") return pausedShown.current && hudShown.current;
  if (s === "results") return resultsShown.current && !hudShown.current;
  if (s === "share") return shareShown.current && !hudShown.current && !menuShown.current;
  return true;
});

// The score is shown with locale grouping ("1,250" / "1.250"); it must only
// ever contain digits and separators.
export const score_is_a_non_negative_integer = always(() =>
  /^\d{1,3}([,.  ']\d{3})*$|^\d+$/.test(score.current.trim()),
);

export const flow_is_a_non_negative_integer = always(() => {
  const v = num(flow.current);
  return Number.isInteger(v) && v >= 0;
});

// Flow multiplier is 1x..5x, doubled in a surge.
export const multiplier_in_range = always(() => {
  const v = num(mult.current);
  return v >= 1 && v <= 10;
});

export const results_are_consistent = always(() => {
  if (state.current !== "results") return true;
  const acc = num(accuracy.current);
  const [got, total] = pulses.current.split("/").map(num);
  return (
    acc >= 0 && acc <= 100 &&
    got >= 0 && got <= total &&
    num(bestFlow.current) <= got &&
    (total === 0 ? acc === 0 : Math.abs(acc - Math.round((got / total) * 100)) <= 0)
  );
});

// Bombadil: focused control flows for thin film (see AGENTS.md).
// No default generators: open the HUD, randomize the seed, toggle audio,
// and wait so first-frame / URL-hash properties get exercised.

import { actions } from "@antithesishq/bombadil";
import { onPiece, ready, hud, focused } from "./cells.ts";
export * from "./properties.ts";

const H = 72, SPACE = 32, R = 82, TAB = 9, ENTER = 13;

export const controls = actions(() => {
  if (!onPiece.current || ready.current !== "1") return ["Wait"];
  if (hud.current !== "open") return [{ PressKey: { code: H } }, "Wait"];
  const out: object[] = [
    { PressKey: { code: R } },
    { PressKey: { code: SPACE } },
    "Wait",
    "Wait",
    { PressKey: { code: H } },
  ];
  if (focused.current === "audio-toggle") out.push({ PressKey: { code: ENTER } });
  else out.push({ PressKey: { code: TAB } });
  return out;
});

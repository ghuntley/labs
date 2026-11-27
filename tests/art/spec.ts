// Bombadil: broad exploration of srv/art/1795745782 (see AGENTS.md).
//
//   devenv shell
//   test-art
//
// Default generators click and type around the HUD (start/stop synth, sliders,
// randomize). The generator below adds the documented shortcuts and always
// offers "Wait". Fullscreen (F) is omitted: headless Chrome often rejects it.

import { actions } from "@antithesishq/bombadil";
import { onPiece, ready } from "./cells.ts";
export * from "@antithesishq/bombadil/browser/defaults";
export * from "./properties.ts";

const H = 72, SPACE = 32, R = 82;

export const shortcuts = actions(() => {
  if (!onPiece.current) return ["Wait"];
  const keys = [H, SPACE, R].map((code) => ({ PressKey: { code } }));
  if (ready.current !== "1") return ["Wait", ...keys];
  return [...keys, "Wait"];
});

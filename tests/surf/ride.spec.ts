// Bombadil: full rides of games/surf, start to results (see AGENTS.md).
// No default action generators: start the demo from the keyboard, then steer
// (and occasionally pause/resume) until the results screen, then go again.
// Run against /surf/?demo=8 so each ride is short.

import { actions } from "@antithesishq/bombadil";
import { state, focused } from "./cells.ts";
export * from "./properties.ts";


const TAB = 9, ENTER = 13, LEFT = 37, RIGHT = 39, P = 80;

export const ride = actions(() => {
  switch (state.current) {
    case "menu":
      return focused.current === "demo" ? [{ PressKey: { code: ENTER } }] : [{ PressKey: { code: TAB } }];
    case "results":
      return focused.current === "again" ? [{ PressKey: { code: ENTER } }] : [{ PressKey: { code: TAB } }];
    case "countdown":
    case "ride":
      return [
        { PressKey: { code: LEFT } }, { PressKey: { code: RIGHT } },
        { PressKey: { code: LEFT } }, { PressKey: { code: RIGHT } },
        "Wait", "Wait", "Wait",
        { PressKey: { code: P } },
      ];
    case "paused":
      return [{ PressKey: { code: P } }];
    default:
      return ["Wait"];
  }
});

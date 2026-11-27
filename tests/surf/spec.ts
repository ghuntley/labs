// Bombadil: broad exploration of games/surf (see AGENTS.md).
//
//   devenv shell
//   test-surf            # runs this and ride.spec.ts
//
// Bombadil's default action generators click, type and scroll around the
// page (including "Or try the built-in demo groove", which starts a ride with
// a synthesised song). The generator below adds lane changes and pausing.
// Rides here are usually cut short by the defaults clicking pause/quit;
// ride.spec.ts covers full rides through to the results screen.

import { actions } from "@antithesishq/bombadil";
import { state } from "./cells.ts";
export * from "@antithesishq/bombadil/browser/defaults";
export * from "./properties.ts";

// Key codes: ← 37, → 39, A 65, D 68, P 80. "Wait" is always offered so
// loading/countdown (nothing clickable) never leaves Bombadil without an action.
export const steer = actions(() => {
  const s = state.current;
  if (s === "ride" || s === "countdown") {
    return [37, 39, 65, 68, 80].map((code) => ({ PressKey: { code } })).concat(["Wait"] as never[]);
  }
  if (s === "paused") return [{ PressKey: { code: 80 } }, "Wait"];
  return ["Wait"];
});

# AGENTS.md

Guidance for coding agents working in this repo. See README.md for the layout.

## Testing: always use Bombadil for property-based testing

We use [Bombadil](https://github.com/antithesishq/bombadil) (Antithesis) for
property-based testing, and we **always** use it. Any change to a web UI
(`srv/`, `games/*`) ships with Bombadil properties covering it, and the specs
must pass before committing.

- Bombadil is in the devenv shell (`devenv shell`), pinned via `devenv.yaml`
  (`github:antithesishq/bombadil/v0.8.0`). `CHROME` points at the shell's
  Chromium.
- Specs live next to the thing they test, outside the published tree, e.g.
  `tests/<name>/spec.ts`. They are ES modules exporting properties and action
  generators only:

  ```ts
  import { extract, always, eventually, actions } from "@antithesishq/bombadil";
  export * from "@antithesishq/bombadil/browser/defaults";

  const score = extract((state) =>
    Number(state.document.querySelector("#score")?.textContent ?? 0),
  );
  export const score_never_negative = always(() => score.current >= 0);
  ```

  Use `extract(state => …)` for reading the page, `always` / `eventually` /
  `next` / `now` for properties, and `actions(() => [...])` for custom action
  generators (`{ Click: … }`, `{ PressKey: { code } }`, `{ TypeText: { text } }`,
  `"Wait"`, …). Give every exported property a descriptive name; it appears in
  violation reports.
- Put shared properties in a helper module (e.g. `tests/surf/properties.ts`)
  and re-export it from each spec. Cells an action generator needs go in a
  separate module (`cells.ts`) that specs import but never re-export.
- Write two kinds of spec per UI: an exploration spec that includes
  `browser/defaults` (random clicking finds odd states), and a focused spec
  without the defaults that drives long flows to completion. The defaults
  click any visible button (pause, quit), so on their own they rarely finish
  a flow, and properties about the end state then go unchecked. Always offer
  `"Wait"` in states with nothing to click, or Bombadil stops with
  "no actions available" (exit 1).
- To check a property really gets exercised, temporarily add a probe
  `always(() => state !== "the-state")` and expect exit 2.
- Run against a local server, headless, with a time limit and fail-fast
  (`test-surf` in the devenv shell does all of this for surf):

  ```
  bombadil browser test --headless --time-limit 2m --exit-on-violation \
    "http://localhost:8000/surf/?demo=8" tests/surf/spec.ts
  ```

  Exit codes: 0 = passed (time limit reached), 2 = property violation, 1 = other
  error. Reproduce a failure with `--output-path <trace>` then
  `bombadil browser inspect <trace>` / `--reproduce <trace>`.
- Pure logic (analysis, generators, parsers) also gets fast `node --test` unit
  tests, but those supplement Bombadil, they do not replace it.

## Deploying

Pushing to `trunk` deploys automatically (see README "Auto-update"), so every
pushed commit must build: `nix build .#nixosConfigurations.labs-ghuntley-com.config.system.build.toplevel`.
Secrets live in `/var/lib/secrets` on the host, never in git.

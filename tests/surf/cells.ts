// Bombadil extractor cells shared by properties.ts and the specs' action
// generators. Not re-exported from a spec (specs export only properties
// and action generators).
import { extract } from "@antithesishq/bombadil";

export const state = extract((s) => s.document.body.dataset.state ?? "");
export const focused = extract((s) => s.document.activeElement?.id ?? "");

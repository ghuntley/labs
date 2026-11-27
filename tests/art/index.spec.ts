// Bombadil: the /art/ index (static listing). No default generators: they
// would click through to a piece and leave this page. Properties are checked
// on load; "Wait" keeps the run going for the time limit.

import { actions, extract, always } from "@antithesishq/bombadil";

const title = extract((s) => s.document.title);
const home = extract((s) => !!s.document.querySelector('a[href="/"]'));
const piece = extract((s) => !!s.document.querySelector('a[href="/art/1795745782/"]'));
const heading = extract((s) => s.document.querySelector("h1")?.textContent?.trim() ?? "");

export const art_index_has_title = always(() => /art/i.test(title.current));
export const art_index_links_home = always(() => home.current);
export const art_index_links_thin_film = always(() => piece.current);
export const art_index_heading_is_art = always(() => heading.current === "Art");

export const stay = actions(() => ["Wait"]);

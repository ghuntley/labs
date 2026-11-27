// Bombadil: root page links to the art index and thin film without
// default generators (those would navigate away).

import { actions, extract, always } from "@antithesishq/bombadil";

const artIndex = extract((s) => !!s.document.querySelector('a[href="/art/"]'));
const piece = extract((s) => !!s.document.querySelector('a[href="/art/1795745782/"]'));
const surf = extract((s) => !!s.document.querySelector('a[href="/surf/"]'));
const heading = extract((s) => s.document.querySelector("h1")?.textContent ?? "");

export const root_links_to_art_index = always(() => artIndex.current);
export const root_links_to_thin_film = always(() => piece.current);
export const root_still_links_to_surf = always(() => surf.current);
export const root_keeps_its_heading = always(() => heading.current.includes("labs-ghuntley-com"));

export const stay = actions(() => ["Wait"]);

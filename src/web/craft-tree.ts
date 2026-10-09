// 675 (D104) web pass: the crafting TREE (the workshop) and the RESEARCH TABLE.
// Spec: docs/superpowers/specs/2026-10-09-crafting-fog-research-design.md
//
// The tree replaces the flat recipe list: one card per OUTPUT (its known recipes are
// the card's "paths"), laid out in tier rows with Tier 1 at the BOTTOM so the book
// reads as a climb. Hidden recipes never render — each tier just counts them
// ("+ 7 undiscovered"). Thin SVG connectors run from an input chip down to the card
// that makes it, behind the cards (paintTreeLinks, after each render).
//
// Everything a card says is read off the engine: recipeKnowledge (status/tier/inputs),
// legalActions (craftable) and whyNot (gate hints). The web decides nothing.
import { recipeKnowledge } from "../engine/knowledge";
import type { RecipeKnowledge } from "../engine/knowledge";
import { researchStatus } from "../engine/research";
import { recipeOutputQty } from "../engine/craft";
import { legalActions, whyNot } from "../sim/legal";
import { RECIPE, RESEARCH_SEARCHES_PER_INK } from "../data/constants";
import { name, describe, weaponHint, logisticsEffect, enhancementHint, recipeGateHint, townRecipeIds, fieldRecipeIds, fieldRecipeNote } from "../render/render";
import type { GameState } from "../engine/types";
import { ic } from "./icons";

// ---------------------------------------------------------------------------
// Pure layout
// ---------------------------------------------------------------------------

export type TreeCard = { output: string; tier: number; paths: RecipeKnowledge[] };
export type TreeTier = { tier: number; cards: TreeCard[]; undiscovered: number };
export type TreeLayout = { tiers: TreeTier[]; field: { cards: TreeCard[]; undiscovered: number } };

// Group visible recipes into one card per output; a card sits at the lowest tier of
// its visible paths. Within a tier: craftable cards first, then known, then
// research-only, otherwise catalog order (stable, so the tree doesn't jump about).
function cardsOf(rows: RecipeKnowledge[], craftable: ReadonlySet<string>): TreeCard[] {
  const byOut = new Map<string, RecipeKnowledge[]>();
  for (const r of rows) (byOut.get(r.output) ?? byOut.set(r.output, []).get(r.output)!).push(r);
  const cards = [...byOut].map(([output, paths]) => ({ output, tier: Math.min(...paths.map((p) => p.tier)), paths }));
  const rank = (c: TreeCard) => (c.paths.some((p) => craftable.has(p.recipeId)) ? 0 : c.paths.some((p) => p.status === "known") ? 1 : 2);
  return cards.map((c, i) => ({ c, i })).sort((a, b) => rank(a.c) - rank(b.c) || a.i - b.i).map((x) => x.c);
}

/** The tree as data: town recipes in tier rows (ascending — the view puts Tier 1 at the
 *  bottom) with undiscovered counts, and the field recipes. `craftable` = recipe ids the
 *  reducer would accept right now (legalActions), only used for ordering. */
export function treeLayout(state: GameState, craftable: ReadonlySet<string> = new Set()): TreeLayout {
  const know = recipeKnowledge(state);
  const town = new Set(townRecipeIds(state.stations ?? []));
  const field = new Set(fieldRecipeIds());
  const townRows = know.filter((r) => town.has(r.recipeId));
  const maxTier = Math.max(1, ...townRows.map((r) => r.tier));
  const visible = townRows.filter((r) => r.status !== "hidden");
  const cards = cardsOf(visible, craftable);
  const tiers: TreeTier[] = [];
  for (let t = 1; t <= maxTier; t++) {
    tiers.push({ tier: t, cards: cards.filter((c) => c.tier === t), undiscovered: townRows.filter((r) => r.tier === t && r.status === "hidden").length });
  }
  const fieldRows = know.filter((r) => field.has(r.recipeId));
  return {
    tiers,
    field: { cards: cardsOf(fieldRows.filter((r) => r.status !== "hidden"), craftable), undiscovered: fieldRows.filter((r) => r.status === "hidden").length },
  };
}

export type Connector = { from: string; to: string; input: string }; // from = producer card's output; to = consumer card's output
/** Connector pairs: an input chip on card `to` ← the visible card `from` that makes it. */
export function connectorPairs(layout: TreeLayout): Connector[] {
  const cards = layout.tiers.flatMap((t) => t.cards);
  const visible = new Set(cards.map((c) => c.output));
  const out: Connector[] = [];
  for (const c of cards) {
    const inputs = new Set(c.paths.flatMap((p) => p.inputs.map((i) => i.defId)));
    for (const input of inputs) if (input !== c.output && visible.has(input)) out.push({ from: input, to: c.output, input });
  }
  return out;
}

// ---------------------------------------------------------------------------
// HTML
// ---------------------------------------------------------------------------

export const esc = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// An input chip: held before = icon + name; not held yet but named (by research, by a
// recipe you know — a starter's flint — or made by a card you can see) = greyed with its
// name; never heard of = "?".
function chip(i: RecipeKnowledge["inputs"][number], cardOut: string, visible: ReadonlySet<string>, pathKnown: boolean): string {
  const link = visible.has(i.defId) && i.defId !== cardOut ? ` data-link="${i.defId}"` : "";
  if (i.status === "seen") return `<span class="ct-chip" data-in="${i.defId}"${link} title="${esc(describe(i.defId))}">${ic(i.defId, 18)}<span class="n">${i.qty} ${name(i.defId)}</span></span>`;
  if (i.status === "heard" || pathKnown || visible.has(i.defId)) return `<span class="ct-chip heard" data-in="${i.defId}"${link} title="${name(i.defId)} — you've heard of it, but never held one">${ic(i.defId, 18)}<span class="n">${i.qty} ${name(i.defId)}</span></span>`;
  return `<span class="ct-chip unknown" title="something you've never come across"><span class="pk-ic none" style="width:18px;height:18px">?</span><span class="n">${i.qty} ???</span></span>`;
}

type CardCtx = { state: GameState; craftable: ReadonlySet<string>; visible: ReadonlySet<string>; townTools: string[]; field?: boolean };

function cardHtml(c: TreeCard, x: CardCtx): string {
  const qty = recipeOutputQty(RECIPE[c.paths[0]!.recipeId]!, x.townTools);
  const have = x.state.bank.filter((b) => b.defId === c.output).reduce((n, b) => n + b.qty, 0);
  const anyCan = !x.field && c.paths.some((p) => x.craftable.has(p.recipeId));
  const researched = c.paths.every((p) => p.status === "revealed");
  const hint = weaponHint(c.output) ?? logisticsEffect(c.output) ?? enhancementHint(c.output);
  const paths = c.paths.map((p) => {
    const can = !x.field && x.craftable.has(p.recipeId);
    // gate-legibility: a known recipe the reducer refuses on a station/tool gate names it (whyNot, never re-derived).
    const why = can || x.field ? null : whyNot(x.state, { type: "craft", recipeId: p.recipeId });
    const gate = why === "missing-station" || why === "missing-tool" ? recipeGateHint(p.recipeId) : null;
    const tail = x.field ? `<span class="ct-note">${fieldRecipeNote(p.recipeId)}</span>`
      : can ? `<button class="craftbtn" data-craft="${p.recipeId}">Craft</button>`
      : gate ? `<span class="ct-gate">🔒 ${gate}</span>` : "";
    return `<div class="ct-path${can ? "" : " locked"}${p.status === "revealed" ? " rev" : ""}" data-recipe="${p.recipeId}"><span class="ct-chips">${p.inputs.map((i) => chip(i, c.output, x.visible, p.status === "known")).join("")}</span>${tail}</div>`;
  }).join("");
  return `<div class="ct-card${anyCan ? " can" : " dim"}${researched ? " researched" : ""}" data-card="${c.output}" title="${esc(describe(c.output))}">
    <div class="ct-head">${ic(c.output, 28)}<span class="ct-nm"><b>${name(c.output)}</b>${qty > 1 ? ` <span class="ct-q">×${qty}</span>` : ""}${have ? `<span class="have"> · have ${have}</span>` : ""}</span>${researched ? `<span class="ct-mark" title="revealed at the research table">researched</span>` : ""}</div>
    ${hint ? `<div class="ct-hint">${hint}</div>` : ""}
    ${paths}
  </div>`;
}

function ctx(state: GameState, layout: TreeLayout, craftable: ReadonlySet<string>): CardCtx {
  return {
    state,
    craftable,
    visible: new Set(layout.tiers.flatMap((t) => t.cards.map((c) => c.output))),
    townTools: [...state.bank.map((s) => s.defId), ...state.loadout.equipment.tools],
  };
}
const craftableSet = (state: GameState): Set<string> =>
  new Set(legalActions(state).flatMap((a) => (a.type === "craft" ? [a.recipeId] : [])));

const undiscovered = (n: number, what = "recipe") =>
  n ? `<span class="ct-undisc" title="hold the ingredients, or ask at the research table">+ ${n} undiscovered${what === "recipe" ? "" : ` ${what}`}</span>` : "";

/** The workshop: the crafting tree (town) + the field recipes, both fogged. */
export function workshopSection(state: GameState): string {
  const craftable = craftableSet(state);
  const layout = treeLayout(state, craftable);
  const x = ctx(state, layout, craftable);
  const rows = [...layout.tiers].reverse().map((t) => `<div class="ct-tier${t.cards.length ? "" : " empty"}" data-tier="${t.tier}">
      <div class="ct-tlabel"><b>Tier ${t.tier}</b>${undiscovered(t.undiscovered)}</div>
      ${t.cards.length ? `<div class="ct-row">${t.cards.map((c) => cardHtml(c, x)).join("")}</div>` : ""}
    </div>`).join("");
  const field = layout.field;
  return `
    <section class="workshop">
      <h2>Crafting tree</h2>
      <div class="ct-sub muted small">Tier 1 at the bottom. Hold every ingredient of a recipe — or ask at the research table — to learn it.</div>
      <div class="craftlist ct-tree" data-tree>${rows}</div>
      <h2>Field recipes</h2>
      <div class="ct-sub muted small">made out on an expedition, not in town</div>
      <div class="ct-row ct-field">${field.cards.map((c) => cardHtml(c, { ...x, field: true })).join("")}${field.cards.length ? "" : `<span class="muted small">none known yet</span>`}${undiscovered(field.undiscovered)}</div>
    </section>`;
}

// ---------------------------------------------------------------------------
// The research table
// ---------------------------------------------------------------------------

// One search this session (persisted beside the save): the word, and what it found.
export type ResearchLogEntry = { q: string; hit?: string; known?: boolean };

export function researchStatusLine(state: GameState): string {
  const st = researchStatus(state);
  if (st.searches === 0) return "no searches left — come back from a trip, or spend an ink";
  const parts: string[] = [];
  if (st.freeLeft) parts.push(`${st.freeLeft} free search${st.freeLeft === 1 ? "" : "es"} this visit`);
  if (st.charges) parts.push(`${st.charges} bought search${st.charges === 1 ? "" : "es"} left`);
  return parts.join(" · ");
}

function resultHtml(state: GameState, last: ResearchLogEntry | null): string {
  if (!last) return "";
  if (!last.hit) {
    const line = last.known ? "You already know everything the town can tell you about that." : "Nobody in town has heard of that.";
    return `<div class="rs-result miss"><span class="rs-q">“${esc(last.q)}”</span> — ${line}</div>`;
  }
  const row = recipeKnowledge(state).find((r) => r.recipeId === last.hit);
  if (!row) return "";
  const craftable = craftableSet(state);
  const layout = treeLayout(state, craftable);
  const x = ctx(state, layout, craftable);
  const field = fieldRecipeIds().includes(row.recipeId);
  return `<div class="rs-result hit">
    <div><span class="rs-q">“${esc(last.q)}”</span> — someone in town knows how to make <b>${name(row.output)}</b>:</div>
    <div class="ct-row">${cardHtml({ output: row.output, tier: row.tier, paths: [row] }, { ...x, field })}</div>
    <button class="link rs-find" data-find-recipe="${row.recipeId}">find it in the ${field ? "field recipes" : "workshop"} →</button>
  </div>`;
}

/** The research table panel. `history` = this save's searches, newest first; `last` = the
 *  result to show (this session's latest search), or null. */
export function researchSection(state: GameState, history: ResearchLogEntry[] = [], last: ResearchLogEntry | null = null): string {
  const st = researchStatus(state);
  const none = st.searches === 0;
  const inks = st.inks.map((i) => `<button class="rs-ink" data-buy-research="${i.inkId}" title="you hold ${i.qty}">Spend 1 ${name(i.inkId)} → ${RESEARCH_SEARCHES_PER_INK} searches</button>`).join("");
  const hist = history.length ? `<div class="rs-hist"><div class="rs-hlab">Asked so far</div>${history.map((h) => `<div class="rs-hrow"><span class="rs-q">${esc(h.q)}</span> → ${h.hit ? `<button class="link" data-find-recipe="${h.hit}">${name(RECIPE[h.hit]?.output.defId ?? h.hit)}</button>` : `<span class="muted">${h.known ? "already known" : "nothing"}</span>`}</div>`).join("")}</div>` : "";
  return `<section class="research">
    <div class="rs-ledger">
      <div class="rs-title">The Research Table</div>
      <div class="rs-hint">Try a word: what do you want to make? (bag, boat, armour…)</div>
      <form class="rs-form" data-research-form>
        <input type="text" name="q" data-research-q placeholder="a word…" autocomplete="off" enterkeyhint="search" maxlength="40" />
        <button type="submit" class="craftbtn"${none ? ` disabled title="no searches left"` : ""}>Search</button>
      </form>
      <div class="rs-status${none ? " none" : ""}">${researchStatusLine(state)}</div>
      ${inks ? `<div class="rs-inks">${inks}</div>` : ""}
      ${resultHtml(state, last)}
      ${hist}
    </div>
  </section>`;
}

// ---------------------------------------------------------------------------
// DOM: connector lines (after each render) + the "find it" flash
// ---------------------------------------------------------------------------

const SVG_NS = "http://www.w3.org/2000/svg";
/** Draw each tree's connectors: a curve from the producer card's top edge to the input
 *  chip it feeds, behind the cards (they're opaque, so lines only show in the gaps). */
export function paintTreeLinks(root: ParentNode): void {
  root.querySelectorAll<HTMLElement>("[data-tree]").forEach((tree) => {
    tree.querySelector(":scope > svg.ct-links")?.remove();
    const box = tree.getBoundingClientRect();
    if (!box.width) return;
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.classList.add("ct-links");
    svg.setAttribute("width", String(tree.scrollWidth));
    svg.setAttribute("height", String(tree.scrollHeight));
    tree.querySelectorAll<HTMLElement>(".ct-chip[data-link]").forEach((c) => {
      const card = c.closest<HTMLElement>(".ct-card");
      const from = tree.querySelector<HTMLElement>(`.ct-card[data-card="${c.dataset.link}"]`);
      if (!card || !from) return;
      const a = from.getBoundingClientRect(), b = c.getBoundingClientRect();
      const x1 = a.left + a.width / 2 - box.left, y1 = a.top - box.top; // producer's top edge
      const x2 = b.left + b.width / 2 - box.left, y2 = b.bottom - box.top; // chip's bottom edge
      const dy = Math.max(24, Math.abs(y1 - y2) / 2);
      const path = document.createElementNS(SVG_NS, "path");
      path.setAttribute("d", y1 > y2 ? `M${x1},${y1} C${x1},${y1 - dy} ${x2},${y2 + dy} ${x2},${y2}` : `M${x1},${y1} C${x1},${y1 - dy} ${x2},${y2 - dy} ${x2},${y2}`);
      path.dataset.from = c.dataset.link!;
      path.dataset.to = card.dataset.card!;
      svg.appendChild(path);
    });
    tree.prepend(svg);
    // hover a card: light its lines (to what it's made from, and to what it feeds)
    tree.querySelectorAll<HTMLElement>(".ct-card").forEach((card) => {
      const lit = (on: boolean) => svg.querySelectorAll<SVGPathElement>(`path[data-from="${card.dataset.card}"], path[data-to="${card.dataset.card}"]`).forEach((p) => p.classList.toggle("on", on));
      card.onpointerenter = () => lit(true);
      card.onpointerleave = () => lit(false);
    });
  });
}

/** Scroll a recipe's card into view and flash it (research "find it →"). */
export function flashRecipe(root: ParentNode, recipeId: string): boolean {
  const row = root.querySelector<HTMLElement>(`[data-recipe="${recipeId}"]`);
  const card = row?.closest<HTMLElement>(".ct-card") ?? row;
  if (!card) return false;
  card.scrollIntoView({ block: "center", inline: "center" });
  card.classList.remove("ct-flash");
  void card.offsetWidth; // restart the animation
  card.classList.add("ct-flash");
  root.querySelectorAll<SVGPathElement>(`svg.ct-links path[data-to="${card.dataset.card}"], svg.ct-links path[data-from="${card.dataset.card}"]`).forEach((p) => p.classList.add("on"));
  return true;
}

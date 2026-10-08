// Action feedback (beh / rx5 / mki): the DOM half. main.ts records WHAT happened
// (feedback.ts turns reducer events into cues/notes) with a timestamp; after every
// render paintFx re-applies whatever is still live. draw() rebuilds the whole app
// with innerHTML, so each effect is re-inserted with a NEGATIVE animation-delay equal
// to its age — the animation continues where it was instead of restarting.
// prefers-reduced-motion is handled in CSS (index.html: no rise / no pulse).
import type { Cue } from "./feedback";
import { iconStyle } from "./assets";

export const CUE_MS = 1700; // a tile cue's whole life — covers .fly (1.1s + stagger) and .cue-miss (1.7s)
export const FLASH_MS = 900; // the bag-count / slot pulse
export const PACK_MS = 1400; // the "just packed" glow on the bank row + loadout slot
export const NOTE_MS = 4500; // an inline note (craft result / pack refusal) + its toast

export type Fx = {
  cues: { cue: Cue; t0: number }[];
  flash: { defs: string[]; t0: number } | null;
  packed: { defId: string; t0: number } | null;
  // An inline result note under `anchor` (a CSS selector — the recipe row / bank row the
  // player pressed), echoed as a toast. ok=false is a refusal (reject copy).
  note: { ok: boolean; text: string; anchor: string | null; t0: number } | null;
};
export const emptyFx = (): Fx => ({ cues: [], flash: null, packed: null, note: null });

// Drop anything past its lifetime (called before painting).
export function pruneFx(fx: Fx, now: number): void {
  fx.cues = fx.cues.filter((c) => now - c.t0 < CUE_MS);
  if (fx.flash && now - fx.flash.t0 >= FLASH_MS) fx.flash = null;
  if (fx.packed && now - fx.packed.t0 >= PACK_MS) fx.packed = null;
  if (fx.note && now - fx.note.t0 >= NOTE_MS) fx.note = null;
}

// Where a picked-up item flies: the visible Bag tab (sidebar / open drawer), else the
// drawer handle's bag count (phone, drawer closed). Null = nothing on screen.
function bagTarget(root: HTMLElement): { x: number; y: number } | null {
  for (const q of ['[data-tab="bag"]', ".drawer-handle .bagcount"]) {
    const e = root.querySelector(q);
    const r = e?.getBoundingClientRect();
    if (r && r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight) return { x: r.left + Math.min(r.width / 2, 60), y: r.top + r.height / 2 };
  }
  return null;
}
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
const sel = (s: string) => s.replace(/["\\]/g, "\\$&");

function el(tag: string, cls: string, html: string): HTMLElement {
  const e = document.createElement(tag);
  e.className = cls;
  e.innerHTML = html;
  return e;
}
function pulse(e: Element, cls: string, age: number): void {
  e.classList.add(cls);
  (e as HTMLElement).style.animationDelay = `${-age}ms`;
}

export function paintFx(root: HTMLElement, fx: Fx, now: number): void {
  pruneFx(fx, now);
  // rx5 (refined): a gather's item ICON pops off the tile and flies into the bag (the
  // Bag tab, or the drawer handle on a phone) while fading; the tool(s) that worked the
  // node bounce in their slot. A refused node shakes and shows a short "needs pick";
  // a bag-full refusal also shakes the bag count. Fixed-position so they can leave the
  // map's camera; positions are re-read each paint, so call this AFTER the camera moves.
  const bag = bagTarget(root);
  const perTile = new Map<string, number>();
  for (const { cue, t0 } of fx.cues) {
    const age = now - t0;
    const tile = root.querySelector<HTMLElement>(`.tile[data-x="${cue.at.x}"][data-y="${cue.at.y}"]`);
    if (!tile) continue;
    const r = tile.getBoundingClientRect();
    const k = `${cue.at.x},${cue.at.y}`;
    const i = perTile.get(k) ?? 0; // several stacks off one tile (loot) leave one after another
    perTile.set(k, i + 1);
    const x0 = r.left + r.width / 2, y0 = r.top + r.height / 2;
    if (cue.kind === "gain") {
      const st = cue.defId ? iconStyle(cue.defId) : null;
      const face = st ? `<span class="fly-icon" style="${st}"></span>` : `<span class="fly-name">${esc(cue.text.replace(/^\+\d+ /, ""))}</span>`;
      const node = el("div", "fly", `${face}${cue.qty && cue.qty > 1 ? `<span class="fly-q">+${cue.qty}</span>` : ""}`);
      node.style.left = `${x0}px`;
      node.style.top = `${y0}px`;
      node.style.setProperty("--dx", `${bag ? bag.x - x0 : 0}px`);
      node.style.setProperty("--dy", `${bag ? bag.y - y0 : -60}px`);
      node.style.animationDelay = `${-age + i * 160}ms`;
      node.title = cue.text;
      node.setAttribute("aria-hidden", "true");
      root.appendChild(node);
      for (const t of cue.tools ?? []) root.querySelectorAll(`.slot[data-def="${sel(t)}"]`).forEach((e) => pulse(e, "fx-bounce", age));
    } else {
      pulse(tile, "fx-shake", age);
      const node = el("div", "cue-miss", esc(cue.text));
      node.style.left = `${x0}px`;
      node.style.top = `${r.top - 4 - i * 18}px`;
      node.style.animationDelay = `${-age}ms`;
      node.setAttribute("aria-hidden", "true");
      root.appendChild(node);
      if (cue.reason === "carry-full") root.querySelectorAll('[data-tab="bag"], .drawer-handle .bagcount').forEach((e) => pulse(e, "fx-shake", age));
    }
  }
  // beh: the bank row you pressed and the loadout slot/chip the item landed in glow.
  if (fx.packed) {
    const age = now - fx.packed.t0, d = sel(fx.packed.defId);
    root.querySelectorAll(`[data-bank="${d}"], [data-loadout] [data-def="${d}"]`).forEach((e) => pulse(e, "fx-packed", age));
  }
  // mki: a note under the row you pressed (+ the row flashes), and a toast — a town
  // recipe re-sorts once it's no longer affordable, so the row may have moved.
  if (fx.note) {
    const { ok, text, anchor, t0 } = fx.note, age = now - t0;
    const cls = ok ? "ok" : "err";
    const row = anchor ? root.querySelector(anchor) : null;
    const inline = el("div", `fxnote ${cls}`, esc(text));
    inline.style.animationDelay = `${-age}ms`;
    if (row) { pulse(row, `fx-row-${cls}`, age); row.after(inline); }
    else root.querySelector(".craftlist")?.prepend(inline);
    const toast = el("div", `toast ${cls}`, esc(text));
    toast.setAttribute("role", "status");
    toast.style.animationDelay = `${-age}ms`;
    root.appendChild(toast);
  }
}

// Item card (f2i7, user 2026-10-10: "how can I see what my fire staff or club does,
// especially when packing"). Phones have no hover, so the describe() tooltips were
// invisible there. Press and hold any item (or tap one that has no tap action of its
// own) to get a card: what it is, what it does, where it comes from. View-only.
import { name, describe, itemSources } from "../render/render";
import { ic } from "./icons";

const HOLD_MS = 450;
const ITEM = "[data-def], [data-bank]";
// a tap on these already does something (pack, eat, craft…) — only a hold opens the card
const ACTS = "button, [data-pack], [data-eat], [data-act], [data-recipe], [data-drop], [data-use-item]";

const defOf = (el: Element): string | null => (el as HTMLElement).dataset.def ?? (el as HTMLElement).dataset.bank ?? null;

export function itemCardHtml(defId: string): string {
  const src = itemSources(defId);
  return `<div class="item-card" role="dialog" aria-label="${name(defId)}">
    <button class="ic-close" data-card-close aria-label="close">✕</button>
    <div class="ic-head">${ic(defId, 40)}<h3>${name(defId)}</h3></div>
    <p class="ic-what">${describe(defId)}</p>
    ${src.length ? `<div class="ic-src"><b>Where it comes from</b><ul>${src.map((s) => `<li>${s}</li>`).join("")}</ul></div>` : ""}
  </div>`;
}

export function openItemCard(defId: string): void {
  closeItemCard();
  const wrap = document.createElement("div");
  wrap.className = "item-card-scrim";
  wrap.innerHTML = itemCardHtml(defId);
  wrap.onclick = (ev) => { if (ev.target === wrap || (ev.target as Element).closest("[data-card-close]")) closeItemCard(); };
  document.body.appendChild(wrap);
}

export function closeItemCard(): void {
  document.querySelector(".item-card-scrim")?.remove();
}

/** Wire hold-to-inspect + tap-to-inspect on `root` (once; survives re-renders). */
export function installItemCard(root: HTMLElement): void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let start = { x: 0, y: 0 };
  let swallow = false;
  const cancel = () => { if (timer) clearTimeout(timer); timer = null; };
  root.addEventListener("pointerdown", (ev) => {
    const el = (ev.target as Element).closest(ITEM);
    const def = el && defOf(el);
    if (!def) return;
    start = { x: ev.clientX, y: ev.clientY };
    cancel();
    timer = setTimeout(() => { timer = null; swallow = true; openItemCard(def); }, HOLD_MS);
  });
  root.addEventListener("pointermove", (ev) => { if (timer && Math.abs(ev.clientX - start.x) + Math.abs(ev.clientY - start.y) > 8) cancel(); });
  root.addEventListener("pointerup", cancel);
  root.addEventListener("pointercancel", cancel);
  root.addEventListener("contextmenu", (ev) => { if (swallow) ev.preventDefault(); }); // a long touch also fires contextmenu
  root.addEventListener("click", (ev) => {
    if (swallow) { swallow = false; ev.stopPropagation(); ev.preventDefault(); return; } // the hold opened the card; don't also pack/eat
    const el = (ev.target as Element).closest(ITEM);
    const def = el && defOf(el);
    if (def && !(ev.target as Element).closest(ACTS)) openItemCard(def);
  }, true);
}

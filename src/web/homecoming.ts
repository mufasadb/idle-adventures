// seyh.1 (owner Q10 = B, diegetic only): coming home. The hero walks in through the
// gate and lays the haul out on the packing cloth; the stacks then fly into the Bank
// while the camera follows them; a small parchment strip says what came home, the
// energy left unspent, and what the run unlocked. No report card. The facts are
// render.ts's homecomingSummary (pure); this module only draws them.
// prefers-reduced-motion: no lay-out, no flight — the strip shows straight away.
import type { Homecoming } from "../render/render";
import { homecomingLine, name } from "../render/render";
import { MAP_SCROLL_ID, RECIPE } from "../data/constants";
import { ic } from "./icons";
import { scenePlacements, spotBox } from "./town-layout";
import { scene, panCamTo } from "./town-scene";

const reducedMotion = (): boolean => globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
const pct = (v: number) => `${(v * 100).toFixed(3)}%`;
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const attr = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

// Timings (presentation only).
const LAYOUT_STAGGER_MS = 90; // each stack drops onto the cloth a beat after the last
const LAYOUT_HOLD_MS = 700; // a moment to look at the haul on the cloth
const FLY_MS = 1100; // cloth → bank door
const FLY_STAGGER_MS = 110;
const FLY_DELAY_MS = 150;
const PAN_MS = FLY_DELAY_MS + FLY_MS; // the camera keeps pace with the lead stack, so the flight stays on screen
const MAX_ON_CLOTH = 12; // the cloth's room; the strip still lists everything
const MAX_NEW_IN_STRIP = 4; // more new recipes than this fold into one "+N more" (the strip stays one line)

/** What's on the cloth: each haul stack, then the carried maps as one scroll stack. */
export function homeGoods(h: Homecoming): { defId: string; qty: number }[] {
  return [...h.haul, ...(h.maps.length ? [{ defId: MAP_SCROLL_ID, qty: h.maps.length }] : [])];
}

/** The small strip at the foot of the square (replaces the last-log line until you
 *  next do something in town). Haul as icons × qty, ⚡ unspent, ★ what's new. */
export function homeStripHtml(h: Homecoming, cls = ""): string {
  const goods = homeGoods(h).map((g) => `<span class="hs-it" title="${attr(`${g.qty}× ${g.defId === MAP_SCROLL_ID ? (g.qty > 1 ? "maps" : "map") : name(g.defId)}`)}">${ic(g.defId, 22)}<b>${g.qty}</b></span>`).join("");
  const lead = h.defeated ? `<span class="hs-lead" title="you were beaten — what you carried still came home">♥ dragged home</span>` : "";
  const empty = goods ? "" : `<span class="hs-empty">empty-handed</span>`;
  const en = h.unspent > 0
    ? `<span class="hs-en" title="energy you came home with"><b>⚡${h.unspent}</b> unspent</span>`
    : `<span class="hs-en spent" title="you came home with no energy left">⚡ all spent</span>`;
  const shown = h.newRecipes.length > MAX_NEW_IN_STRIP ? h.newRecipes.slice(0, MAX_NEW_IN_STRIP - 1) : h.newRecipes;
  const rest = h.newRecipes.slice(shown.length);
  const fresh = shown.map((id) => `<button class="hs-new" data-find-recipe="${attr(id)}" title="you can make this now — find it in the workshop">★ ${name(RECIPE[id]?.output.defId ?? id)}</button>`).join("")
    + (rest.length ? `<button class="hs-new" data-find-recipe="${attr(rest[0]!)}" title="${attr(rest.map((id) => name(RECIPE[id]?.output.defId ?? id)).join(", "))}">★ +${rest.length} more</button>` : "");
  return `<div class="ts-home${h.defeated ? " defeated" : ""}${cls ? ` ${cls}` : ""}" role="status" aria-label="${attr(homecomingLine(h))}">${lead}<span class="hs-goods">${goods}${empty}</span>${en}${fresh}</div>`;
}

/** The haul is laid out on the packing cloth, then flies into the Bank. Resolves when
 *  it has landed (immediately with reduced motion or nothing to show). */
export async function playHaul(root: HTMLElement, h: Homecoming): Promise<void> {
  const world = root.querySelector<HTMLElement>("[data-ts-world]");
  const goods = homeGoods(h).slice(0, MAX_ON_CLOTH);
  if (!world || !goods.length || reducedMotion()) return;
  scene.busy = true;
  try {
    const spots = scenePlacements([]);
    const cloth = spots.find((s) => s.id === "cloth")!, bank = spots.find((s) => s.id === "bank")!;
    const cb = spotBox(cloth);
    const door = { x: bank.x, y: bank.y - bank.h * 0.28 };
    const cols = Math.min(goods.length, 4), rows = Math.ceil(goods.length / cols);
    const z = Math.round(cloth.y * 1000) + 2;
    const placed = goods.map((g, i) => {
      const c = i % cols, r = Math.floor(i / cols);
      const x = cb.x0 + (cb.x1 - cb.x0) * (0.22 + 0.56 * (cols === 1 ? 0.5 : c / (cols - 1)));
      const y = cb.y0 + cloth.h * (0.35 + 0.45 * (rows === 1 ? 0.5 : r / (rows - 1)));
      const el = document.createElement("div");
      el.className = "ts-haul-it";
      el.setAttribute("aria-hidden", "true");
      el.style.cssText = `left:${pct(x)};top:${pct(y)};z-index:${z}`;
      el.innerHTML = `<span class="ts-haul-ic">${ic(g.defId, 30)}${g.qty > 1 ? `<b>${g.qty}</b>` : ""}</span>`;
      world.appendChild(el);
      el.animate(
        [{ opacity: 0, transform: "translate(-50%, -130%) scale(0.6)" }, { opacity: 1, transform: "translate(-50%, -50%) scale(1)" }],
        { duration: 260, delay: i * LAYOUT_STAGGER_MS, easing: "ease-out", fill: "both" },
      );
      return { el, x, y };
    });
    await wait(goods.length * LAYOUT_STAGGER_MS + LAYOUT_HOLD_MS);
    const pan = panCamTo(door.x, PAN_MS);
    const landed = placed.map(({ el, x, y }, i) => el.animate(
      [
        { left: pct(x), top: pct(y), opacity: 1, transform: "translate(-50%, -50%) scale(1)" },
        { left: pct((x + door.x) / 2), top: pct(Math.min(y, door.y) - 0.12), opacity: 1, transform: "translate(-50%, -50%) scale(1.1)", offset: 0.5 },
        { left: pct(door.x), top: pct(door.y), opacity: 0.2, transform: "translate(-50%, -50%) scale(0.45)" },
      ],
      { duration: FLY_MS, delay: FLY_DELAY_MS + i * FLY_STAGGER_MS, easing: "ease-in-out", fill: "forwards" },
    ).finished.then(() => {
      el.remove();
      const b = root.querySelector<HTMLElement>('[data-spot="bank"]');
      b?.classList.remove("ts-receive");
      void b?.offsetWidth; // restart the thump for each stack
      b?.classList.add("ts-receive");
    }, () => el.remove()));
    await Promise.all([pan, ...landed]);
    await wait(250);
  } finally {
    scene.busy = false;
  }
}

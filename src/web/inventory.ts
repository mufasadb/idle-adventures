// Inventory slot boxes — shared by the town loadout plan and the expedition bag.
import type { Equipment, ItemStack, Loadout } from "../engine/types";
import { wornPieces } from "../engine/pack";
import { ARROW_STACK_CAP } from "../data/constants";
import { describe, name } from "../render/render";
import { iconStyle } from "./assets";

// kml: a slot shows the item's pixel icon when one exists (the name moves to the
// hover title) — far less text in the bag; items without art keep their name.
function face(defId: string): string {
  const st = iconStyle(defId);
  return st ? `<span class="slot-icon" style="${st}" aria-label="${name(defId)}"></span>` : name(defId);
}

// The inventory grid (pqp/ju3). Each food/potion/battle-item UNIT and each tool
// is its own filled box (no stacking); loot materials stack (one box per stack,
// shown ×qty). Empty boxes pad to `cap`. Worn gear (weapon/armour/transport/
// backpack/panniers) is appended as semi-transparent GHOST boxes — you see your
// whole kit in one place, but ghosts don't spend a real slot. Food burns down
// over the run, so its boxes disappear live as they're eaten.
// vb8: `tip` (from describe(defId)) rides in the title after the name — item
// constants are legible on hover without cluttering the chip.
function slotBox(cls: string, defId: string, q: string, tip = ""): string {
  const label = name(defId);
  return `<div class="slot ${cls}" title="${label}${q}${tip ? ` — ${tip}` : ""}">${face(defId)}${q ? `<span class="q">${q}</span>` : ""}</div>`;
}
// eatFood (mco): on expedition, `eatFood` is the designated auto-eat food defId
// (or null = none designated but still designatable). Food boxes then carry
// data-eatfood for right-click designation, and the active one gets a border + 🍴
// badge. In town it's undefined → plain food boxes, no designation affordance.
function realSlots(loadout: Loadout, carry: ItemStack[], eatFood?: string | null, eatable?: Set<string>, campMealReady = false): string[] {
  const boxes: string[] = [];
  const units = (items: ItemStack[], cls: string) => {
    for (const it of items) for (let i = 0; i < it.qty; i++) boxes.push(slotBox(cls, it.defId, "", describe(it.defId)));
  };
  // Food boxes (mco): right-clickable to designate as the auto-eat food when on
  // expedition (eatFood !== undefined). The designated one gets `designated` + a badge.
  if (eatFood === undefined) {
    units(loadout.food, "food");
  } else {
    for (const it of loadout.food) for (let i = 0; i < it.qty; i++) {
      const on = it.defId === eatFood;
      const canEat = eatable?.has(it.defId) ?? false; // 7lr: this food would actually gain energy
      // 7lr: left-click eats one unit of THIS food (a tent + unspent charge makes it the
      // over-max camp meal); right-click designates it as the auto-eat food.
      const eatTip = canEat
        ? (campMealReady ? "left-click: 🏕 CAMP MEAL (over-max, +50%)" : "left-click: eat one")
        : "already full — can't eat";
      const tip = `${eatTip} · ${on ? "auto-eating — right-click to stop" : "right-click: auto-eat this"} · ${describe(it.defId)}`;
      const cls = `slot food${on ? " designated" : ""}${canEat ? " eatable" : ""}${canEat && campMealReady ? " campmeal" : ""}`;
      boxes.push(`<div class="${cls}" ${canEat ? `data-eat="${it.defId}"` : ""} data-eatfood="${it.defId}" title="${name(it.defId)} — ${tip}">${face(it.defId)}${on ? `<span class="autoeat">🍴</span>` : ""}</div>`);
    }
  }
  units(loadout.potions, "potion");
  units(loadout.battleItems ?? [], "battle");
  units(loadout.enhancements ?? [], "battle"); // weapon enhancements (D60): 1 slot/unit, styled like battle items
  units(loadout.spares ?? [], "tool"); // spare gear (82r): 1 slot per piece, grey like tools; expands into carry at embark
  // ammo (D45): the one deep-stacking consumable — one box per ARROW_STACK_CAP slot, shown ×qty like loot
  for (const it of loadout.ammo ?? []) {
    for (let rest = it.qty; rest > 0; rest -= ARROW_STACK_CAP) {
      boxes.push(slotBox("ammo", it.defId, `×${Math.min(rest, ARROW_STACK_CAP)}`, describe(it.defId)));
    }
  }
  for (const t of loadout.equipment.tools) boxes.push(slotBox("tool", t, "", describe(t)));
  for (const s of carry) boxes.push(slotBox("loot", s.defId, `×${s.qty}`, describe(s.defId)));
  // zpm.2: carried maps don't use a loot/carry slot — they live in a dedicated
  // map-carry pool (mapCarryCap) and render in their own section below the grid.
  return boxes;
}
function wornGhosts(eq: Equipment): string[] {
  const worn = wornPieces(eq).filter(Boolean) as string[];
  return worn.map((d) => `<div class="slot ghost" title="${name(d)} — worn, no slot · ${describe(d)}">${face(d)}</div>`);
}
// Returns { used, html }. used = real filled slots (ghosts excluded).
export function inventoryGrid(loadout: Loadout, carry: ItemStack[], cap: number, eatFood?: string | null, eatable?: Set<string>, campMealReady = false): { used: number; html: string } {
  const real = realSlots(loadout, carry, eatFood, eatable, campMealReady);
  const boxes = [...real];
  while (boxes.length < cap) boxes.push(`<div class="slot empty">·</div>`);
  const ghosts = wornGhosts(loadout.equipment);
  const ghostStrip = ghosts.length ? `<div class="slots ghosts" title="worn gear — free, doesn't use a slot">${ghosts.join("")}</div>` : "";
  return { used: real.length, html: `<div class="slots">${boxes.join("")}</div>${ghostStrip}` };
}

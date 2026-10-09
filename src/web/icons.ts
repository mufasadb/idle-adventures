// An item icon as inline HTML (cel/pixel frame via assets.ts, zoomed to `px`), or a
// lettered placeholder when the defId has no frame. Shared by the packing sheet, the
// town square and the crafting tree.
import { name } from "../render/render";
import { iconStyle } from "./assets";

const ICON_PX = 24; // the atlases' CSS frame size; ic() zooms to the size asked

export function ic(defId: string | null, px: number): string {
  const st = defId ? iconStyle(defId) : null;
  return st
    ? `<span class="pk-ic" style="${st};zoom:${(px / ICON_PX).toFixed(3)}" aria-hidden="true"></span>`
    : `<span class="pk-ic none" style="width:${px}px;height:${px}px" aria-hidden="true">${defId ? name(defId).charAt(0) : "·"}</span>`;
}

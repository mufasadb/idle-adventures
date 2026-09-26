import iconManifest from "./assets/atlas-icon.json" with { type: "json" };
import monsterManifest from "./assets/atlas-monster.json" with { type: "json" };
import tileManifest from "./assets/atlas-tile.json" with { type: "json" };
// Bun's HTML bundler rewrites these imports to served asset URLs.
// @ts-expect-error Bun asset import
import iconAtlas from "./assets/atlas-icon.png";
// @ts-expect-error Bun asset import
import monsterAtlas from "./assets/atlas-monster.png";
// @ts-expect-error Bun asset import
import tileAtlas from "./assets/atlas-tile.png";

type Frame = { x: number; y: number; w: number; h: number };
type Manifest = { atlas: string; frames: Record<string, Frame> };

const manifests: Record<"tile" | "monster" | "icon", Manifest> = {
  tile: tileManifest,
  monster: monsterManifest,
  icon: iconManifest,
};

const atlasUrls: Record<keyof typeof manifests, string> = {
  tile: tileAtlas,
  monster: monsterAtlas,
  icon: iconAtlas,
};

export function frameStyle(kind: keyof typeof manifests, defId: string): string | null {
  const frame = manifests[kind].frames[defId];
  if (!frame) return null;
  return `background-image:url('${atlasUrls[kind]}');background-position:-${frame.x}px -${frame.y}px;width:${frame.w}px;height:${frame.h}px`;
}

export function tileStyle(terrain: string): string | null {
  return frameStyle("tile", terrain);
}

export function monsterStyle(creature: string): string | null {
  return frameStyle("monster", creature);
}

export function nodeIconId(kind: string, material?: string): string {
  if (material && manifests.icon.frames[material]) return material;
  const defaults: Record<string, string> = {
    wood: "oak-log",
    herb: "forest-herb",
    animal: "deer-hide",
    mining: "iron-ore",
  };
  return defaults[kind] ?? "";
}

export function iconStyle(defId: string): string | null {
  return frameStyle("icon", defId);
}

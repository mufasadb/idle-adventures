import iconManifest from "./assets/atlas-icon.json" with { type: "json" };
import monsterManifest from "./assets/atlas-monster.json" with { type: "json" };
import tileManifest from "./assets/atlas-tile.json" with { type: "json" };
import animManifest from "./assets/atlas-monster-anim.json" with { type: "json" };
import celIconManifest from "./assets/cel/atlas-icon.json" with { type: "json" };
import celMonsterManifest from "./assets/cel/atlas-monster.json" with { type: "json" };
import celTileManifest from "./assets/cel/atlas-tile.json" with { type: "json" };
// Bun's HTML bundler rewrites these imports to served asset URLs.
// @ts-expect-error Bun asset import
import iconAtlas from "./assets/atlas-icon.png";
// @ts-expect-error Bun asset import
import monsterAtlas from "./assets/atlas-monster.png";
// @ts-expect-error Bun asset import
import tileAtlas from "./assets/atlas-tile.png";
// @ts-expect-error Bun asset import
import animAtlas from "./assets/atlas-monster-anim.png";
// @ts-expect-error Bun asset import
import celIconAtlas from "./assets/cel/atlas-icon.png";
// @ts-expect-error Bun asset import
import celMonsterAtlas from "./assets/cel/atlas-monster.png";
// @ts-expect-error Bun asset import
import celTileAtlas from "./assets/cel/atlas-tile.png";

type Frame = { x: number; y: number; w: number; h: number };
type Manifest = { atlas: string; frames: Record<string, Frame> };
// Cel restyle (2026-10-07): hi-res frames drawn at the pixel frames' CSS size, so
// `scale` device px per CSS px; `size` is the whole atlas (for background-size).
type CelManifest = Manifest & { scale: number; size: { w: number; h: number } };
type Kind = "tile" | "monster" | "icon";

const manifests: Record<Kind, Manifest> = {
  tile: tileManifest,
  monster: monsterManifest,
  icon: iconManifest,
};

const atlasUrls: Record<Kind, string> = {
  tile: tileAtlas,
  monster: monsterAtlas,
  icon: iconAtlas,
};

const celManifests: Record<Kind, CelManifest> = {
  tile: celTileManifest as CelManifest,
  monster: celMonsterManifest as CelManifest,
  icon: celIconManifest as CelManifest,
};

const celUrls: Record<Kind, string> = {
  tile: celTileAtlas,
  monster: celMonsterAtlas,
  icon: celIconAtlas,
};

// Which art set wins. Cel frames are preferred wherever one exists and the pixel atlas
// fills the gaps; `?art=pixel` (remembered) shows the old set for comparison, `?art=cel` restores.
export type ArtSet = "cel" | "pixel";
function readArtSet(): ArtSet {
  try {
    const q = new URLSearchParams(globalThis.location?.search ?? "").get("art");
    if (q === "cel" || q === "pixel") globalThis.localStorage?.setItem("ia-art", q);
    return globalThis.localStorage?.getItem("ia-art") === "pixel" ? "pixel" : "cel";
  } catch {
    return "cel";
  }
}
let artSet: ArtSet = readArtSet();
export function setArtSet(set: ArtSet): void {
  artSet = set;
}

/** The cel frame for a key, when the cel set is active and has one. */
function celFrame(kind: Kind, defId: string): CelManifest["frames"][string] | null {
  return artSet === "cel" ? celManifests[kind].frames[defId] ?? null : null;
}

export function frameStyle(kind: Kind, defId: string): string | null {
  const cel = celFrame(kind, defId);
  if (cel) {
    const m = celManifests[kind], k = m.scale;
    return `background-image:url('${celUrls[kind]}');background-position:-${cel.x / k}px -${cel.y / k}px;background-size:${m.size.w / k}px ${m.size.h / k}px;width:${cel.w / k}px;height:${cel.h / k}px;image-rendering:auto`;
  }
  const frame = manifests[kind].frames[defId];
  if (!frame) return null;
  return `background-image:url('${atlasUrls[kind]}');background-position:-${frame.x}px -${frame.y}px;width:${frame.w}px;height:${frame.h}px`;
}

// 48l.12: a biome may have its own frame for a terrain (`desert:plains`); fall back to
// the shared terrain frame (woodland's) when it doesn't.
export function tileStyle(terrain: string, biomeId?: string): string | null {
  return (biomeId ? frameStyle("tile", `${biomeId}:${terrain}`) : null) ?? frameStyle("tile", terrain);
}

// 48l.9: approved idle loops. Each monster's frames sit in one atlas row, so a CSS
// steps() animation over background-position plays them; "pingpong" loops play forward
// then back (hides a visible wrap). Frames are larger than the static sprite by
// `origin` on each side, so the element is shifted down by the overhang to keep the
// creature's feet where the static sprite's were. Keyframes are injected once.
type Anim = { frameMs: number; frames: Frame[]; origin: { x: number; y: number }; playback: string; staticSize: number };
const anims = (animManifest as { anims: Record<string, { idle?: Anim }> }).anims;
if (typeof document !== "undefined") {
  const css = Object.entries(anims).map(([id, a]) => {
    const f = a.idle!.frames, first = f[0]!, n = f.length;
    const endX = a.idle!.playback === "pingpong" ? f[n - 1]!.x : first.x + n * first.w;
    return `@keyframes idle-${id} { from { background-position: -${first.x}px -${first.y}px; } to { background-position: -${endX}px -${first.y}px; } }`;
  }).join("\n");
  const el = document.createElement("style");
  el.textContent = `${css}\n@keyframes cel-breathe { 0%, 100% { transform: translateX(-50%) scaleY(1); } 50% { transform: translateX(-50%) scaleY(1.035); } }\n.sprite { transform-origin: 50% 100%; }\n@media (prefers-reduced-motion: reduce) { .sprite { animation: none !important; } }`;
  document.head.appendChild(el);
}

export function monsterStyle(creature: string): string | null {
  // a cel creature has no frame loop: it breathes (a CSS squash on the feet, see index.html)
  if (celFrame("monster", creature)) return `${frameStyle("monster", creature)};animation:cel-breathe 2400ms ease-in-out infinite`;
  const a = anims[creature]?.idle;
  if (!a) return frameStyle("monster", creature);
  const f = a.frames[0]!, n = a.frames.length;
  const overhang = f.h - a.staticSize - a.origin.y; // px the frame extends below the static sprite
  const timing = a.playback === "pingpong"
    ? `steps(${n - 1}, jump-none) infinite alternate`
    : `steps(${n}) infinite`;
  return `background-image:url('${animAtlas}');background-position:-${f.x}px -${f.y}px;width:${f.w}px;height:${f.h}px;margin-bottom:-${overhang}px;animation:idle-${creature} ${n * a.frameMs}ms ${timing}`;
}

// The hero has no pixel sprite (it was always the @ glyph), so only the cel set draws one.
export function playerStyle(): string | null {
  return celFrame("monster", "player") ? monsterStyle("player") : null;
}

export function nodeIconId(kind: string, material?: string): string {
  if (material && (manifests.icon.frames[material] || celManifests.icon.frames[material])) return material;
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

// 0m4: the walkable town's layers (one .webp each, prepared in the assets repo by
// py/town_prep.py). Keys match town-layout.ts's ART table + the hero's frames.
import townGround from "./assets/town/ground.webp";
import townBank from "./assets/town/bank.webp";
import townBoard from "./assets/town/board.webp";
import townWorkshop from "./assets/town/workshop.webp";
import townResearch from "./assets/town/research.webp";
import townStable from "./assets/town/stable.webp";
import townGateClosed from "./assets/town/gate-closed.webp";
import townGateOpen from "./assets/town/gate-open.webp";
import townCloth from "./assets/town/cloth.webp";
import townCart from "./assets/town/cart.webp";
import townPlot from "./assets/town/plot.webp";
import townSmokehouse from "./assets/town/smokehouse.webp";
import townAlchemist from "./assets/town/alchemist.webp";
import townAnvil from "./assets/town/anvil.webp";
import townStill from "./assets/town/still.webp";
import heroStandL from "./assets/town/hero/stand-left.webp";
import heroStandR from "./assets/town/hero/stand-right.webp";
import heroW1L from "./assets/town/hero/walk1-left.webp";
import heroW2L from "./assets/town/hero/walk2-left.webp";
import heroW3L from "./assets/town/hero/walk3-left.webp";
import heroW4L from "./assets/town/hero/walk4-left.webp";
import heroW1R from "./assets/town/hero/walk1-right.webp";
import heroW2R from "./assets/town/hero/walk2-right.webp";
import heroW3R from "./assets/town/hero/walk3-right.webp";
import heroW4R from "./assets/town/hero/walk4-right.webp";
import type { ArtKey } from "./town-layout";

export const TOWN_GROUND: string = townGround;
export const TOWN_ART: Record<ArtKey, string> = {
  bank: townBank, board: townBoard, workshop: townWorkshop, research: townResearch, stable: townStable,
  "gate-closed": townGateClosed, "gate-open": townGateOpen, cloth: townCloth, cart: townCart, plot: townPlot,
  smokehouse: townSmokehouse, alchemist: townAlchemist, anvil: townAnvil, still: townStill,
};
/** The hero's frames by facing: [stand, walk1..walk4]. */
export const HERO_FRAMES: Record<"left" | "right", readonly string[]> = {
  left: [heroStandL, heroW1L, heroW2L, heroW3L, heroW4L],
  right: [heroStandR, heroW1R, heroW2R, heroW3R, heroW4R],
};

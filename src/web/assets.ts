import iconManifest from "./assets/atlas-icon.json" with { type: "json" };
import monsterManifest from "./assets/atlas-monster.json" with { type: "json" };
import tileManifest from "./assets/atlas-tile.json" with { type: "json" };
import animManifest from "./assets/atlas-monster-anim.json" with { type: "json" };
// Bun's HTML bundler rewrites these imports to served asset URLs.
// @ts-expect-error Bun asset import
import iconAtlas from "./assets/atlas-icon.png";
// @ts-expect-error Bun asset import
import monsterAtlas from "./assets/atlas-monster.png";
// @ts-expect-error Bun asset import
import tileAtlas from "./assets/atlas-tile.png";
// @ts-expect-error Bun asset import
import animAtlas from "./assets/atlas-monster-anim.png";

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
  el.textContent = `${css}\n@media (prefers-reduced-motion: reduce) { .sprite { animation: none !important; } }`;
  document.head.appendChild(el);
}

export function monsterStyle(creature: string): string | null {
  const a = anims[creature]?.idle;
  if (!a) return frameStyle("monster", creature);
  const f = a.frames[0]!, n = a.frames.length;
  const overhang = f.h - a.staticSize - a.origin.y; // px the frame extends below the static sprite
  const timing = a.playback === "pingpong"
    ? `steps(${n - 1}, jump-none) infinite alternate`
    : `steps(${n}) infinite`;
  return `background-image:url('${animAtlas}');background-position:-${f.x}px -${f.y}px;width:${f.w}px;height:${f.h}px;margin-bottom:-${overhang}px;animation:idle-${creature} ${n * a.frameMs}ms ${timing}`;
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

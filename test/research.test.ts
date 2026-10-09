// 675 (D104): the fogged crafting tree + the town research table.
// Spec: docs/superpowers/specs/2026-10-09-crafting-fog-research-design.md
import { describe, expect, test } from "bun:test";
import type { GameEvent, GameState } from "../src/engine/types";
import { reduce } from "../src/engine/reduce";
import { newGame } from "../src/engine/town";
import { emptyLoadout } from "../src/engine/loadout";
import { enableRecipeFog, isRecipeKnown, itemTier, recipeKnowledge, recipeTier, recipeTierTable, progressTier } from "../src/engine/knowledge";
import { researchCandidates, researchMatches, researchStatus, tokens } from "../src/engine/research";
import { legalActions, whyNot } from "../src/sim/legal";
import { play } from "../src/sim/play";
import { formatEvent, rejectCopy } from "../src/render/render";
import { RECIPE, RESEARCH_KEYWORDS, RESEARCH_SEARCHES_PER_INK, STARTER_RECIPES, MAP_TIER_MAX, RECIPE_TIER_OVERRIDE } from "../src/data/constants";
import { scanForPoi, standingOn, town } from "./helpers";

const fresh = (seed = "fog") => newGame(seed, { recipeFog: true });
const ev = <T extends GameEvent["type"]>(events: GameEvent[], type: T) =>
  events.find((e): e is Extract<GameEvent, { type: T }> => e.type === type);
const rejection = (events: GameEvent[]) => ev(events, "action-rejected")?.reason ?? null;

describe("knowledge rules", () => {
  test("a fresh fogged game knows exactly the starter tools", () => {
    const g = fresh();
    expect(g.recipeFog).toBe(true);
    const known = recipeKnowledge(g).filter((k) => k.status === "known").map((k) => k.recipeId);
    expect(known.sort()).toEqual([...STARTER_RECIPES].sort());
    expect(isRecipeKnown(g, "small-backpack")).toBe(false);
  });

  test("'next': holding every input makes a recipe known", () => {
    const g: GameState = { ...fresh(), seen: ["ration", "potion", "deer-hide"] };
    expect(isRecipeKnown(g, "small-backpack")).toBe(true); // 1× deer-hide
    expect(isRecipeKnown(g, "ration-venison")).toBe(true);
    expect(isRecipeKnown(g, "tent")).toBe(false); // deer-hide + pine-log — pine never held
  });

  test("crafted and revealed recipes are known", () => {
    expect(isRecipeKnown({ ...fresh(), crafted: ["tent"] }, "tent")).toBe(true);
    const rev: GameState = { ...fresh(), revealed: ["tent"] };
    expect(isRecipeKnown(rev, "tent")).toBe(true);
    const row = recipeKnowledge(rev).find((k) => k.recipeId === "tent")!;
    expect(row.status).toBe("revealed");
    expect(row.inputs.map((i) => i.status)).toEqual(["unknown", "unknown"]);
  });

  test("fog off (old saves, terse states) knows everything", () => {
    const t = town([]);
    for (const id of Object.keys(RECIPE)) expect(isRecipeKnown(t, id)).toBe(true);
    expect(recipeKnowledge(t).every((k) => k.status === "known")).toBe(true);
  });

  test("the hook folds held items into seen + crafted ids into crafted, only with fog on", () => {
    const g: GameState = { ...fresh(), bank: [...fresh().bank, { defId: "flint", qty: 1 }] };
    const r = reduce(g, { type: "craft", recipeId: "knife" });
    expect(ev(r.events, "crafted")).toBeDefined();
    expect(r.state.seen).toContain("knife");
    expect(r.state.crafted).toEqual(["knife"]);
    // fog off: no knowledge fields appear
    const off = reduce(town([{ defId: "flint", qty: 1 }]), { type: "craft", recipeId: "knife" });
    expect(off.state.seen).toBeUndefined();
    expect(off.state.crafted).toBeUndefined();
  });

  test("a rejected action returns the ORIGINAL state object, fog on", () => {
    const g = fresh();
    const r = reduce(g, { type: "craft", recipeId: "knife" }); // no flint
    expect(r.state).toBe(g);
  });

  test("progress tier: the highest map tier embarked on or held", () => {
    expect(progressTier(fresh())).toBe(1);
    expect(progressTier({ ...fresh(), maxTier: 3 })).toBe(3);
    expect(progressTier({ ...fresh(), maps: [{ mapSeed: "m", biomeId: "tundra", vintage: 0, tier: 2 }] })).toBe(2);
    // embarking a held T2 map raises maxTier
    const g: GameState = { ...fresh(), maps: [{ mapSeed: "held-t2", biomeId: "woodland", vintage: 0, tier: 2 }] };
    const r = reduce(g, { type: "embark", mapSeed: "held-t2" });
    expect(r.state.maxTier).toBe(2);
  });
});

describe("craft gating", () => {
  // A hand-built state whose bank holds the hide but whose `seen` predates it.
  const unseen = (): GameState => ({ ...fresh(), bank: [{ defId: "deer-hide", qty: 1 }], seen: [] });

  test("an unknown recipe is rejected with fog on, allowed with fog off", () => {
    expect(rejection(reduce(unseen(), { type: "craft", recipeId: "small-backpack" }).events)).toBe("recipe-unknown");
    expect(whyNot(unseen(), { type: "craft", recipeId: "small-backpack" })).toBe("recipe-unknown");
    const off = { ...unseen(), recipeFog: false };
    expect(rejection(reduce(off, { type: "craft", recipeId: "small-backpack" }).events)).toBeNull();
  });

  test("legalActions never offers an unknown craft", () => {
    expect(legalActions(unseen()).some((a) => a.type === "craft")).toBe(false);
  });

  test("field recipes follow the same rule", () => {
    const { seed, poi } = scanForPoi("fog-field", (p) => p.kind === "herb");
    const base = standingOn(seed, poi, { tools: ["fire-kit"], energy: 200 });
    const exp = { ...base.expedition!, carry: [{ defId: "berries", qty: 2 }, { defId: "oak-log", qty: 1 }] };
    const fogged: GameState = { ...base, expedition: exp, recipeFog: true, seen: [] };
    expect(rejection(reduce(fogged, { type: "craft", recipeId: "cooked-berries" }).events)).toBe("recipe-unknown");
    const knows: GameState = { ...fogged, seen: ["berries", "oak-log"] };
    expect(ev(reduce(knows, { type: "craft", recipeId: "cooked-berries" }).events, "crafted")).toBeDefined();
  });

  test("rejectCopy points at the two ways to learn a recipe", () => {
    expect(rejectCopy("recipe-unknown")).toContain("research table");
    expect(rejectCopy("no-research")).toContain("ink");
  });
});

describe("a fresh fogged game can progress (the motivating bug: the bag recipe was unfindable)", () => {
  test("starter tools are craftable from the first flint + deadwood", () => {
    const g: GameState = { ...fresh(), bank: [...fresh().bank, { defId: "flint", qty: 4 }, { defId: "deadwood", qty: 3 }] };
    for (const id of STARTER_RECIPES) expect(whyNot(g, { type: "craft", recipeId: id })).toBeNull();
  });

  test("hunting a deer-hide makes small-backpack known; home, it crafts", () => {
    const { seed, poi } = scanForPoi("fog-hide", (p) => p.kind === "animal" && p.material === "deer-hide");
    const g = fresh();
    const exp = standingOn(seed, poi, { tools: ["trap", "knife"], energy: 300 }).expedition!;
    const onRun: GameState = { ...g, phase: "expedition", expedition: { ...exp, hp: 30 } };
    expect(isRecipeKnown(onRun, "small-backpack")).toBe(false);
    const hunted = reduce(onRun, { type: "gather" });
    expect(ev(hunted.events, "gathered")?.material).toBe("deer-hide");
    expect(isRecipeKnown(hunted.state, "small-backpack")).toBe(true);
    const home = reduce(hunted.state, { type: "return" }).state;
    expect(home.phase).toBe("town");
    expect(legalActions(home)).toContainEqual({ type: "craft", recipeId: "small-backpack" });
    expect(ev(reduce(home, { type: "craft", recipeId: "small-backpack" }).events, "crafted")).toBeDefined();
  });

  test("the console driver starts fogged; tests/harness default stays unfogged", () => {
    expect(play("p", [], { recipeFog: true }).state.recipeFog).toBe(true);
    expect(play("p", []).state.recipeFog).toBeUndefined();
    expect(newGame("p").recipeFog).toBeUndefined();
  });
});

describe("research table", () => {
  const withInk = (): GameState => ({ ...fresh(), bank: [...fresh().bank, { defId: "ore-ink", qty: 1 }] });

  test("a hit reveals ONE matching recipe, its direct inputs, spends the free search", () => {
    const r = reduce(fresh(), { type: "research", query: "backpack" });
    const hit = ev(r.events, "research-hit")!;
    expect(hit).toBeDefined();
    expect(researchMatches("backpack")).toContain(hit.recipeId);
    expect(hit.free).toBe(true);
    expect(hit.inputs).toEqual(RECIPE[hit.recipeId]!.inputs);
    expect(r.state.revealed).toEqual([hit.recipeId]);
    expect(r.state.heard).toEqual(hit.inputs.map((i) => i.defId).filter((d) => !["ration", "potion"].includes(d)));
    expect(r.state.freeResearchRun).toBe(0);
    expect(isRecipeKnown(r.state, hit.recipeId)).toBe(true);
    expect(formatEvent(hit, (d) => d)).toContain("research");
  });

  test("no search left → 'no-research', state untouched", () => {
    const spent = reduce(fresh(), { type: "research", query: "bag" }).state;
    const r = reduce(spent, { type: "research", query: "boat" });
    expect(rejection(r.events)).toBe("no-research");
    expect(r.state).toBe(spent);
  });

  test("a miss COSTS the search (user 2026-10-09) and reads 'Nobody in town has heard of that.'", () => {
    const r = reduce(fresh(), { type: "research", query: "xyzzy" });
    const miss = ev(r.events, "research-miss")!;
    expect(miss).toEqual({ type: "research-miss", query: "xyzzy", free: true, charges: 0 });
    expect(formatEvent(miss, (d) => d)).toContain("Nobody in town has heard of that.");
    expect(r.state.freeResearchRun).toBe(0); // free search spent
    expect(r.state.revealed).toBeUndefined();
    // with the free search gone, a miss spends a bought charge
    const charged = reduce({ ...r.state, researchCharges: 2 }, { type: "research", query: "xyzzy" });
    expect(ev(charged.events, "research-miss")).toMatchObject({ free: false, charges: 1 });
    expect(charged.state.researchCharges).toBe(1);
  });

  test("beyond-tier matches miss with the SAME line (no spoiler) and still cost; in reach they hit", () => {
    expect(researchMatches("dragon")).toContain("wyrmfang");
    const day1 = reduce(fresh(), { type: "research", query: "dragon" });
    const miss = ev(day1.events, "research-miss")!;
    expect(miss).toEqual({ type: "research-miss", query: "dragon", free: true, charges: 0 }); // identical shape to a nonsense word
    expect(formatEvent(miss, (d) => d).replace("dragon", "Q")).toBe(formatEvent({ type: "research-miss", query: "xyzzy", free: true, charges: 0 }, (d) => d).replace("xyzzy", "Q"));
    expect(day1.state.revealed).toBeUndefined();
    expect(day1.state.freeResearchRun).toBe(0);
    const deep = reduce({ ...fresh(), maxTier: 3 }, { type: "research", query: "dragon" });
    const hit = ev(deep.events, "research-hit")!;
    expect(recipeTier(hit.recipeId)).toBeLessThanOrEqual(4);
  });

  test("a word whose in-reach matches are all known says so (and costs, like any miss)", () => {
    const r = reduce(fresh(), { type: "research", query: "knife" });
    // knife is a starter; fletchers-knife (T1) is unknown → it can still be found
    expect(ev(r.events, "research-hit")?.recipeId).toBe("fletchers-knife");
    const again = reduce({ ...r.state, researchCharges: 1 }, { type: "research", query: "knife" });
    expect(ev(again.events, "research-miss")?.alreadyKnown).toBe(true);
    expect(again.state.researchCharges).toBe(0);
  });

  test("buy-research: 1 ink → RESEARCH_SEARCHES_PER_INK charges; free first, then charges", () => {
    const bought = reduce(withInk(), { type: "buy-research", inkId: "ore-ink" });
    expect(ev(bought.events, "research-bought")).toEqual({ type: "research-bought", inkId: "ore-ink", charges: RESEARCH_SEARCHES_PER_INK });
    expect(bought.state.bank.some((s) => s.defId === "ore-ink")).toBe(false);
    expect(legalActions(withInk())).toContainEqual({ type: "buy-research", inkId: "ore-ink" });
    const first = reduce(bought.state, { type: "research", query: "armour" });
    expect(ev(first.events, "research-hit")?.free).toBe(true);
    expect(first.state.researchCharges).toBe(RESEARCH_SEARCHES_PER_INK);
    const second = reduce(first.state, { type: "research", query: "armour" });
    const hit2 = ev(second.events, "research-hit")!;
    expect(hit2.free).toBe(false);
    expect(hit2.charges).toBe(RESEARCH_SEARCHES_PER_INK - 1);
    expect(second.state.researchCharges).toBe(RESEARCH_SEARCHES_PER_INK - 1);
    expect(researchStatus(second.state)).toMatchObject({ freeAvailable: false, charges: RESEARCH_SEARCHES_PER_INK - 1 });
  });

  test("buy-research refusals: no ink, a non-research ink, not in town", () => {
    expect(rejection(reduce(fresh(), { type: "buy-research", inkId: "ore-ink" }).events)).toBe("insufficient");
    expect(rejection(reduce({ ...withInk(), bank: [{ defId: "potion", qty: 1 }] }, { type: "buy-research", inkId: "potion" }).events)).toBe("insufficient");
    const away: GameState = { ...withInk(), phase: "expedition" };
    expect(rejection(reduce(away, { type: "buy-research", inkId: "ore-ink" }).events)).toBe("not-in-town");
    expect(rejection(reduce(away, { type: "research", query: "bag" }).events)).toBe("not-in-town");
  });

  test("the free search refreshes after a trip (runs advances)", () => {
    const spent = reduce(fresh(), { type: "research", query: "bag" }).state;
    expect(researchStatus(spent).freeAvailable).toBe(false);
    expect(researchStatus({ ...spent, runs: 1 }).freeAvailable).toBe(true);
  });

  test("deterministic: same seed + state + query → same reveal", () => {
    const a = reduce(fresh("det"), { type: "research", query: "armour" });
    const b = reduce(fresh("det"), { type: "research", query: "armour" });
    expect(ev(a.events, "research-hit")!.recipeId).toBe(ev(b.events, "research-hit")!.recipeId);
  });

  test("query normalisation: case, punctuation, stopwords, plurals, prefixes", () => {
    expect(tokens("  The BAGS!! ")).toEqual(["bag"]);
    expect(tokens("berries")).toEqual(["berry"]);
    expect(researchMatches("Backpacks")).toContain("small-backpack");
    expect(researchMatches("knif")).toContain("knife"); // prefix ≥ RESEARCH_MIN_PREFIX
    expect(researchMatches("bo")).toEqual([]); // too short for a prefix, matches nothing whole
    expect(researchMatches("")).toEqual([]);
    expect(researchCandidates(fresh(), "boat").candidates).toContain("raft");
  });

  test("plurals: regular, -ies, -es and irregulars all singularise", () => {
    expect(tokens("knives wolves leaves geese")).toEqual(["knife", "wolf", "leaf", "goose"]);
    expect(tokens("torches boxes potatoes arrows")).toEqual(["torch", "box", "potato", "arrow"]);
    expect(tokens("glass cactus")).toEqual(["glass", "cactus"]); // not plurals
    expect(researchMatches("knives")).toContain("knife");
    expect(researchMatches("wolves")).toContain("warg-jerkin");
    expect(researchMatches("potions")).toContain("potion");
    expect(researchMatches("axes")).toContain("axe");
  });

  test("synonyms + categories + spellings expand generously", () => {
    expect(researchMatches("armor")).toEqual(researchMatches("armour")); // US/UK
    expect(researchMatches("armor")).toContain("plate-helmet");
    const weapons = researchMatches("weapon");
    for (const id of ["sword", "bow", "fire-staff", "club", "wyrmfang", "blowgun"]) expect(weapons).toContain(id);
    const food = researchMatches("food");
    for (const id of ["ration", "jam", "stew", "smoked-fish", "pemmican"]) expect(food).toContain(id);
    expect(researchMatches("boat")).toEqual(expect.arrayContaining(["raft", "longboat"]));
    expect(researchMatches("bag")).toEqual(expect.arrayContaining(["small-backpack", "large-pack", "panniers", "map-satchel"]));
    expect(researchMatches("potion")).toEqual(expect.arrayContaining(["draught", "elixir-of-power", "fire-flask", "antidote"]));
    expect(researchMatches("rucksack")).toContain("small-backpack"); // a plain keyword synonym
    expect(researchMatches("canoes")).toContain("longboat"); // plural + synonym
  });

  test("multi-word names match whole, split, or run together", () => {
    expect(researchMatches("fire kit")).toContain("fire-kit");
    expect(researchMatches("firekit")).toContain("fire-kit");
    expect(researchMatches("Small Backpack")).toContain("small-backpack");
    expect(researchMatches("smallbackpack")).toContain("small-backpack");
  });
});

describe("data", () => {
  test("every recipe output has ≥ 6 research keywords", () => {
    const missing = [...new Set(Object.values(RECIPE).map((r) => r.output.defId))].filter((d) => (RESEARCH_KEYWORDS[d]?.length ?? 0) < 6);
    expect(missing).toEqual([]);
  });

  test("every recipe input has a source (finite item tier)", () => {
    const inputs = new Set(Object.values(RECIPE).flatMap((r) => [...r.inputs.map((i) => i.defId), ...(r.requires?.tools ?? [])]));
    expect([...inputs].filter((d) => !Number.isFinite(itemTier(d)))).toEqual([]);
  });

  test("overrides name real recipes", () => {
    for (const id of Object.keys(RECIPE_TIER_OVERRIDE)) expect(RECIPE[id]).toBeDefined();
  });

  // The derived + overridden tier table, pinned so a data change that moves a recipe's
  // tier shows up as a diff here (review it like a balance table).
  test("recipe tier table", () => {
    const by: Record<number, string[]> = {};
    for (const [id, t] of Object.entries(recipeTierTable())) (by[t] ??= []).push(id);
    expect(Math.max(...Object.keys(by).map(Number))).toBeLessThanOrEqual(MAP_TIER_MAX);
    expect(by).toEqual({
      1: ["ration", "ration-sage", "ration-moss", "ration-venison", "ration-game", "ration-jerky", "jam", "potion", "ore-ink", "herb-ink", "club", "knife", "axe", "pick", "trap", "iron-pick", "iron-axe", "spyglass", "raft", "small-backpack", "leather", "bowstring", "arrows", "fletchers-knife", "arrow-shaft", "arrows-fletched", "fire-kit", "cooked-berries", "cooking-pot", "fishing-rod", "grilled-pike", "crayfish-boil", "glassware", "glass-vial", "water-vial", "draught", "field-draught", "blacksmiths-hammer", "sword", "iron-sword", "bow", "blowgun", "blow-dart", "fire-staff", "light-chest", "light-legs", "robe-chest", "robe-hood", "ration-boar", "trail-ration-raider", "plate-boots-beetle", "fire-staff-wisp", "ration-crab", "blubber-stew", "apple-jam", "antidote"],
      2: ["pemmican", "iron-ore-bog", "potion-leech", "trail-ration", "greater-potion", "steel-pick", "steel-axe", "pearl-spyglass", "climbing-pick", "longboat", "raft-driftwood", "waders", "ice-cleats", "tent", "canteen", "large-pack", "map-satchel", "map-case", "horse", "wagon", "panniers", "cooked-venison", "grilled-tuna", "smoked-fish", "stew", "smokehouse", "draught-kelp", "anvil", "toxin-dart", "silver-sword", "steel-sword", "composite-bow", "inferno-staff", "plate-helmet", "plate-chest", "plate-legs", "quiver", "plate-boots", "plate-gloves", "steel-plate-helmet", "steel-plate-chest", "steel-plate-legs", "steel-plate-boots", "steel-plate-gloves", "studded-chest", "studded-legs", "turtle-shell-helm", "enchanted-chest", "enchanted-hood", "warg-jerkin", "scorpion-plate-chest", "plate-legs-lurker", "smoked-venison", "elixir-of-power-thistle", "scale-jerky", "antidote-venom", "filter-mask", "whetstone"],
      3: ["alchemical-desk", "greater-draught", "venom-dart", "mithril-sword", "mithril-plate-helmet", "mithril-plate-chest", "mithril-plate-legs", "mithril-plate-boots", "mithril-plate-gloves", "large-pack-troll", "elixir-of-power", "warding-draught", "still", "fire-flask", "venom-flask", "spore-bomb", "silver-oil", "drake-oil", "venom-oil"],
      4: ["dragonscale-cuirass"],
      5: ["wyrmfang"],
    });
  });
});

describe("old saves + migration", () => {
  test("an old save (no new fields) reduces exactly as before", () => {
    const old: GameState = { seed: "old", phase: "town", bank: [{ defId: "deer-hide", qty: 1 }], loadout: emptyLoadout(), expedition: null, runs: 4 };
    const r = reduce(old, { type: "craft", recipeId: "small-backpack" });
    expect(r.state).toEqual({ ...old, bank: [{ defId: "small-backpack", qty: 1 }] });
  });

  test("enableRecipeFog seeds seen/crafted/maxTier from what you hold; idempotent", () => {
    const old: GameState = {
      seed: "old", phase: "town", expedition: null, runs: 4,
      bank: [{ defId: "ration", qty: 3 }, { defId: "small-backpack", qty: 1 }, { defId: "oak-log", qty: 2 }],
      loadout: emptyLoadout(),
      maps: [{ mapSeed: "m", biomeId: "tundra", vintage: 1, tier: 2 }],
      stations: ["anvil"],
    };
    const on = enableRecipeFog(old);
    expect(on.recipeFog).toBe(true);
    expect(on.seen).toEqual(["ration", "small-backpack", "oak-log", "anvil"]);
    expect(on.crafted).toEqual(["small-backpack", "anvil"]); // ration is a starter-kit item — not evidence
    expect(on.maxTier).toBe(2);
    expect(isRecipeKnown(on, "small-backpack")).toBe(true);
    expect(enableRecipeFog(on)).toEqual(on);
  });
});

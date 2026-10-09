// The engine contract — single source of truth for state, actions, events.
// Lifted from the design spec §10. Pure data; no behaviour here.
import type { BiomeId, Terrain, NodeType, StationId, FishWater } from "../data/constants";
import type { Matchup } from "./combat"; // type-only: erased at runtime, no import cycle

export type ItemStack = { defId: string; qty: number }; // fungible; gear referenced by defId too

export type Equipment = {
  weapon: string | null; // defId → { dmgType: melee|ranged|magic, tags:[silver|...] } in the catalog
  helmet: string | null;
  chest: string | null;
  legs: string | null;
  boots: string | null;
  gloves: string | null; // each piece's defId → { armourType: plate|light|robe, defense }
  tools: string[]; // pick, axe, fishing rod, spyglass — capabilities
  transport: string | null;
  backpack: string | null;
  panniers: string | null; // saddlebags (zhn): extra carry, only works with a beast transport
  quiver?: string | null; // ke3.7.1 (D92): holds QUIVER_AMMO_CAP ammo outside carry. Optional/absent = null (old saves)
};

export type Loadout = {
  equipment: Equipment;
  food: ItemStack[];
  potions: ItemStack[];
  battleItems: ItemStack[]; // combat consumables (bzd): used mid-fight via use-item (90j), buff that one fight
  spares?: ItemStack[]; // spare gear packed into carry slots (82r): 1 slot per piece; expanded into expedition.carry at embark. Optional/absent = [] (old saves, terse test states); reads guard with `?? []`.
  ammo?: ItemStack[]; // arrows (D45): spent 1/exchange while a bow is wielded; stacks ARROW_STACK_CAP per slot (consumableSlots counts ceil); unspent ammo banks back at run end. Optional/absent = []; reads guard with `?? []`.
  flasks?: ItemStack[]; // alchemist flasks (si7.6.9.1, D97): thrown by `throw`, FLASK_STACK_CAP per slot; unthrown ones bank back. Optional/absent = []; reads guard with `?? []`.
  enhancements?: ItemStack[]; // weapon enhancements (D60): whetstone/oils packed like battle-items (1 slot/unit, no stacking); applied mid-run by the `enhance` action, unused ones bank back. Optional/absent = []; reads guard with `?? []`.
};

// A pocketed map (xzx): a single-use snapshot of an offered map you chose to keep.
// vintage = `runs` when pocketed — flavour only ("N runs old"), no mechanic.
export type MapItem = { mapSeed: string; biomeId: BiomeId; vintage: number; tier?: number; affixes?: string[]; inkCount?: number; hints?: string[]; studied?: number };
// tier: map tier (2yn), drives generation scaling. Optional/absent = 1; read with `?? 1`.
// affixes: cartography affixes applied by inking (cxq), read as generateGrid weight
//   multipliers. Optional/absent = [] (old saves, un-inked maps); read with `?? []`.
// inkCount: how many times this map has been inked (cxq) — seeds the affix roll so
//   re-inking a domain can land a different affix. Optional/absent = 0; read with `?? 0`.
// hints: hint ids in reveal order, rolled at mint (3iq, D95). Optional/absent = re-derive
//   via town.mapHintIds (old saves). studied: how many are revealed. Absent = 0; `?? 0`.

// A live combat engagement (si7.1): combat is no longer atomic — `fight` runs
// one exchange per action, `flee`/`quaff` are the mid-fight decisions. Battle-
// item buffs are consumed at engagement START and persist here for its rounds.
export type Engagement = {
  at: { x: number; y: number };
  creature: string;
  monsterHp: number;
  moveOnWin: boolean; // walked in (relocate on victory) vs stood and fought
  damageAdd: number;
  mitigationAdd: number;
  startHp: number; // for the terminal fought event's hpLost
  potionsUsed: number; // accumulated across rounds + manual quaffs
  ranged?: boolean; // engaged from an adjacent tile with a bow (D45). Optional/absent = false; reads guard with `?? false`.
  opener?: boolean; // ranged opener pending (D45): the FIRST exchange skips the monster's retaliation, then this clears. Optional/absent = false; reads guard with `?? false`.
  round?: number; // strikes landed so far this fight (si7.6.9.2): keys the venom roll. Optional/absent = 0.
  struck?: boolean; // any strike (swing or throw) has landed this fight (si7.6.9.1): a throw before it is the free opener. Optional/absent = false.
  poison?: { dmg: number; rounds: number }; // weapon-enhancement poison DoT (D60): set/refreshed when a poison-coated strike lands; the monster loses `dmg` each round end, `rounds` decrements, clears at 0. INDEPENDENT of weaponBuff.charges — already-delivered poison keeps ticking after the coating wears off or you flee. Optional/absent = not poisoned. This is the state si7.6.6's blowdart reuses.
};

export type Expedition = {
  mapSeed: string;
  pos: { x: number; y: number };
  energy: number; // CURRENT stamina (dtv): starts at maxEnergy on embark, drained by move/gather, refilled by eating food
  hp: number; // drained by combat, refilled by potions
  loadout: Loadout;
  carry: ItemStack[]; // capped by backpack slots
  cleared: { x: number; y: number }[]; // POIs consumed this run (D24): gathered nodes; M4 adds defeated monsters
  fished?: { x: number; y: number }[]; // water tiles already fished this run (si7.6.2) — one catch per tile. Optional/absent = [] (old saves, terse test states)
  // grid regenerated from mapSeed on demand, not stored
  maxEnergy?: number; // stamina ceiling (dtv): set to MAX_ENERGY at embark (gear-raisable later). Optional/absent = MAX_ENERGY (old saves, terse test states); reads guard with `?? MAX_ENERGY`.
  autoEatFood?: string; // designated auto-eat food (mco): a food defId. When set, autoRefill eats ONLY units of this food, waste-free, after each spend. Absent/undefined = auto-eat OFF (nothing auto-eats). Supersedes the old autoEat boolean + least-dense-first (D48). Set via set-auto-eat-food.
  carriedMaps?: MapItem[]; // map-scroll drops carried home (8ec): each costs ONE carry slot for the run; banked into GameState.maps at run end. Optional/absent = [] (old saves, terse test states); reads guard with `?? []`.
  combat?: Engagement; // live engagement (si7.1). Optional/absent = not engaged; reads guard with `?? undefined` checks.
  autoQuaff?: boolean; // auto-potion at the threshold inside exchanges (si7.1, mirrors autoEat). Optional/absent = true; reads guard with `?? true`.
  autoFinish?: boolean; // auto-finish fights (67e): when true, a fight/engage resolves the WHOLE fight to victory or defeat in one action. Optional/absent = OFF; reads guard with `?? false`.
  campMealsUsed?: number; // tent "camp meals" spent this expedition (7lr): a tent lets you over-eat past max (+TENT_FOOD_MULTIPLIER) TENT_CAMP_MEALS times per run. Fresh per embark; reads guard with `?? 0`.
  autoGather?: boolean; // auto-interact with nodes the direct-line walk crosses (eot): ON ⇒ gather each node stepped over, pausing only on a full bag. Optional/absent = ON; reads guard with `?? true`. Flipped by toggle-auto-gather.
  biomeId?: BiomeId; // D93: the biome the map ROLLED when it was minted/offered, frozen onto the run at embark — a held map never re-rolls. Absent (old saves) = re-derive via rollBiome(mapSeed, mapTier)
  mapTier?: number; // this run's map tier (2yn): set at embark from the chosen map's tier
                    // (offered map = 1, held MapItem = its tier). Optional/absent = 1.
  surveyed?: { x: number; y: number }[]; // POIs resolved at range by the survey action (54f): perceive treats these as always-in-radius. Optional/absent = [] (old saves, terse test states); reads guard with `?? []`.
  affixes?: string[]; // cartography affixes carried from the embarked map (cxq): fed to expeditionGrid so the in-run grid matches what was inked. Optional/absent = []; reads guard with `?? []`.
  poisoned?: { dmg: number; ticks: number }; // YOUR poison (si7.6.9.2, D98): a venomous monster's hit sets it; loses `dmg` HP per combat round or map step (never below PLAYER_POISON_FLOOR), `ticks` counts down, an antidote clears it. Optional/absent = not poisoned.
  weaponBuff?: { id: string; charges: number }; // active weapon enhancement (D60): a whetstone/oil coating applied mid-run via `enhance`. `id` is a WEAPON_ENHANCEMENT key; `charges` = remaining player strikes before it clears. Rides the EXPEDITION, not the weapon (no per-instance item state). Applying a new one REPLACES this (charges lost). Optional/absent = no enhancement; reads guard with `?? undefined`.
};

export type GameState = {
  seed: string;
  phase: "town" | "expedition";
  bank: ItemStack[]; // materials + crafted gear (persists across runs)
  loadout: Loadout; // town-side staging (D22): pack (M5) edits it, embark consumes it
  expedition: Expedition | null;
  runs?: number; // completed expeditions — advances the candidate-map offer so town shows FRESH maps each visit (not the same 3 forever). Optional/absent = 0 (old saves, terse test states); reads guard with `?? 0`.
  maps?: MapItem[]; // held maps (xzx): pocketed from the offer, consumed on embark. Optional/absent = [] (old saves, terse test states); reads guard with `?? []`.
  stations?: StationId[]; // built home stations (ke3): non-bank permanent infra that gates deep recipes. Optional/absent = [] (old saves, pre-ke3 states); reads guard with `?? []`. Written by crafting a recipe with `buildsStation` (ke3.2).
  // --- Crafting fog + research table (675, D104) ---
  recipeFog?: boolean; // the recipe book is fogged: only KNOWN recipes (starter / crafted / revealed / "next") can be crafted. Optional/absent = false (old saves, terse test states, the balance sim + harness). newGame(seed, { recipeFog: true }) or enableRecipeFog turns it on.
  seen?: string[]; // defIds EVER held in bank/loadout/carry (675): drives "next" knowledge. Maintained by reduce's knowledge hook ONLY while recipeFog is on. Optional/absent = []; `?? []`.
  crafted?: string[]; // recipe ids ever crafted (675). Maintained while recipeFog is on. Optional/absent = []; `?? []`.
  revealed?: string[]; // recipe ids revealed by the research table (675). Optional/absent = []; `?? []`.
  heard?: string[]; // input defIds named by a research reveal that you hadn't held yet (675) — the web shows them as greyed named nodes. Append-only; filter by `seen` for "still only heard of". Optional/absent = []; `?? []`.
  maxTier?: number; // highest map tier embarked on (675): research's progress tier. Maintained while recipeFog is on. Optional/absent = 1; `?? 1`.
  researchCharges?: number; // bought research searches (RESEARCH_SEARCHES_PER_INK per ink, 675). Optional/absent = 0; `?? 0`.
  freeResearchRun?: number; // the `runs` value at which the free search(es) were last spent (675); free searches refresh when `runs` differs. Optional/absent = never spent; read as-is.
  freeResearchUsed?: number; // free searches spent at `freeResearchRun` (675) — lets RESEARCH_FREE_PER_TRIP exceed 1. Optional/absent = 0; `?? 0`.
};

// Loadout slots an action can target when packing.
export type LoadoutSlot =
  | "weapon"
  | "helmet"
  | "chest"
  | "legs"
  | "boots"
  | "gloves"
  | "tool"
  | "transport"
  | "backpack"
  | "panniers"
  | "quiver" // ke3.7.1 (D92)
  | "food"
  | "potion"
  | "battle-item"
  | "spare" // spare gear into carry slots (82r): any gear defId, 1 slot per piece
  | "ammo" // arrows (D45): packed like potions, but slots count ceil(units/ARROW_STACK_CAP)
  | "flask" // alchemist flasks (si7.6.9.1): FLASK_STACK_CAP per slot
  | "enhancement"; // weapon enhancements (D60): whetstone/oils, packed like a battle-item (1 slot/unit, no stacking)

export type Action =
  | { type: "craft"; recipeId: string }
  | { type: "pack"; slot: LoadoutSlot; itemId: string }
  | { type: "embark"; mapSeed: string }
  | { type: "study"; mapSeed: string } // spend STUDY_COST to reveal a held map's next hint (3iq, D95)
  | { type: "ink"; mapSeed: string; inkId: string } // apply a crafted ink to a held map (cxq): rolls + writes an affix from the ink's domain
  | { type: "move"; to: { x: number; y: number } } // steps ONE tile toward target
  | { type: "gather" }
  | { type: "fish" } // cast a fishing-rod (si7.6.2) into the deepest unfished water tile on or beside you
  | { type: "fight"; at?: { x: number; y: number } } // engage the monster on your tile, or run ONE exchange when engaged (si7.1); `at` = an ADJACENT live monster tile to engage at range with a wielded bow + ≥1 arrow (D45)
  | { type: "flee" } // disengage at the cost of one parting hit (si7.1)
  | { type: "quaff" } // drink one potion: mid-engagement (no exchange, si7.1) or on the map for QUAFF_ENERGY (82r)
  | { type: "use-item"; itemId: string } // use a packed battle item mid-fight (90j): manual-only, no auto-consume; adds its COMBAT_BUFF for THIS engagement, no exchange (mirrors quaff)
  | { type: "throw"; itemId: string; at?: { x: number; y: number } } // throw a flask (si7.6.9.1, D97): engages the monster on your tile or an ADJACENT one (no step), or throws as this round's strike when engaged. The fight's first strike, if thrown, draws no retaliation
  | { type: "enhance"; id: string } // apply a weapon enhancement (D60): sets Expedition.weaponBuff from a held enhancement stack; usable engaged or unengaged, no exchange, no energy (mirrors use-item/quaff)
  | { type: "survey"; at: { x: number; y: number } } // spend SURVEY_ENERGY to resolve one far POI's detail at range with a vision tool (54f)
  | { type: "don"; itemId: string } // equip a carried gear piece into its slot, displacing the worn one to carry (82r)
  | { type: "doff"; itemId: string } // unequip a worn piece / remove a tool to carry (82r)
  | { type: "toggle-auto-quaff" } // flip auto-potion-at-threshold (si7.1)
  | { type: "toggle-auto-finish" } // flip auto-finish-fights (67e): resolve a whole fight in one action
  | { type: "toggle-auto-gather" } // flip auto-interact-on-walk (eot)
  | { type: "eat"; defId: string } // eat one unit of a CHOSEN food now (7lr): additive, capped at max — UNLESS a tent turns it into the once-per-run camp meal (over-max + TENT_FOOD_MULTIPLIER)
  | { type: "set-auto-eat-food"; defId: string | null } // designate the food that auto-eats waste-free (mco); null clears it (auto-eat off). Supersedes toggle-auto-eat.
  | { type: "drop"; itemId: string }
  | { type: "drop-map"; mapSeed: string } // discard a carried map mid-run (8ec) — frees its slot; no re-pickup
  | { type: "research"; query: string } // town research table (675): a word → reveal ONE matching unknown recipe. Every search (hit or miss) spends the free search, else a charge
  | { type: "buy-research"; inkId: string } // spend 1 research ink (RESEARCH_INKS) for RESEARCH_SEARCHES_PER_INK searches (675)
  | { type: "return" };

// Closed set of every reason a reducer can reject an action (D30). Split out so
// callers (legalActions, the field UI, the AI) can switch exhaustively.
export type RejectionReason =
  | "not-in-town"
  | "not-offered"
  | "not-on-expedition"
  | "no-step"
  | "out-of-bounds"
  | "impassable"
  | "exhausted"
  | "no-node"
  | "already-cleared"
  | "not-gatherable"
  | "missing-tool"
  | "tool-too-weak"
  | "carry-full"
  | "not-carried"
  | "map-not-carried"
  | "fully-read" // study: every hint on this map is already revealed (D95)
  | "no-monster"
  | "unaffordable"
  | "no-recipe"
  | "missing-station" // craft: a recipe's requires.station isn't among the built home stations (ke3.1)
  | "already-built" // craft: a buildsStation recipe whose station is already built (ke3.2)
  | "not-field-craftable" // craft: a non-field recipe attempted via the field path (ke3.4)
  | "not-near-terrain" // field-craft: recipe.requires.terrain isn't the current tile or a 4-neighbour (ke3.4)
  | "insufficient-materials"
  | "wrong-slot"
  | "not-poisoned" // use-item: an antidote with no poison to cure (si7.6.9.2)
  | "insufficient"
  | "already-packed"
  | "no-slot"
  | "engaged"
  | "not-engaged"
  | "not-worn" // doff of a defId that isn't currently equipped (82r)
  | "not-food" // set-auto-eat-food with a defId that isn't a food (mco)
  | "no-water" // fish: no water tile on or beside you (si7.6.2)
  | "fished-out" // fish: every water tile on or beside you was already fished this run (si7.6.2)
  | "recipe-unknown" // craft: recipe fog is on and you don't know this recipe yet (675)
  | "no-research" // research: no free search left this visit and no bought charges (675)
  | "already-resolved"; // survey of a POI whose detail is already in focus (54f)

// Events are a render byproduct emitted by reduce. Named GameEvent (not Event)
// to avoid colliding with the DOM Event global, which engine code must not use.
// A closed discriminated union, extended per-milestone as systems land.
export type GameEvent =
  | {
      type: "embarked";
      mapSeed: string;
      biomeId: BiomeId;
      pos: { x: number; y: number };
      energy: number;
    }
  | {
      type: "moved";
      from: { x: number; y: number };
      to: { x: number; y: number };
      terrain: Terrain;
      cost: number;
      energy: number; // remaining after the step
      poisonTaken?: number; // si7.6.9.2: HP your poison cost on this step (present when >0)
      hazardTaken?: number; // si7.6.9.4: HP the terrain itself cost (spore-thicket without a filter-mask), present when >0
      hp?: number; // HP after the step, present when the step cost HP
    }
  | {
      type: "gathered";
      at: { x: number; y: number };
      kind: NodeType;
      material: string;
      qty: number;
      cost: number;
      energy: number; // remaining after the gather
    }
  | { type: "fished"; at: { x: number; y: number }; water: FishWater; catch: string; contents: ItemStack[]; cost: number; energy: number } // si7.6.2: one cast. `contents` = what an opened lockbox held ([] otherwise); a sodden map follows as a map-dropped event
  | { type: "dropped"; defId: string; qty: number }
  | { type: "ate"; defId: string; restored: number; energy: number; campMeal?: boolean } // ate one food unit (dtv): restored energy, new current. campMeal (7lr) = a tent camp meal (over-max, +50%).
  | { type: "auto-eat-set"; defId: string | null } // designated (or cleared, null) the auto-eat food (mco)
  | { type: "engaged"; at: { x: number; y: number }; creature: string; monsterHp: number; ranged?: boolean } // ranged (D45): engaged from an adjacent tile with a bow — the first exchange skips its retaliation
  | { type: "exchanged"; creature: string; dmgDealt: number; dmgTaken: number; monsterHp: number; hp: number; potionsUsed: number; arrowSpent?: boolean; ammoSpent?: string; poisonDmg?: number; thrown?: string; poisonTaken?: number; envenomed?: boolean } // poisonTaken/envenomed (si7.6.9.2): your poison tick this round / a venomous hit poisoned you. thrown (si7.6.9.1): the flask defId thrown this round in place of a swing. arrowSpent (D45): present when this exchange shot an arrow. ammoSpent (si7.6.6): the defId shot, present when it isn't arrows. poisonDmg (D60): poison DoT dealt to the monster this round, present when >0
  | { type: "fled"; creature: string; partingHit: number; hp: number }
  | { type: "quaffed"; defId: string; healed: number; hp: number; energy?: number } // energy present only when spent (out-of-combat quaff, 82r)
  | { type: "item-used"; defId: string; damageAdd: number; mitigationAdd: number; cured?: boolean } // battle item used mid-fight (90j); buff added to this engagement (also vb8's missing consumption log line)
  | { type: "enhanced"; id: string; charges: number } // weapon enhancement applied (D60): the coating `id` now rides the expedition with `charges` strikes left
  | { type: "surveyed"; at: { x: number; y: number }; kind: NodeType } // spyglass survey resolved a far POI's detail (54f); qualitative only
  | { type: "auto-quaff-toggled"; on: boolean }
  | { type: "auto-finish-toggled"; on: boolean } // 67e
  | { type: "auto-gather-toggled"; on: boolean } // eot
  | { type: "provoked"; creature: string; hit: number; hp: number } // 67e: a non-flee in-combat action (coat/potion/gear-swap) cost a turn — the monster landed one hit
  | { type: "donned"; defId: string; slot: LoadoutSlot; displaced: string | null; energy: number } // equipped from carry (82r)
  | { type: "doffed"; defId: string; slot: LoadoutSlot; energy: number } // unequipped to carry (82r)
  | {
      type: "fought";
      at: { x: number; y: number };
      creature: string;
      victory: boolean;
      hpLost: number;
      potionsUsed: number;
      loot: ItemStack[];
      hp: number;
      matchup: Matchup; // post-fight RPS/affinity lesson facts (9u9.2)
      rounds?: number; // 67e: set when auto-finish resolved the fight in one action (the N rounds it collapsed); absent for a single manual round
    }
  | { type: "crafted"; recipeId: string; output: ItemStack; where?: "field" | "town" } // where (ke3.4): field crafts read distinctly in the log. Optional/absent = town.
  | { type: "map-studied"; mapSeed: string; hint: string; remaining: number } // study revealed this hint id; `remaining` still sealed (D95)
  | { type: "inked"; mapSeed: string; affix: string } // an ink rolled + wrote this affix onto a held map (cxq)
  | { type: "map-dropped"; at: { x: number; y: number }; mapSeed: string; biomeId: BiomeId; carried: boolean; tier: number; source?: "fished" } // source (si7.6.2): absent = a humanoid kill // humanoid kill minted a map (8ec); carried=false → pack full, left behind
  | { type: "map-discarded"; mapSeed: string } // drop-map (8ec): carried map thrown away mid-run
  | { type: "packed"; slot: LoadoutSlot; defId: string }
  | { type: "research-hit"; recipeId: string; inputs: ItemStack[]; free: boolean; charges: number } // 675: the table revealed this recipe (its DIRECT inputs only); free = spent the free search, charges = bought searches left
  | { type: "research-miss"; query: string; free: boolean; charges: number; alreadyKnown?: boolean } // 675: nothing new (nothing matches, OR beyond your tier — same line, no spoiler); alreadyKnown = every in-reach match is one you know. Still COSTS the search (user 2026-10-09): free/charges as on a hit
  | { type: "research-bought"; inkId: string; charges: number } // 675: spent an ink at the table; charges = bought searches now held
  | { type: "run-ended"; reason: string; flavor?: string } // flavor (xwp): a cosmetic return beat, present only on voluntary "returned"; absent on defeat
  | {
      type: "action-rejected";
      action: Action["type"];
      reason: RejectionReason; // closed union (D30)
    };

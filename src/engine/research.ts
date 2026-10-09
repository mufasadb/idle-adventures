// The town research table (675, D104): type a word, maybe learn a recipe.
// Spec: docs/superpowers/specs/2026-10-09-crafting-fog-research-design.md
// Pure helpers — the action handlers (research / buy-research) live in reduce-town.ts.
//
// Matching is generous (user 2026-10-09): the query is normalised (lowercase,
// punctuation stripped, stopwords dropped, plurals singularised incl. irregulars) into
// tokens, expanded by RESEARCH_SYNONYMS (category words, US/UK spellings) and its
// run-together form; a recipe matches when ANY term hits ANY token of its output's name
// or its RESEARCH_KEYWORDS (exact, or a prefix when the term is ≥ RESEARCH_MIN_PREFIX
// long). Candidates are matches you DON'T know yet whose tier ≤ progressTier +
// RESEARCH_TIER_LOOKAHEAD. Every search — hit or miss — costs a search.
import type { GameState } from "./types";
import {
  RECIPE,
  RESEARCH_KEYWORDS,
  RESEARCH_STOPWORDS,
  RESEARCH_MIN_PREFIX,
  RESEARCH_TIER_LOOKAHEAD,
  RESEARCH_FREE_PER_TRIP,
  RESEARCH_INKS,
  RESEARCH_IRREGULAR_PLURALS,
  RESEARCH_SYNONYMS,
} from "../data/constants";
import { isRecipeKnown, progressTier, recipeTier } from "./knowledge";

// Singular: irregulars from RESEARCH_IRREGULAR_PLURALS (knives → knife, wolves → wolf),
// then rules — berries → berry, boxes → box, torches → torch, arrows → arrow (but not
// glass / cactus / axis). Applied to BOTH sides, so it must be consistent first.
export function singular(w: string): string {
  const irregular = RESEARCH_IRREGULAR_PLURALS[w];
  if (irregular) return irregular;
  if (w.length > 4 && w.endsWith("ies")) return w.slice(0, -3) + "y";
  if (w.length > 4 && /(ches|shes|sses|xes|zes|oes)$/.test(w)) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith("s") && !/(ss|us|is)$/.test(w)) return w.slice(0, -1);
  return w;
}

const STOP = new Set(RESEARCH_STOPWORDS);
// Text → match tokens: lowercase, non-letters split, stopwords dropped, singularised.
export function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((w) => w.length > 0 && !STOP.has(w))
    .map(singular);
}

// output defId → its match vocabulary (name tokens, the name run together —
// "fire-kit" → "firekit", so a typed "firekit" or "fire kit" both land — and keywords),
// built once.
const vocabMemo = new Map<string, Set<string>>();
function vocab(outputDefId: string): Set<string> {
  let v = vocabMemo.get(outputDefId);
  if (!v) {
    const nameTokens = tokens(outputDefId);
    v = new Set([...nameTokens, singular(outputDefId.replace(/[^a-z]/g, "")), ...(RESEARCH_KEYWORDS[outputDefId] ?? []).flatMap(tokens)]);
    vocabMemo.set(outputDefId, v);
  }
  return v;
}

// Normalised synonym table (keys + values singularised once).
const SYN = new Map<string, string[]>(
  Object.entries(RESEARCH_SYNONYMS).map(([k, vs]) => [singular(k), vs.flatMap(tokens)]),
);
// The words a query stands for: its tokens, the whole query run together (multi-word
// names: "small backpack" → "smallbackpack"), and one level of synonym expansion.
export function queryTerms(query: string): string[] {
  const qs = tokens(query);
  if (!qs.length) return [];
  const terms = new Set(qs);
  if (qs.length > 1) terms.add(singular(qs.join("")));
  for (const q of qs) for (const syn of SYN.get(q) ?? []) terms.add(syn);
  return [...terms];
}

function hits(q: string, v: Set<string>): boolean {
  if (v.has(q)) return true;
  if (q.length < RESEARCH_MIN_PREFIX) return false;
  for (const w of v) if (w.startsWith(q)) return true;
  return false;
}

// Every recipe id (sorted) whose output matches the query — regardless of knowledge/tier.
export function researchMatches(query: string): string[] {
  const qs = queryTerms(query);
  if (!qs.length) return [];
  return Object.keys(RECIPE)
    .filter((id) => {
      const v = vocab(RECIPE[id]!.output.defId);
      return qs.some((q) => hits(q, v));
    })
    .sort();
}

// The highest recipe tier research can reach right now.
export function researchReach(state: GameState): number {
  return progressTier(state) + RESEARCH_TIER_LOOKAHEAD;
}

// What a search would choose among (sorted): matching, unknown, within reach.
// `inReachKnown` = matching + within reach but already known (for the miss copy).
export function researchCandidates(state: GameState, query: string): { candidates: string[]; inReachKnown: number } {
  const reach = researchReach(state);
  const inReach = researchMatches(query).filter((id) => recipeTier(id) <= reach);
  const candidates = inReach.filter((id) => !isRecipeKnown(state, id));
  return { candidates, inReachKnown: inReach.length - candidates.length };
}

// Free searches left this town visit (refresh when `runs` advances).
export function freeResearchLeft(state: GameState): number {
  const runs = state.runs ?? 0;
  const used = state.freeResearchRun === runs ? (state.freeResearchUsed ?? 0) : 0;
  return Math.max(0, RESEARCH_FREE_PER_TRIP - used);
}

export type ResearchStatus = {
  freeAvailable: boolean; // a free search is waiting this visit
  freeLeft: number;
  charges: number; // bought searches held
  searches: number; // total searches you can make now (free + charges)
  inks: { inkId: string; qty: number }[]; // research inks in the bank (spend one for RESEARCH_SEARCHES_PER_INK)
  reachTier: number; // highest recipe tier research can find right now
};
export function researchStatus(state: GameState): ResearchStatus {
  const freeLeft = freeResearchLeft(state);
  const charges = state.researchCharges ?? 0;
  return {
    freeAvailable: freeLeft > 0,
    freeLeft,
    charges,
    searches: freeLeft + charges,
    inks: RESEARCH_INKS.map((inkId) => ({ inkId, qty: state.bank.find((s) => s.defId === inkId)?.qty ?? 0 })).filter((i) => i.qty > 0),
    reachTier: researchReach(state),
  };
}

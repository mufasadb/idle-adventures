/**
 * Skill Tier Definitions
 *
 * Maps each gathering skill to its progression of harvestable resources
 * and the tools used to gather them. This is the single source of truth
 * for what items/tools belong to what tier.
 *
 * Pattern per skill:
 *   resources[] — ordered from lowest to highest tier
 *   tools[]     — tool that unlocks/improves gathering at that tier
 *
 * Expand resources[] and tools[] as new tiers are added.
 */

/** A single resource tier entry */
export interface ResourceTierEntry {
  /** Tier number (1 = lowest quality) */
  tier: number;
  /** Item ID of the harvestable resource */
  itemId: string;
}

/** A single tool tier entry */
export interface ToolTierEntry {
  /** Tier number (1 = lowest quality) */
  tier: number;
  /** Item ID of the tool */
  toolId: string;
  /** Components required to craft this tool */
  craftingComponents?: Array<{ itemId: string; count: number }>;
}

/** Full tier definition for one skill */
export interface SkillTierDef {
  /** Matches the player skill id in defaults.ts */
  skillId: string;
  displayName: string;
  /** Ordered list of harvestable resources, tier 1 first */
  resources: ResourceTierEntry[];
  /** Ordered list of tools, tier 1 first */
  tools: ToolTierEntry[];
}

/**
 * Tier definitions for all gathering skills.
 * Start with one entry per skill to establish the pattern; expand later.
 */
export const SKILL_TIERS: Record<string, SkillTierDef> = {
  woodcutting: {
    skillId: 'woodcutting',
    displayName: 'Woodcutting',
    resources: [
      { tier: 1, itemId: 'pine-log' },
      { tier: 2, itemId: 'oak-log' },
      { tier: 3, itemId: 'willow-log' },
      { tier: 4, itemId: 'maple-log' },
      { tier: 5, itemId: 'ironbark-log' },
      { tier: 6, itemId: 'ebony-log' },
      { tier: 7, itemId: 'yew-log' },
      { tier: 8, itemId: 'eucalyptus-log' },
    ],
    tools: [
      {
        tier: 1,
        toolId: 'bronze-axe',
        craftingComponents: [
          { itemId: 'basic-handle', count: 1 },
          { itemId: 'bronze-bar', count: 1 },
        ],
      },
      {
        tier: 2,
        toolId: 'iron-axe',
        craftingComponents: [
          { itemId: 'sturdy-handle', count: 1 },
          { itemId: 'iron-bar', count: 1 },
        ],
      },
      {
        tier: 3,
        toolId: 'steel-axe',
        craftingComponents: [
          { itemId: 'reinforced-handle', count: 1 },
          { itemId: 'steel-bar', count: 1 },
        ],
      },
      {
        tier: 4,
        toolId: 'mithril-axe',
        craftingComponents: [
          { itemId: 'masterwork-handle', count: 1 },
          { itemId: 'mithril-bar', count: 1 },
        ],
      },
      {
        tier: 5,
        toolId: 'adamant-axe',
        craftingComponents: [
          { itemId: 'ironbark-handle', count: 1 },
          { itemId: 'adamant-bar', count: 1 },
        ],
      },
    ],
  },

  mining: {
    skillId: 'mining',
    displayName: 'Mining',
    resources: [
      { tier: 1, itemId: 'copper-ore' },
      { tier: 1, itemId: 'tin-ore' },
      { tier: 2, itemId: 'iron-ore' },
      { tier: 2, itemId: 'coal' },
      { tier: 3, itemId: 'gold-ore' },
      { tier: 3, itemId: 'silver-ore' },
      { tier: 4, itemId: 'mithril-ore' },
      { tier: 5, itemId: 'adamant-ore' },
    ],
    tools: [
      {
        tier: 1,
        toolId: 'bronze-pickaxe',
        craftingComponents: [
          { itemId: 'basic-handle', count: 1 },
          { itemId: 'bronze-bar', count: 1 },
        ],
      },
      {
        tier: 2,
        toolId: 'iron-pickaxe',
        craftingComponents: [
          { itemId: 'sturdy-handle', count: 1 },
          { itemId: 'iron-bar', count: 1 },
        ],
      },
      {
        tier: 3,
        toolId: 'steel-pickaxe',
        craftingComponents: [
          { itemId: 'reinforced-handle', count: 1 },
          { itemId: 'steel-bar', count: 1 },
        ],
      },
      {
        tier: 4,
        toolId: 'mithril-pickaxe',
        craftingComponents: [
          { itemId: 'masterwork-handle', count: 1 },
          { itemId: 'mithril-bar', count: 1 },
        ],
      },
      {
        tier: 5,
        toolId: 'adamant-pickaxe',
        craftingComponents: [
          { itemId: 'ironbark-handle', count: 1 },
          { itemId: 'adamant-bar', count: 1 },
        ],
      },
    ],
  },

  herbalism: {
    skillId: 'herbalism',
    displayName: 'Herbalism',
    resources: [
      { tier: 1, itemId: 'curaweed' },
      { tier: 1, itemId: 'mendaloe' },
      { tier: 2, itemId: 'vitalroot' },
      { tier: 2, itemId: 'soothebloom' },
      { tier: 3, itemId: 'restoria' },
      { tier: 3, itemId: 'glacial-mint' },
      { tier: 3, itemId: 'luminleaf' },
      { tier: 4, itemId: 'emberheart' },
      { tier: 4, itemId: 'lifebane' },
      { tier: 4, itemId: 'phoenixwort' },
    ],
    tools: [
      { tier: 1, toolId: 'basic-herbalist-kit' },
      { tier: 2, toolId: 'herbalist-kit' },
      {
        tier: 3,
        toolId: 'silver-herbalist-kit',
        craftingComponents: [{ itemId: 'silver-bar', count: 1 }],
      },
      {
        tier: 4,
        toolId: 'mithril-herbalist-kit',
        craftingComponents: [{ itemId: 'mithril-bar', count: 1 }],
      },
    ],
  },

  fishing: {
    skillId: 'fishing',
    displayName: 'Fishing',
    resources: [
      { tier: 1, itemId: 'raw-sardines' },
      { tier: 2, itemId: 'raw-trout' },
      { tier: 3, itemId: 'raw-salmon' },
      { tier: 4, itemId: 'raw-lobster' },
    ],
    tools: [
      {
        tier: 1,
        toolId: 'basic-fishing-rod',
        craftingComponents: [{ itemId: 'pine-log', count: 1 }],
      },
      {
        tier: 2,
        toolId: 'fly-fishing-rod',
        craftingComponents: [{ itemId: 'oak-log', count: 1 }],
      },
      {
        tier: 3,
        toolId: 'sturdy-fishing-rod',
        craftingComponents: [
          { itemId: 'maple-log', count: 1 },
          { itemId: 'iron-bar', count: 1 },
        ],
      },
      {
        tier: 4,
        toolId: 'master-fishing-rod',
        craftingComponents: [
          { itemId: 'yew-log', count: 1 },
          { itemId: 'mithril-bar', count: 1 },
        ],
      },
    ],
  },
};

/**
 * Get the tool required for a skill at or below a given tier.
 * Returns the highest tool tier that does not exceed the requested tier.
 */
export function getToolForTier(skillId: string, tier: number): ToolTierEntry | null {
  const skillDef = SKILL_TIERS[skillId];
  if (!skillDef) return null;

  const available = skillDef.tools.filter((t) => t.tier <= tier);
  if (available.length === 0) return skillDef.tools[0] ?? null;
  return available[available.length - 1];
}

/**
 * Get all resources for a skill at a specific tier.
 */
export function getResourcesForTier(skillId: string, tier: number): ResourceTierEntry[] {
  const skillDef = SKILL_TIERS[skillId];
  if (!skillDef) return [];
  return skillDef.resources.filter((r) => r.tier === tier);
}

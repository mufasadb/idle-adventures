/**
 * Player Types
 *
 * Types for player skills and progression.
 */

/**
 * Skill category
 */
export type SkillCategory = 'gathering' | 'combat' | 'crafting' | 'support';

/**
 * Player skill with level and XP
 */
export interface PlayerSkill {
  id: string;
  name: string;
  level: number;
  xp: number;
  xpToNext: number;
  category: SkillCategory;
}

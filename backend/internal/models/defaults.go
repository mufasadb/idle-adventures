package models

// PlayerSkillSeed defines the initial state of one skill for a new player.
type PlayerSkillSeed struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	Level    int    `json:"level"`
	XP       int    `json:"xp"`
	XPToNext int    `json:"xpToNext"`
	Category string `json:"category"`
}

// DefaultSkills returns all 20 skills at level 1 / 0 XP for new players.
func DefaultSkills() []PlayerSkillSeed {
	return []PlayerSkillSeed{
		// Gathering
		{ID: "mining", Name: "Mining", Level: 1, XP: 0, XPToNext: 100, Category: "gathering"},
		{ID: "woodcutting", Name: "Woodcutting", Level: 1, XP: 0, XPToNext: 100, Category: "gathering"},
		{ID: "herbalism", Name: "Herbalism", Level: 1, XP: 0, XPToNext: 100, Category: "gathering"},
		{ID: "fishing", Name: "Fishing", Level: 1, XP: 0, XPToNext: 100, Category: "gathering"},
		{ID: "hunting", Name: "Hunting", Level: 1, XP: 0, XPToNext: 100, Category: "gathering"},
		{ID: "farming", Name: "Farming", Level: 1, XP: 0, XPToNext: 100, Category: "gathering"},
		{ID: "archaeology", Name: "Archaeology", Level: 1, XP: 0, XPToNext: 100, Category: "gathering"},
		// Combat
		{ID: "melee", Name: "Melee", Level: 1, XP: 0, XPToNext: 100, Category: "combat"},
		{ID: "ranged", Name: "Ranged", Level: 1, XP: 0, XPToNext: 100, Category: "combat"},
		{ID: "magic", Name: "Magic", Level: 1, XP: 0, XPToNext: 100, Category: "combat"},
		// Crafting
		{ID: "smithing", Name: "Smithing", Level: 1, XP: 0, XPToNext: 100, Category: "crafting"},
		{ID: "cooking", Name: "Cooking", Level: 1, XP: 0, XPToNext: 100, Category: "crafting"},
		{ID: "alchemy", Name: "Alchemy", Level: 1, XP: 0, XPToNext: 100, Category: "crafting"},
		{ID: "tailoring", Name: "Tailoring", Level: 1, XP: 0, XPToNext: 100, Category: "crafting"},
		{ID: "jewelcrafting", Name: "Jewelcrafting", Level: 1, XP: 0, XPToNext: 100, Category: "crafting"},
		{ID: "carpentry", Name: "Carpentry", Level: 1, XP: 0, XPToNext: 100, Category: "crafting"},
		{ID: "engineering", Name: "Engineering", Level: 1, XP: 0, XPToNext: 100, Category: "crafting"},
		// Support
		{ID: "arcana", Name: "Arcana", Level: 1, XP: 0, XPToNext: 100, Category: "support"},
		{ID: "beastcraft", Name: "Beastcraft", Level: 1, XP: 0, XPToNext: 100, Category: "support"},
		{ID: "cartography", Name: "Cartography", Level: 1, XP: 0, XPToNext: 100, Category: "support"},
	}
}

// DefaultGameState returns the initial game state for new players.
// Skills are now stored in the dedicated skills column, not game_state.
func DefaultGameState() GameState {
	return GameState{
		"bank": []map[string]interface{}{
			{"itemId": "gold", "count": 500},
			{"itemId": "bread", "count": 5},
			{"itemId": "iron-pickaxe", "count": 1},
			{"itemId": "herbalist-kit", "count": 1},
			{"itemId": "health-potion", "count": 2},
		},
		"unlocked": []string{"smithy", "kitchen"},
	}
}

// IsEmptyGameState checks if the game state is empty (new player)
func IsEmptyGameState(gs GameState) bool {
	return gs == nil || len(gs) == 0
}

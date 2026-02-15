package models

// DefaultGameState returns the initial game state for new players.
// This matches the frontend defaults in data/defaults.ts
func DefaultGameState() GameState {
	return GameState{
		"bank": []map[string]interface{}{
			{"itemId": "gold", "count": 500},
			{"itemId": "bread", "count": 5},
			{"itemId": "iron-pickaxe", "count": 1},
			{"itemId": "herbalist-kit", "count": 1},
			{"itemId": "health-potion", "count": 2},
		},
		"skills": []map[string]interface{}{
			{"id": "mining", "name": "Mining", "level": 1, "xp": 0, "xpToNext": 100, "category": "gathering"},
			{"id": "woodcutting", "name": "Woodcutting", "level": 1, "xp": 0, "xpToNext": 100, "category": "gathering"},
			{"id": "herbalism", "name": "Herbalism", "level": 1, "xp": 0, "xpToNext": 100, "category": "gathering"},
			{"id": "fishing", "name": "Fishing", "level": 1, "xp": 0, "xpToNext": 100, "category": "gathering"},
			{"id": "melee", "name": "Melee", "level": 1, "xp": 0, "xpToNext": 100, "category": "combat"},
			{"id": "ranged", "name": "Ranged", "level": 1, "xp": 0, "xpToNext": 100, "category": "combat"},
			{"id": "smithing", "name": "Smithing", "level": 1, "xp": 0, "xpToNext": 100, "category": "crafting"},
			{"id": "cooking", "name": "Cooking", "level": 1, "xp": 0, "xpToNext": 100, "category": "crafting"},
			{"id": "cartography", "name": "Cartography", "level": 1, "xp": 0, "xpToNext": 100, "category": "support"},
		},
		"unlocked": []string{"smithy", "kitchen"},
	}
}

// IsEmptyGameState checks if the game state is empty (new player)
func IsEmptyGameState(gs GameState) bool {
	return gs == nil || len(gs) == 0
}

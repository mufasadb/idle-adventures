package models

import (
	"time"

	"github.com/google/uuid"
)

// InventoryItem represents a single item (or stack) in the player's inventory
type InventoryItem struct {
	ItemID string `json:"item_id"`
	Count  int    `json:"count"`
	// Future: State, Durability, Quality, etc.
}

// Skills holds XP for each skill - level is calculated from XP at runtime
type Skills struct {
	// Gathering (6)
	Mining      int64 `json:"mining"`
	Woodcutting int64 `json:"woodcutting"`
	Herbalism   int64 `json:"herbalism"`
	Fishing     int64 `json:"fishing"`
	Hunting     int64 `json:"hunting"`
	BugCatching int64 `json:"bug_catching"`

	// Crafting (9)
	Smithing      int64 `json:"smithing"`
	Alchemy       int64 `json:"alchemy"`
	Cooking       int64 `json:"cooking"`
	Tailoring     int64 `json:"tailoring"`
	Jewelcrafting int64 `json:"jewelcrafting"`
	Carpentry     int64 `json:"carpentry"`
	Engineering   int64 `json:"engineering"`
	Arcana        int64 `json:"arcana"`
	Brewing       int64 `json:"brewing"`

	// Production/Exploration (5)
	Farming     int64 `json:"farming"`
	Beastcraft  int64 `json:"beastcraft"`
	Cartography int64 `json:"cartography"`
	Sailing     int64 `json:"sailing"`
	Archaeology int64 `json:"archaeology"`

	// Combat (3)
	Melee  int64 `json:"melee"`
	Magic  int64 `json:"magic"`
	Ranged int64 `json:"ranged"`
}

// GameState is the main blob stored per player
type GameState struct {
	Name      string                   `json:"name"`
	Gold      int64                    `json:"gold"`
	Skills    Skills                   `json:"skills"`
	Inventory map[string]InventoryItem `json:"inventory"` // keyed by item_id for easy lookup
}

// Player represents a user account
type Player struct {
	ID           uuid.UUID `gorm:"type:uuid;primary_key;default:gen_random_uuid()" json:"id"`
	Email        string    `gorm:"uniqueIndex;not null" json:"email"`
	PasswordHash string    `gorm:"not null" json:"-"`
	Username     string    `gorm:"uniqueIndex;not null" json:"username"`
	GameState    GameState `gorm:"type:jsonb;serializer:json" json:"game_state"`
	LastOnline   time.Time `gorm:"default:now()" json:"last_online"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

// NewGameState creates a fresh game state for new players
func NewGameState(name string) GameState {
	return GameState{
		Name:      name,
		Gold:      100, // Starting gold
		Skills:    Skills{}, // All skills start at 0 XP
		Inventory: make(map[string]InventoryItem),
	}
}

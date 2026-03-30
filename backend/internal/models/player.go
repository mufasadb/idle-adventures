package models

import (
	"time"

	"github.com/google/uuid"
)

// GameState stores the frontend's state as a raw JSON blob.
// This allows the frontend to evolve its structure without backend changes.
type GameState map[string]interface{}

// PlayerSkills is the typed slice stored in the players.skills JSONB column.
// GORM's json serializer handles marshaling/unmarshaling automatically.
type PlayerSkills []PlayerSkillSeed

// Player represents a user account
type Player struct {
	ID           uuid.UUID    `gorm:"type:uuid;primary_key;default:gen_random_uuid()" json:"id"`
	Username     string       `gorm:"uniqueIndex;not null" json:"username"`
	PasswordHash string       `gorm:"not null" json:"-"`
	GameState    GameState    `gorm:"type:jsonb;serializer:json" json:"game_state"`
	Skills       PlayerSkills `gorm:"type:jsonb;serializer:json" json:"skills"`
	LastOnline   time.Time    `gorm:"default:now()" json:"last_online"`
	CreatedAt    time.Time    `json:"created_at"`
	UpdatedAt    time.Time    `json:"updated_at"`
}

// NewGameState creates a fresh (empty) game state for new players.
// The frontend initializes the actual game data.
func NewGameState() GameState {
	return make(GameState)
}

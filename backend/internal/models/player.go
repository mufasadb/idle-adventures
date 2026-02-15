package models

import (
	"time"

	"github.com/google/uuid"
)

// GameState stores the frontend's state as a raw JSON blob.
// This allows the frontend to evolve its structure without backend changes.
type GameState map[string]interface{}

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

// NewGameState creates a fresh (empty) game state for new players.
// The frontend initializes the actual game data.
func NewGameState() GameState {
	return make(GameState)
}

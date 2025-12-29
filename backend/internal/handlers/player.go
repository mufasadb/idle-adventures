package handlers

import (
	"net/http"

	"github.com/danielbeach/idle-adventures/backend/internal/models"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

type PlayerHandler struct {
	db *gorm.DB
}

func NewPlayerHandler(db *gorm.DB) *PlayerHandler {
	return &PlayerHandler{db: db}
}

// GetPlayer returns the full player record (for admin/debug)
func (h *PlayerHandler) GetPlayer(c *gin.Context) {
	playerID := c.MustGet("player_id").(uuid.UUID)

	var player models.Player
	if err := h.db.First(&player, playerID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Player not found"})
		return
	}

	c.JSON(http.StatusOK, player)
}

// GetGameState returns just the game state blob for the logged-in player
func (h *PlayerHandler) GetGameState(c *gin.Context) {
	playerID := c.MustGet("player_id").(uuid.UUID)

	var player models.Player
	if err := h.db.First(&player, playerID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Player not found"})
		return
	}

	c.JSON(http.StatusOK, player.GameState)
}

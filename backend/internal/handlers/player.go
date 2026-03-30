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

// GetMe returns {id, username, created_at} for the authenticated player
func (h *PlayerHandler) GetMe(c *gin.Context) {
	playerID := c.MustGet("player_id").(uuid.UUID)

	var player models.Player
	if err := h.db.First(&player, playerID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Player not found"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"id":         player.ID,
		"username":   player.Username,
		"created_at": player.CreatedAt,
	})
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
// Returns default state for new players with empty game state
func (h *PlayerHandler) GetGameState(c *gin.Context) {
	playerID := c.MustGet("player_id").(uuid.UUID)

	var player models.Player
	if err := h.db.First(&player, playerID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Player not found"})
		return
	}

	// Return defaults for new players
	if models.IsEmptyGameState(player.GameState) {
		c.JSON(http.StatusOK, models.DefaultGameState())
		return
	}

	c.JSON(http.StatusOK, player.GameState)
}

// SaveGameState stores the frontend's game state blob
func (h *PlayerHandler) SaveGameState(c *gin.Context) {
	playerID := c.MustGet("player_id").(uuid.UUID)

	var gameState models.GameState
	if err := c.ShouldBindJSON(&gameState); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid game state"})
		return
	}

	var player models.Player
	if err := h.db.First(&player, playerID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Player not found"})
		return
	}

	player.GameState = gameState
	if err := h.db.Save(&player).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save game state"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"saved": true})
}

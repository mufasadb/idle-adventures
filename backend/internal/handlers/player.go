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

// GetPlayer returns the full player: profile + skills + stash contents
func (h *PlayerHandler) GetPlayer(c *gin.Context) {
	playerID := c.MustGet("player_id").(uuid.UUID)

	var player models.Player
	if err := h.db.First(&player, playerID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Player not found"})
		return
	}

	// If skills column is empty (legacy player), seed defaults on-the-fly
	skills := player.Skills
	if len(skills) == 0 {
		skills = models.PlayerSkills(models.DefaultSkills())
		// Persist the seeded skills so subsequent calls return them
		h.db.Model(&player).Update("skills", skills)
	}

	// Fetch stash items with their definitions
	var items []models.Item
	h.db.Preload("Definition").
		Where("player_id = ?", playerID).
		Order("stash_position ASC NULLS LAST, created_at ASC").
		Find(&items)

	c.JSON(http.StatusOK, gin.H{
		"id":          player.ID,
		"username":    player.Username,
		"last_online": player.LastOnline,
		"created_at":  player.CreatedAt,
		"updated_at":  player.UpdatedAt,
		"skills":      skills,
		"stash":       items,
	})
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

// SaveSkills persists the player's skill array
func (h *PlayerHandler) SaveSkills(c *gin.Context) {
	playerID := c.MustGet("player_id").(uuid.UUID)

	var skills models.PlayerSkills
	if err := c.ShouldBindJSON(&skills); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid skills payload"})
		return
	}

	result := h.db.Model(&models.Player{}).Where("id = ?", playerID).Update("skills", skills)
	if result.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save skills"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"saved": true})
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

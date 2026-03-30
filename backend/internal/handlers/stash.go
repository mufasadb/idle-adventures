package handlers

import (
	"net/http"

	"github.com/danielbeach/idle-adventures/backend/internal/models"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

type StashHandler struct {
	db *gorm.DB
}

func NewStashHandler(db *gorm.DB) *StashHandler {
	return &StashHandler{db: db}
}

// GetStash returns all items owned by the authenticated player, joined with
// their item definitions, ordered by stash_position (nulls last).
//
// GET /api/player/stash
func (h *StashHandler) GetStash(c *gin.Context) {
	playerID := c.MustGet("player_id").(uuid.UUID)

	var items []models.Item
	result := h.db.
		Preload("Definition").
		Where("player_id = ?", playerID).
		Order("stash_position ASC NULLS LAST, created_at ASC").
		Find(&items)

	if result.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch stash"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"items": items})
}

// MoveStashItem updates the stash_position of a single item.
//
// POST /api/player/stash/move
// Body: { "item_id": "<uuid>", "new_position": <int or null> }
func (h *StashHandler) MoveStashItem(c *gin.Context) {
	playerID := c.MustGet("player_id").(uuid.UUID)

	var req struct {
		ItemID      uuid.UUID `json:"item_id" binding:"required"`
		NewPosition *int      `json:"new_position"` // nil clears the position
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "item_id is required"})
		return
	}

	result := h.db.
		Model(&models.Item{}).
		Where("id = ? AND player_id = ?", req.ItemID, playerID).
		Update("stash_position", req.NewPosition)

	if result.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to move item"})
		return
	}
	if result.RowsAffected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "Item not found"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"moved": true})
}

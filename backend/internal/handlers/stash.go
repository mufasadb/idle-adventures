package handlers

import (
	"math/rand"
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

// SwapStashItems atomically swaps the stash_position of two items belonging to
// the authenticated player.
//
// POST /api/player/stash/swap
// Body: { "item_id_a": "<uuid>", "item_id_b": "<uuid>" }
func (h *StashHandler) SwapStashItems(c *gin.Context) {
	playerID := c.MustGet("player_id").(uuid.UUID)

	var req struct {
		ItemIDA uuid.UUID `json:"item_id_a" binding:"required"`
		ItemIDB uuid.UUID `json:"item_id_b" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "item_id_a and item_id_b are required"})
		return
	}

	err := h.db.Transaction(func(tx *gorm.DB) error {
		var itemA, itemB models.Item

		if err := tx.Where("id = ? AND player_id = ?", req.ItemIDA, playerID).First(&itemA).Error; err != nil {
			return err
		}
		if err := tx.Where("id = ? AND player_id = ?", req.ItemIDB, playerID).First(&itemB).Error; err != nil {
			return err
		}

		posA := itemA.StashPosition
		posB := itemB.StashPosition

		if err := tx.Model(&itemA).Update("stash_position", posB).Error; err != nil {
			return err
		}
		if err := tx.Model(&itemB).Update("stash_position", posA).Error; err != nil {
			return err
		}

		return nil
	})

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to swap items"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"swapped": true})
}

// DestroyStashItem permanently deletes an item from the stash (furnace destroy).
//
// DELETE /api/player/stash/:id
func (h *StashHandler) DestroyStashItem(c *gin.Context) {
	playerID := c.MustGet("player_id").(uuid.UUID)

	itemIDStr := c.Param("id")
	itemID, err := uuid.Parse(itemIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid item ID"})
		return
	}

	result := h.db.
		Where("id = ? AND player_id = ?", itemID, playerID).
		Delete(&models.Item{})

	if result.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to destroy item"})
		return
	}
	if result.RowsAffected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "Item not found"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"destroyed": true})
}

// AddRandomStashItem adds a random item definition to the player's stash for dev/testing.
// If the player already has that item def in their stash, increments quantity instead.
// Otherwise places it in the first available slot (0-19).
//
// POST /api/player/stash/add-random
func (h *StashHandler) AddRandomStashItem(c *gin.Context) {
	playerID := c.MustGet("player_id").(uuid.UUID)

	// Pick a random item definition
	var defs []models.ItemDefinition
	if err := h.db.Find(&defs).Error; err != nil || len(defs) == 0 {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No item definitions found"})
		return
	}
	def := defs[rand.Intn(len(defs))]

	// Check if player already has this item in stash
	var existing models.Item
	err := h.db.
		Where("player_id = ? AND item_def_id = ? AND stash_position IS NOT NULL", playerID, def.ID).
		First(&existing).Error

	if err == nil {
		// Already exists — increment quantity
		if err := h.db.Model(&existing).UpdateColumn("quantity", gorm.Expr("quantity + 1")).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update quantity"})
			return
		}
		existing.Quantity++
		c.JSON(http.StatusOK, gin.H{"item": existing, "action": "incremented"})
		return
	}

	// Find first available slot (0-19)
	var occupiedPositions []int
	h.db.Model(&models.Item{}).
		Where("player_id = ? AND stash_position IS NOT NULL", playerID).
		Pluck("stash_position", &occupiedPositions)

	occupied := make(map[int]bool, len(occupiedPositions))
	for _, p := range occupiedPositions {
		occupied[p] = true
	}

	slot := -1
	for i := 0; i < 20; i++ {
		if !occupied[i] {
			slot = i
			break
		}
	}

	if slot == -1 {
		c.JSON(http.StatusConflict, gin.H{"error": "Stash is full"})
		return
	}

	newItem := models.Item{
		PlayerID:      playerID,
		ItemDefID:     def.ID,
		Quantity:      1,
		StashPosition: &slot,
	}

	if err := h.db.Create(&newItem).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to add item"})
		return
	}

	newItem.Definition = def
	c.JSON(http.StatusCreated, gin.H{"item": newItem, "action": "added"})
}

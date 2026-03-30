package models

import (
	"time"

	"github.com/google/uuid"
)

// ItemCategory classifies what kind of item this is.
type ItemCategory string

const (
	ItemCategoryMap        ItemCategory = "map"
	ItemCategoryTool       ItemCategory = "tool"
	ItemCategoryIngredient ItemCategory = "ingredient"
	ItemCategoryConsumable ItemCategory = "consumable"
)

// SlotType defines which equipment slot a tool occupies.
type SlotType string

const (
	SlotTypeWeapon SlotType = "weapon"
	SlotTypeArmour SlotType = "armour"
	SlotTypeMisc   SlotType = "misc"
)

// ItemDefinition is the static catalogue entry for an item type.
// Rows here are shared across all players — they define what an item is,
// not who owns one.
type ItemDefinition struct {
	ID          string       `gorm:"primaryKey" json:"id"`
	Name        string       `gorm:"not null" json:"name"`
	Category    ItemCategory `gorm:"type:item_category;not null" json:"category"`
	Subcategory *string      `json:"subcategory,omitempty"`
	Icon        string       `gorm:"not null;default:''" json:"icon"`
	Stackable   bool         `gorm:"not null;default:true" json:"stackable"`
	SlotType    *SlotType    `gorm:"type:slot_type" json:"slot_type,omitempty"`
	CreatedAt   time.Time    `json:"created_at"`
}

// Item is a player-owned instance of an ItemDefinition.
// Stackable items accumulate quantity; non-stackable items each get their own row.
type Item struct {
	ID            uuid.UUID      `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	PlayerID      uuid.UUID      `gorm:"type:uuid;not null;index" json:"player_id"`
	ItemDefID     string         `gorm:"not null" json:"item_def_id"`
	Quantity      int            `gorm:"not null;default:1;check:quantity > 0" json:"quantity"`
	StashPosition *int           `json:"stash_position,omitempty"` // nil = not placed in stash grid
	Seed          *int           `json:"seed,omitempty"`           // maps only
	CreatedAt     time.Time      `json:"created_at"`
	Definition    ItemDefinition `gorm:"foreignKey:ItemDefID" json:"definition"`
}

// StashItem is the response shape for GET /api/player/stash.
// It embeds the item instance alongside its full definition.
type StashItem struct {
	Item
}

// MapEnhancement records an enhancement item applied to a map instance (Item).
type MapEnhancement struct {
	ID                   uuid.UUID      `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	ItemID               uuid.UUID      `gorm:"type:uuid;not null;index" json:"item_id"`
	EnhancementItemDefID string         `gorm:"not null" json:"enhancement_item_def_id"`
	AppliedOrder         int            `gorm:"not null;default:0" json:"applied_order"`
	CreatedAt            time.Time      `json:"created_at"`
	EnhancementDef       ItemDefinition `gorm:"foreignKey:EnhancementItemDefID" json:"enhancement_def"`
}

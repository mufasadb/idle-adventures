# Idle RPG - Developer Specification

**Related Documents**:
- `idle-rpg-game-design.md` - High-level game design
- `idle-rpg-ux-flows.md` - User experience flows
- `design-decisions-log.md` - Design decision history

---

## Project Overview

| Aspect | Detail |
|--------|--------|
| **Genre** | Active exploration RPG with idle convenience features |
| **Platform** | PWA (Mobile-first, works on desktop) |
| **Setting** | High fantasy (LotR/Skyrim inspired) |
| **Core Loop** | Prepare → Travel → Navigate Grid → Gather/Fight → Return → Process/Craft |
| **Key Differentiator** | Manual play (minigames) = 85-100% yield, Auto = 70% yield |

---

## Technical Requirements

### Platform Targets
- PWA installable on iOS/Android home screens
- Works in modern browsers (Chrome, Safari, Firefox)
- Offline-capable with sync on reconnect
- Portrait orientation primary, landscape supported

### Performance Targets
- Cold start: < 3 seconds
- Grid navigation: 60fps animations
- Auto-play calculations: < 100ms per node
- Storage: < 50MB app, < 10MB save data

### Tech Stack

**Frontend (PWA)**
| Component | Choice |
|-----------|--------|
| **Framework** | React + TypeScript |
| **State Management** | MobX |
| **Offline** | Service Worker + localStorage (seed + action log) |
| **Styling** | Tailwind CSS |
| **Build** | Vite |
| **Grid Rendering** | Canvas |

**Backend**
| Component | Choice |
|-----------|--------|
| **Language** | Go |
| **Framework** | Gin |
| **ORM** | GORM |
| **Database** | PostgreSQL |
| **Migrations** | golang-migrate |
| **Auth** | JWT (golang-jwt/jwt) + bcrypt |
| **Config** | Viper |

---

## Architecture: Checkpointed State + Transient Verification

The game stores **permanent player state** on the server, with **temporary action logs** used only for offline sync verification.

### What Gets Stored (Permanent)

**Server (authoritative)**
```
players
├── Profile (name, created_at, gold)
├── Skills (23 skills with level + XP)
├── Inventory (items in town storage)
├── Equipment (currently equipped gear)
├── Owned maps, mounts, companions
└── state_version (increments on each sync)
```

**NOT stored permanently:**
- Expedition state (transient, in-memory only)
- Action logs (discarded after verification)
- Grid layouts (regenerated from seeds)

**Client (localStorage)**
```json
{
  "cachedPlayerState": { ... },
  "stateVersion": 847,
  "currentExpedition": { ... },
  "pendingActions": []
}
```

### Expeditions Are Transient

Expeditions exist only in-memory while being played:
- Client generates grid from map seed
- Client tracks actions during expedition
- On return home → actions verified → permanent state updated → expedition discarded

No expedition is ever "saved mid-progress" to the database.

### Sync Flow

```
┌─────────────────────────────────────────────────────────────┐
│                      ONLINE PLAY                             │
│                                                              │
│  Complete expedition → Client sends:                        │
│                        • Starting state version             │
│                        • Map seed                           │
│                        • Action list                        │
│                        • Computed result                    │
│                                                              │
│                      → Server replays actions               │
│                      → Server verifies result matches       │
│                      → Server updates permanent state       │
│                      → Server discards actions              │
│                      → Server returns new state version     │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                      OFFLINE PLAY                            │
│                                                              │
│  Player does expedition(s) offline:                         │
│  • Client tracks all actions                                │
│  • Client computes state changes locally                    │
│                                                              │
│  On reconnect:                                              │
│  • Client sends starting version + actions + results        │
│  • Server replays and verifies                              │
│  • If match → Update state, return new version              │
│  • If mismatch → Reject, client resyncs from server         │
│  • Actions discarded after verification                     │
└─────────────────────────────────────────────────────────────┘
```

### What's Stored vs Computed

| Stored Permanently | Computed/Transient |
|--------------------|--------------------|
| Player has 45 iron ore | How they got it |
| Mining is level 28 | Every swing they took |
| They own "Iron Ridge" map | The grid layout |
| Gold balance | Transaction history |

### Deterministic Requirements

For verification to work, procedural generation must be seeded:
- Grid node placement → `generateGrid(mapSeed)`
- Resource quantities → `rollQuantity(nodeSeed)`
- Loot drops → `rollLoot(combatSeed, monsterType)`

No `Math.random()` - use a seeded PRNG like `seedrandom`.

### Benefits

| Aspect | Benefit |
|--------|---------|
| **Storage** | Only permanent state, not history |
| **Offline** | Full gameplay, verify on sync |
| **Cheat prevention** | Server replays and verifies |
| **Simplicity** | No ever-growing action log |
| **Recovery** | Server state is always authoritative |

---

## Core Concepts

### Two Modes of Play

| Mode | Location | Gameplay | Risk |
|------|----------|----------|------|
| **Expedition** | Out in the world | Navigate grid, gather at nodes, fight, limited by carry | Yes - time/resource management |
| **Town** | Home base | Process materials, craft gear, cook rations | None - safe, unlimited |

### Manual vs Auto Trade-off

The core tension: Player's real-world time vs in-game efficiency.

| Approach | Yield | Player Effort |
|----------|-------|---------------|
| **Manual (Minigame)** | 85-100% | Active engagement |
| **Auto** | 70% | Hands-off |

This applies to: Mining, Woodcutting, Herbalism, Fishing, Combat, Processing, Research, etc.

---

## Database Schema (PostgreSQL)

### Core Tables

```sql
-- Players
CREATE TABLE players (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email           VARCHAR(255) UNIQUE NOT NULL,
    password_hash   VARCHAR(255) NOT NULL,
    username        VARCHAR(50) UNIQUE NOT NULL,
    gold            BIGINT DEFAULT 0,
    last_online     TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Skills (one row per player per skill)
CREATE TABLE player_skills (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    player_id       UUID REFERENCES players(id) ON DELETE CASCADE,
    skill_id        VARCHAR(50) NOT NULL,
    level           INT DEFAULT 1,
    current_xp      BIGINT DEFAULT 0,
    total_xp        BIGINT DEFAULT 0,
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(player_id, skill_id)
);

-- Inventory (items in town storage)
CREATE TABLE inventory_items (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    player_id       UUID REFERENCES players(id) ON DELETE CASCADE,
    item_id         VARCHAR(100) NOT NULL,
    quantity        INT DEFAULT 1,
    durability      INT,
    quality         INT,
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(player_id, item_id, quality)
);

-- Equipment slots (what's equipped for expeditions)
CREATE TABLE player_equipment (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    player_id       UUID REFERENCES players(id) ON DELETE CASCADE,
    slot            VARCHAR(50) NOT NULL,  -- 'weapon', 'pickaxe', 'backpack', 'mount', etc.
    inventory_item_id UUID REFERENCES inventory_items(id) ON DELETE SET NULL,
    UNIQUE(player_id, slot)
);

-- Player's map collection
CREATE TABLE player_maps (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    player_id       UUID REFERENCES players(id) ON DELETE CASCADE,
    map_id          VARCHAR(100) NOT NULL,
    quality         INT DEFAULT 1,           -- Affects info revealed
    times_used      INT DEFAULT 0,
    acquired_at     TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(player_id, map_id)
);

-- Mounts owned
CREATE TABLE player_mounts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    player_id       UUID REFERENCES players(id) ON DELETE CASCADE,
    species_id      VARCHAR(100) NOT NULL,
    name            VARCHAR(50),
    is_active       BOOLEAN DEFAULT FALSE,
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Combat companions
CREATE TABLE player_companions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    player_id       UUID REFERENCES players(id) ON DELETE CASCADE,
    species_id      VARCHAR(100) NOT NULL,
    name            VARCHAR(50),
    level           INT DEFAULT 1,
    xp              BIGINT DEFAULT 0,
    is_active       BOOLEAN DEFAULT FALSE,
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### Expedition & Grid Tables

```sql
-- Active expedition
CREATE TABLE expeditions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    player_id       UUID REFERENCES players(id) ON DELETE CASCADE,
    map_id          VARCHAR(100) NOT NULL,
    status          VARCHAR(50) NOT NULL,  -- 'traveling', 'exploring', 'returning', 'complete'

    -- Resources
    rations_total   INT NOT NULL,
    rations_used    INT DEFAULT 0,

    -- Time tracking
    hours_total     INT NOT NULL,          -- Total hours available at destination
    hours_used      INT DEFAULT 0,
    current_day     INT DEFAULT 1,

    -- Position on grid
    position_x      INT DEFAULT 0,
    position_y      INT DEFAULT 0,

    -- Carry capacity tracking
    carry_capacity  INT NOT NULL,
    carry_used      INT DEFAULT 0,

    -- Timestamps
    started_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    arrived_at      TIMESTAMP WITH TIME ZONE,
    completed_at    TIMESTAMP WITH TIME ZONE,

    UNIQUE(player_id)  -- One expedition at a time
);

-- Grid state for current expedition (nodes visited, cleared, etc.)
CREATE TABLE expedition_grid_state (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    expedition_id   UUID REFERENCES expeditions(id) ON DELETE CASCADE,
    node_x          INT NOT NULL,
    node_y          INT NOT NULL,
    node_type       VARCHAR(50) NOT NULL,  -- 'mining', 'trees', 'herbs', 'monster', etc.
    is_revealed     BOOLEAN DEFAULT FALSE,
    is_cleared      BOOLEAN DEFAULT FALSE,
    cleared_at      TIMESTAMP WITH TIME ZONE,
    UNIQUE(expedition_id, node_x, node_y)
);

-- Items currently being carried (during expedition)
CREATE TABLE expedition_inventory (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    expedition_id   UUID REFERENCES expeditions(id) ON DELETE CASCADE,
    item_id         VARCHAR(100) NOT NULL,
    quantity        INT DEFAULT 1,
    quality         INT,
    weight          INT NOT NULL
);

-- XP earned during expedition (applied on return)
CREATE TABLE expedition_xp (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    expedition_id   UUID REFERENCES expeditions(id) ON DELETE CASCADE,
    skill_id        VARCHAR(50) NOT NULL,
    xp_earned       BIGINT DEFAULT 0,
    UNIQUE(expedition_id, skill_id)
);
```

### Map Definition Tables (Static Data)

```sql
-- Map templates (could also be in code/JSON)
CREATE TABLE map_definitions (
    id              VARCHAR(100) PRIMARY KEY,
    name            VARCHAR(100) NOT NULL,
    description     TEXT,
    distance        VARCHAR(20) NOT NULL,  -- 'near', 'moderate', 'far', 'extreme'
    tier            INT NOT NULL,
    grid_width      INT DEFAULT 8,
    grid_height     INT DEFAULT 8,
    base_ration_cost INT NOT NULL,
    hours_per_day   INT DEFAULT 12,
    cartography_required INT DEFAULT 1
);

-- Node templates for each map
CREATE TABLE map_node_templates (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    map_id          VARCHAR(100) REFERENCES map_definitions(id),
    node_type       VARCHAR(50) NOT NULL,
    spawn_chance    DECIMAL(3,2) NOT NULL,  -- 0.00 to 1.00
    min_count       INT DEFAULT 0,
    max_count       INT DEFAULT 5,
    skill_required  VARCHAR(50),
    level_required  INT DEFAULT 1
);
```

---

## Go Models (GORM)

### Core Models

```go
package models

import (
    "time"
    "github.com/google/uuid"
)

type Player struct {
    ID           uuid.UUID `gorm:"type:uuid;primary_key;default:gen_random_uuid()" json:"id"`
    Email        string    `gorm:"uniqueIndex;not null" json:"email"`
    PasswordHash string    `gorm:"not null" json:"-"`
    Username     string    `gorm:"uniqueIndex;not null" json:"username"`
    Gold         int64     `gorm:"default:0" json:"gold"`
    LastOnline   time.Time `gorm:"default:now()" json:"last_online"`
    CreatedAt    time.Time `json:"created_at"`
    UpdatedAt    time.Time `json:"updated_at"`

    // Relations
    Skills      []PlayerSkill     `gorm:"foreignKey:PlayerID" json:"skills,omitempty"`
    Inventory   []InventoryItem   `gorm:"foreignKey:PlayerID" json:"inventory,omitempty"`
    Equipment   []PlayerEquipment `gorm:"foreignKey:PlayerID" json:"equipment,omitempty"`
    Maps        []PlayerMap       `gorm:"foreignKey:PlayerID" json:"maps,omitempty"`
    Mounts      []PlayerMount     `gorm:"foreignKey:PlayerID" json:"mounts,omitempty"`
    Companions  []PlayerCompanion `gorm:"foreignKey:PlayerID" json:"companions,omitempty"`
    Expedition  *Expedition       `gorm:"foreignKey:PlayerID" json:"expedition,omitempty"`
}

type SkillID string

const (
    // Gathering (6)
    SkillMining      SkillID = "mining"
    SkillWoodcutting SkillID = "woodcutting"
    SkillHerbalism   SkillID = "herbalism"
    SkillFishing     SkillID = "fishing"
    SkillHunting     SkillID = "hunting"
    SkillBugCatching SkillID = "bug_catching"

    // Crafting (9)
    SkillSmithing      SkillID = "smithing"
    SkillAlchemy       SkillID = "alchemy"
    SkillCooking       SkillID = "cooking"
    SkillTailoring     SkillID = "tailoring"
    SkillJewelcrafting SkillID = "jewelcrafting"
    SkillCarpentry     SkillID = "carpentry"
    SkillEngineering   SkillID = "engineering"
    SkillArcana        SkillID = "arcana"
    SkillBrewing       SkillID = "brewing"

    // Production/Exploration (5)
    SkillFarming     SkillID = "farming"
    SkillBeastcraft  SkillID = "beastcraft"
    SkillCartography SkillID = "cartography"
    SkillSailing     SkillID = "sailing"
    SkillArchaeology SkillID = "archaeology"

    // Combat (3)
    SkillMelee  SkillID = "melee"
    SkillMagic  SkillID = "magic"
    SkillRanged SkillID = "ranged"
)

type PlayerSkill struct {
    ID        uuid.UUID `gorm:"type:uuid;primary_key;default:gen_random_uuid()" json:"id"`
    PlayerID  uuid.UUID `gorm:"type:uuid;not null" json:"player_id"`
    SkillID   SkillID   `gorm:"not null" json:"skill_id"`
    Level     int       `gorm:"default:1" json:"level"`
    CurrentXP int64     `gorm:"default:0" json:"current_xp"`
    TotalXP   int64     `gorm:"default:0" json:"total_xp"`
    CreatedAt time.Time `json:"created_at"`
    UpdatedAt time.Time `json:"updated_at"`
}
```

### Item Model with Weight

```go
// Static item definition (loaded from gamedata)
type ItemDefinition struct {
    ID             string `json:"id"`
    Name           string `json:"name"`
    Description    string `json:"description"`
    Category       string `json:"category"`  // raw_material, processed, consumable, equipment
    Tier           int    `json:"tier"`
    Weight         int    `json:"weight"`    // Affects carry capacity
    Stackable      bool   `json:"stackable"`
    MaxStack       int    `json:"max_stack"`
    BaseValue      int    `json:"base_value"`      // Gold value
    RationValue    int    `json:"ration_value"`    // For food items
    HealingValue   int    `json:"healing_value"`   // For healing items
    EquipSlot      string `json:"equip_slot"`      // If equippable
    CarryBonus     int    `json:"carry_bonus"`     // For backpacks
    SpeedBonus     float64 `json:"speed_bonus"`    // For mounts
}

type InventoryItem struct {
    ID         uuid.UUID `gorm:"type:uuid;primary_key;default:gen_random_uuid()" json:"id"`
    PlayerID   uuid.UUID `gorm:"type:uuid;not null" json:"player_id"`
    ItemID     string    `gorm:"not null" json:"item_id"`
    Quantity   int       `gorm:"default:1" json:"quantity"`
    Durability *int      `json:"durability,omitempty"`
    Quality    *int      `json:"quality,omitempty"`
    CreatedAt  time.Time `json:"created_at"`
}
```

### Mount Model

```go
type MountDefinition struct {
    ID          string  `json:"id"`
    Name        string  `json:"name"`
    Description string  `json:"description"`
    SpeedBonus  float64 `json:"speed_bonus"`   // Reduces travel time
    CarryBonus  int     `json:"carry_bonus"`   // Extra carry capacity
    FeedType    string  `json:"feed_type"`     // What it eats
    TameLevel   int     `json:"tame_level"`    // Beastcraft level required
}

type PlayerMount struct {
    ID        uuid.UUID `gorm:"type:uuid;primary_key;default:gen_random_uuid()" json:"id"`
    PlayerID  uuid.UUID `gorm:"type:uuid;not null" json:"player_id"`
    SpeciesID string    `gorm:"not null" json:"species_id"`
    Name      string    `json:"name"`
    IsActive  bool      `gorm:"default:false" json:"is_active"`
    CreatedAt time.Time `json:"created_at"`
}

// Mount types with trade-offs
var MountTypes = map[string]MountDefinition{
    "horse": {
        ID: "horse", Name: "Horse",
        SpeedBonus: 0.3, CarryBonus: 20,
        FeedType: "grain", TameLevel: 10,
    },
    "mule": {
        ID: "mule", Name: "Mule",
        SpeedBonus: -0.2, CarryBonus: 50,
        FeedType: "hay", TameLevel: 15,
    },
    "camel": {
        ID: "camel", Name: "Camel",
        SpeedBonus: 0.0, CarryBonus: 30,
        FeedType: "minimal", TameLevel: 20,
    },
    "giant_eagle": {
        ID: "giant_eagle", Name: "Giant Eagle",
        SpeedBonus: 0.5, CarryBonus: 10,
        FeedType: "meat", TameLevel: 50,
    },
}
```

### Expedition & Grid Models

```go
type ExpeditionStatus string

const (
    ExpeditionTraveling  ExpeditionStatus = "traveling"
    ExpeditionExploring  ExpeditionStatus = "exploring"
    ExpeditionReturning  ExpeditionStatus = "returning"
    ExpeditionComplete   ExpeditionStatus = "complete"
)

type Expedition struct {
    ID            uuid.UUID        `gorm:"type:uuid;primary_key;default:gen_random_uuid()" json:"id"`
    PlayerID      uuid.UUID        `gorm:"type:uuid;uniqueIndex;not null" json:"player_id"`
    MapID         string           `gorm:"not null" json:"map_id"`
    Status        ExpeditionStatus `gorm:"not null" json:"status"`

    // Resources
    RationsTotal  int `gorm:"not null" json:"rations_total"`
    RationsUsed   int `gorm:"default:0" json:"rations_used"`

    // Time
    HoursTotal    int `gorm:"not null" json:"hours_total"`
    HoursUsed     int `gorm:"default:0" json:"hours_used"`
    CurrentDay    int `gorm:"default:1" json:"current_day"`

    // Position
    PositionX     int `gorm:"default:0" json:"position_x"`
    PositionY     int `gorm:"default:0" json:"position_y"`

    // Carry
    CarryCapacity int `gorm:"not null" json:"carry_capacity"`
    CarryUsed     int `gorm:"default:0" json:"carry_used"`

    // Timestamps
    StartedAt     time.Time  `gorm:"default:now()" json:"started_at"`
    ArrivedAt     *time.Time `json:"arrived_at,omitempty"`
    CompletedAt   *time.Time `json:"completed_at,omitempty"`

    // Relations
    GridState     []ExpeditionGridNode `gorm:"foreignKey:ExpeditionID" json:"grid_state,omitempty"`
    Inventory     []ExpeditionItem     `gorm:"foreignKey:ExpeditionID" json:"inventory,omitempty"`
    XPEarned      []ExpeditionXP       `gorm:"foreignKey:ExpeditionID" json:"xp_earned,omitempty"`
}

type NodeType string

const (
    NodeMining   NodeType = "mining"
    NodeTrees    NodeType = "trees"
    NodeHerbs    NodeType = "herbs"
    NodeMonster  NodeType = "monster"
    NodeFishing  NodeType = "fishing"
    NodeRuins    NodeType = "ruins"
    NodeEmpty    NodeType = "empty"
    NodeBlocked  NodeType = "blocked"  // Impassable terrain
)

type ExpeditionGridNode struct {
    ID           uuid.UUID `gorm:"type:uuid;primary_key;default:gen_random_uuid()" json:"id"`
    ExpeditionID uuid.UUID `gorm:"type:uuid;not null" json:"expedition_id"`
    X            int       `gorm:"not null" json:"x"`
    Y            int       `gorm:"not null" json:"y"`
    NodeType     NodeType  `gorm:"not null" json:"node_type"`

    // What's at this node (references static definitions)
    ResourceID   string    `json:"resource_id,omitempty"`   // e.g., "iron_ore", "oak_tree"
    MonsterID    string    `json:"monster_id,omitempty"`    // e.g., "wolf", "goblin"

    // Quantities
    ResourceQty  int       `json:"resource_qty,omitempty"`  // How much is here

    // State
    IsRevealed   bool      `gorm:"default:false" json:"is_revealed"`
    IsCleared    bool      `gorm:"default:false" json:"is_cleared"`

    // Terrain
    MoveCost     int       `gorm:"default:1" json:"move_cost"`  // Hours to enter

    ClearedAt    *time.Time `json:"cleared_at,omitempty"`
}

type ExpeditionItem struct {
    ID           uuid.UUID `gorm:"type:uuid;primary_key;default:gen_random_uuid()" json:"id"`
    ExpeditionID uuid.UUID `gorm:"type:uuid;not null" json:"expedition_id"`
    ItemID       string    `gorm:"not null" json:"item_id"`
    Quantity     int       `gorm:"default:1" json:"quantity"`
    Quality      *int      `json:"quality,omitempty"`
    Weight       int       `gorm:"not null" json:"weight"`
}

type ExpeditionXP struct {
    ID           uuid.UUID `gorm:"type:uuid;primary_key;default:gen_random_uuid()" json:"id"`
    ExpeditionID uuid.UUID `gorm:"type:uuid;not null" json:"expedition_id"`
    SkillID      string    `gorm:"not null" json:"skill_id"`
    XPEarned     int64     `gorm:"default:0" json:"xp_earned"`
}
```

---

## API Endpoints

### Authentication
```
POST   /api/auth/register
POST   /api/auth/login
POST   /api/auth/refresh
```

### Player
```
GET    /api/player              - Get player state
PATCH  /api/player              - Update settings
```

### Skills
```
GET    /api/skills              - List all skills with progress
GET    /api/skills/:id          - Skill details
```

### Inventory & Equipment
```
GET    /api/inventory           - List stored items
POST   /api/equipment/equip     - Equip item to slot
POST   /api/equipment/unequip   - Remove from slot
GET    /api/equipment           - Current loadout
```

### Maps
```
GET    /api/maps                - List owned maps
POST   /api/maps/buy            - Buy map from shop
POST   /api/maps/research       - Research map at library
GET    /api/maps/:id            - Map details (info based on Cartography)
```

### Expeditions
```
POST   /api/expedition/start    - Start expedition (with loadout)
GET    /api/expedition          - Current expedition state
GET    /api/expedition/grid     - Get grid state
POST   /api/expedition/move     - Move to position
POST   /api/expedition/gather   - Gather at current node (manual/auto)
POST   /api/expedition/fight    - Fight at current node (manual/auto)
POST   /api/expedition/skip     - Skip current node
POST   /api/expedition/return   - Start return journey
POST   /api/expedition/drop     - Drop items from carry
```

### Town Activities
```
POST   /api/town/process        - Process raw materials (smelt, mill, etc.)
POST   /api/town/craft          - Craft item from recipe
GET    /api/recipes             - Available recipes
```

### Mounts & Companions
```
GET    /api/mounts              - List owned mounts
POST   /api/mounts/:id/activate - Set active mount
GET    /api/companions          - List companions
POST   /api/companions/:id/activate - Set active companion
```

---

## Core Systems

### 1. Grid Generation Service

```go
package services

type GridGenerationService struct {
    db *gorm.DB
}

type GridConfig struct {
    Width           int
    Height          int
    EntryPoint      Position
    NodeTypes       []NodeSpawnConfig
    CartographyLevel int  // Affects what's revealed initially
}

type NodeSpawnConfig struct {
    Type        NodeType
    SpawnChance float64
    MinCount    int
    MaxCount    int
    Resources   []ResourceConfig
}

type Position struct {
    X int
    Y int
}

func (s *GridGenerationService) GenerateGrid(expeditionID uuid.UUID, mapDef MapDefinition, cartoLevel int) ([]ExpeditionGridNode, error) {
    nodes := make([]ExpeditionGridNode, 0)

    // Generate nodes based on map definition and spawn chances
    for y := 0; y < mapDef.GridHeight; y++ {
        for x := 0; x < mapDef.GridWidth; x++ {
            node := s.generateNode(expeditionID, x, y, mapDef)

            // Reveal nodes near entry based on Cartography
            if s.distanceFromEntry(x, y, mapDef.EntryPoint) <= s.revealRadius(cartoLevel) {
                node.IsRevealed = true
            }

            nodes = append(nodes, node)
        }
    }

    return nodes, nil
}

func (s *GridGenerationService) revealRadius(cartoLevel int) int {
    // Higher cartography = see more of the grid initially
    return 1 + (cartoLevel / 20)  // 1 at level 1, 2 at level 20, etc.
}
```

### 2. Navigation & Movement Service

```go
package services

type NavigationService struct {
    db *gorm.DB
}

type MoveResult struct {
    NewPosition   Position
    HoursUsed     int
    NodesRevealed []Position
    Error         error
}

func (s *NavigationService) Move(expedition *Expedition, targetX, targetY int) (*MoveResult, error) {
    // Validate move is to adjacent tile
    if !s.isAdjacent(expedition.PositionX, expedition.PositionY, targetX, targetY) {
        return nil, errors.New("can only move to adjacent tiles")
    }

    // Get target node
    var targetNode ExpeditionGridNode
    if err := s.db.Where("expedition_id = ? AND x = ? AND y = ?",
        expedition.ID, targetX, targetY).First(&targetNode).Error; err != nil {
        return nil, err
    }

    // Check if passable
    if targetNode.NodeType == NodeBlocked {
        return nil, errors.New("cannot move to blocked terrain")
    }

    // Check hours available
    if expedition.HoursUsed + targetNode.MoveCost > expedition.HoursTotal {
        return nil, errors.New("not enough hours remaining")
    }

    // Move
    expedition.PositionX = targetX
    expedition.PositionY = targetY
    expedition.HoursUsed += targetNode.MoveCost

    // Reveal adjacent nodes
    revealed := s.revealAdjacent(expedition.ID, targetX, targetY)

    s.db.Save(expedition)

    return &MoveResult{
        NewPosition:   Position{X: targetX, Y: targetY},
        HoursUsed:     targetNode.MoveCost,
        NodesRevealed: revealed,
    }, nil
}

func (s *NavigationService) isAdjacent(x1, y1, x2, y2 int) bool {
    dx := abs(x2 - x1)
    dy := abs(y2 - y1)
    return dx <= 1 && dy <= 1 && (dx + dy) > 0
}
```

### 3. Gathering Service (Manual vs Auto)

```go
package services

type GatheringService struct {
    db *gorm.DB
}

type GatherMode string

const (
    GatherManual GatherMode = "manual"
    GatherAuto   GatherMode = "auto"
)

type GatherResult struct {
    ItemsGained   []ItemGain
    XPGained      int64
    HoursUsed     int
    Efficiency    float64  // 0.7 for auto, 0.85-1.0 for manual
    NodeCleared   bool
    CarryUsed     int
}

type ItemGain struct {
    ItemID   string
    Quantity int
    Weight   int
}

func (s *GatheringService) Gather(
    expedition *Expedition,
    node *ExpeditionGridNode,
    mode GatherMode,
    minigameScore float64,  // 0-1, only used if mode == manual
) (*GatherResult, error) {

    if node.IsCleared {
        return nil, errors.New("node already cleared")
    }

    // Calculate efficiency based on mode
    var efficiency float64
    if mode == GatherAuto {
        efficiency = 0.70
    } else {
        // Manual: 0.85 base + up to 0.15 from minigame performance
        efficiency = 0.85 + (minigameScore * 0.15)
    }

    // Get resource definition
    resourceDef := gamedata.GetResource(node.ResourceID)

    // Calculate yield
    baseYield := node.ResourceQty
    actualYield := int(float64(baseYield) * efficiency)

    // Apply skill bonus
    skillLevel := s.getSkillLevel(expedition.PlayerID, resourceDef.SkillID)
    skillBonus := 1.0 + (float64(skillLevel) * 0.01)
    actualYield = int(float64(actualYield) * skillBonus)

    // Calculate weight
    itemDef := gamedata.GetItem(resourceDef.ItemID)
    totalWeight := actualYield * itemDef.Weight

    // Check carry capacity
    if expedition.CarryUsed + totalWeight > expedition.CarryCapacity {
        // Reduce to fit
        maxItems := (expedition.CarryCapacity - expedition.CarryUsed) / itemDef.Weight
        if maxItems <= 0 {
            return nil, errors.New("inventory full")
        }
        actualYield = maxItems
        totalWeight = actualYield * itemDef.Weight
    }

    // Add to expedition inventory
    s.addToExpeditionInventory(expedition.ID, resourceDef.ItemID, actualYield, totalWeight)

    // Update expedition state
    expedition.CarryUsed += totalWeight
    expedition.HoursUsed += resourceDef.GatherTime

    // Add XP
    xpGained := int64(actualYield) * resourceDef.XPPerItem
    s.addExpeditionXP(expedition.ID, resourceDef.SkillID, xpGained)

    // Mark node cleared
    node.IsCleared = true
    now := time.Now()
    node.ClearedAt = &now
    s.db.Save(node)

    s.db.Save(expedition)

    return &GatherResult{
        ItemsGained: []ItemGain{{
            ItemID:   resourceDef.ItemID,
            Quantity: actualYield,
            Weight:   totalWeight,
        }},
        XPGained:    xpGained,
        HoursUsed:   resourceDef.GatherTime,
        Efficiency:  efficiency,
        NodeCleared: true,
        CarryUsed:   totalWeight,
    }, nil
}
```

### 4. Cartography Information Service

```go
package services

type CartographyService struct {
    db *gorm.DB
}

type MapInfo struct {
    MapID       string
    Name        string
    Distance    string
    Tier        int

    // Detail level depends on Cartography
    ShowsResources    bool
    ShowsQuantities   bool
    ShowsMonsters     bool
    ShowsMoveCosts    bool
    ShowsHiddenNodes  bool

    Resources   []ResourcePreview   // What you can see before going
    Monsters    []MonsterPreview
}

type ResourcePreview struct {
    Type        string  // "mining", "trees", "herbs"
    Name        string  // Only if ShowsResources
    Quantity    string  // "some", "moderate", "abundant" or actual numbers
}

func (s *CartographyService) GetMapInfo(mapID string, cartoLevel int) (*MapInfo, error) {
    mapDef := gamedata.GetMap(mapID)
    if mapDef == nil {
        return nil, errors.New("map not found")
    }

    info := &MapInfo{
        MapID:    mapID,
        Name:     mapDef.Name,
        Distance: mapDef.Distance,
        Tier:     mapDef.Tier,
    }

    // Determine detail level based on Cartography
    info.ShowsResources = cartoLevel >= 20
    info.ShowsQuantities = cartoLevel >= 40
    info.ShowsMonsters = cartoLevel >= 30
    info.ShowsMoveCosts = cartoLevel >= 50
    info.ShowsHiddenNodes = cartoLevel >= 70

    // Build previews based on what's visible
    if info.ShowsResources {
        info.Resources = s.buildResourcePreviews(mapDef, info.ShowsQuantities)
    }
    if info.ShowsMonsters {
        info.Monsters = s.buildMonsterPreviews(mapDef)
    }

    return info, nil
}
```

### 5. Carry Capacity Calculator

```go
package services

type CarryCapacityService struct{}

func (s *CarryCapacityService) Calculate(player *Player) int {
    baseCapacity := 25

    // Add backpack bonus
    backpack := s.getEquippedItem(player, "backpack")
    if backpack != nil {
        backpackDef := gamedata.GetItem(backpack.ItemID)
        baseCapacity += backpackDef.CarryBonus
    }

    // Add mount bonus
    mount := s.getActiveMount(player)
    if mount != nil {
        mountDef := gamedata.GetMount(mount.SpeciesID)
        baseCapacity += mountDef.CarryBonus
    }

    // Add saddlebags (only if mount equipped)
    if mount != nil {
        saddlebags := s.getEquippedItem(player, "saddlebags")
        if saddlebags != nil {
            saddlebagsDef := gamedata.GetItem(saddlebags.ItemID)
            baseCapacity += saddlebagsDef.CarryBonus
        }
    }

    return baseCapacity
}
```

---

## Project Structure

```
idle-rpg-backend/
├── cmd/
│   └── server/
│       └── main.go
├── internal/
│   ├── config/
│   ├── database/
│   ├── handlers/
│   │   ├── auth.go
│   │   ├── player.go
│   │   ├── expedition.go
│   │   ├── grid.go
│   │   ├── gathering.go
│   │   ├── combat.go
│   │   ├── town.go
│   │   └── maps.go
│   ├── middleware/
│   ├── models/
│   │   ├── player.go
│   │   ├── skill.go
│   │   ├── inventory.go
│   │   ├── expedition.go
│   │   ├── grid.go
│   │   ├── mount.go
│   │   └── companion.go
│   ├── services/
│   │   ├── grid_generation.go
│   │   ├── navigation.go
│   │   ├── gathering.go
│   │   ├── combat.go
│   │   ├── cartography.go
│   │   ├── carry_capacity.go
│   │   ├── crafting.go
│   │   └── processing.go
│   └── router/
├── pkg/
│   └── gamedata/
│       ├── items.go
│       ├── resources.go
│       ├── maps.go
│       ├── monsters.go
│       ├── recipes.go
│       └── mounts.go
├── migrations/
├── go.mod
├── Dockerfile
└── docker-compose.yml
```

---

## MVP Scope

### Phase 1: Grid Exploration Core (10-12 weeks)

**Must Have:**
- [ ] Basic expedition flow: prepare → travel → explore grid → return
- [ ] Grid generation and navigation
- [ ] 3 node types: Mining, Trees, Herbs
- [ ] Manual vs Auto gathering (mining minigame only)
- [ ] Carry capacity system with backpack
- [ ] Basic inventory and storage
- [ ] 6 gathering skills
- [ ] 3 crafting skills (Smithing, Cooking, Tailoring)
- [ ] Ration system for travel

**Deferred:**
- Combat
- Mounts
- Companions
- Most crafting skills

### Phase 2: Combat & Mounts (8-10 weeks)

**Must Have:**
- [ ] Monster nodes
- [ ] Combat system (manual minigame + auto)
- [ ] 3 combat skills
- [ ] Mount taming and usage
- [ ] Beastcraft skill
- [ ] Saddlebags

### Phase 3: Full Content (10-12 weeks)

**Must Have:**
- [ ] All 23 skills
- [ ] Companions
- [ ] Cartography research system
- [ ] Full recipe library
- [ ] Multiple map tiers
- [ ] Sailing (for water maps)

---

## Open Technical Questions

- [x] Canvas vs SVG for grid rendering? → **Canvas**
- [x] Minigame framework - how to make them pluggable? → **Custom per minigame** (not a unified system)
- [x] Real-time sync vs pull-on-action for multiplayer features? → **HTTP pull/push on action** (no WebSockets, offline-friendly)
- [x] Local storage strategy for offline play → **Deterministic seeds + action log** (see Architecture section)
- [ ] How to handle "auto" mode when app is backgrounded?
- [ ] Push notifications for expedition events?

---

## Glossary

| Term | Definition |
|------|------------|
| **Expedition** | Trip to a grid-based map to gather/fight |
| **Node** | Single tile on the grid with a resource/monster |
| **Manual** | Playing minigame for 85-100% yield |
| **Auto** | Hands-off gathering at 70% yield |
| **Carry Capacity** | Total weight player can bring back |
| **Rations** | Food consumed for travel and staying at location |
| **Hours** | Time units spent on the grid (movement, gathering) |

CREATE TYPE item_category AS ENUM ('map', 'tool', 'ingredient', 'consumable');
CREATE TYPE slot_type AS ENUM ('weapon', 'armour', 'misc');

CREATE TABLE IF NOT EXISTS item_definitions (
    id          TEXT        PRIMARY KEY,           -- e.g. 'iron_ore'
    name        TEXT        NOT NULL,
    category    item_category NOT NULL,
    subcategory TEXT,
    icon        TEXT        NOT NULL DEFAULT '',
    stackable   BOOLEAN     NOT NULL DEFAULT TRUE,
    slot_type   slot_type,                         -- NULL for non-tools
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed data: at least 10 definitions covering all 4 categories
INSERT INTO item_definitions (id, name, category, subcategory, icon, stackable, slot_type) VALUES
  -- map
  ('basic_map',    'Basic Map',     'map',        'dungeon',  '🗺️',  FALSE, NULL),
  ('ancient_map',  'Ancient Map',   'map',        'dungeon',  '📜',  FALSE, NULL),
  -- tool (weapon)
  ('iron_sword',   'Iron Sword',    'tool',       'melee',    '⚔️',  FALSE, 'weapon'),
  ('steel_sword',  'Steel Sword',   'tool',       'melee',    '🗡️',  FALSE, 'weapon'),
  -- tool (armour)
  ('iron_shield',  'Iron Shield',   'tool',       'offhand',  '🛡️',  FALSE, 'armour'),
  ('leather_helm', 'Leather Helm',  'tool',       'head',     '⛑️',  FALSE, 'armour'),
  -- ingredient
  ('iron_ore',     'Iron Ore',      'ingredient', 'metal',    '🪨',  TRUE,  NULL),
  ('oak_log',      'Oak Log',       'ingredient', 'wood',     '🪵',  TRUE,  NULL),
  ('stone',        'Stone',         'ingredient', 'mineral',  '🪨',  TRUE,  NULL),
  -- consumable
  ('health_potion','Health Potion', 'consumable', 'potion',   '🧪',  TRUE,  NULL),
  ('stamina_pot',  'Stamina Potion','consumable', 'potion',   '⚗️',  TRUE,  NULL)
ON CONFLICT (id) DO NOTHING;

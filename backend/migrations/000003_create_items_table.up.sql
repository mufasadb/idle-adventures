CREATE TABLE IF NOT EXISTS items (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    player_id       UUID        NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    item_def_id     TEXT        NOT NULL REFERENCES item_definitions(id),
    quantity        INTEGER     NOT NULL DEFAULT 1 CHECK (quantity > 0),
    stash_position  INTEGER,    -- NULL means not in stash grid
    seed            INTEGER,    -- maps only: world generation seed
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_items_player_id ON items(player_id);

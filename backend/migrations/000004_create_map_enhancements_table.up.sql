CREATE TABLE IF NOT EXISTS map_enhancements (
    id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    item_id                 UUID        NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    enhancement_item_def_id TEXT        NOT NULL REFERENCES item_definitions(id),
    applied_order           INTEGER     NOT NULL DEFAULT 0,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_map_enhancements_item_id ON map_enhancements(item_id);

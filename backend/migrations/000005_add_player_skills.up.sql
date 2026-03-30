-- Add dedicated skills column to players table.
-- Skills are stored as a JSONB array of objects with id, name, level, xp fields.
-- Keeping skills separate from game_state makes them first-class and queryable.
ALTER TABLE players
    ADD COLUMN IF NOT EXISTS skills JSONB NOT NULL DEFAULT '[]';

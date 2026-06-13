ALTER TABLE rule_versions ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';
ALTER TABLE rule_versions ADD COLUMN IF NOT EXISTS is_favorite BOOLEAN DEFAULT FALSE;

ALTER TABLE rule_versions ALTER COLUMN change_summary TYPE JSONB USING change_summary::jsonb;
ALTER TABLE rule_versions ALTER COLUMN change_summary DROP NOT NULL;
ALTER TABLE rule_versions ALTER COLUMN change_summary SET DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_rule_versions_tags ON rule_versions USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_rule_versions_is_favorite ON rule_versions(rule_id, is_favorite) WHERE is_favorite = TRUE;

CREATE TABLE IF NOT EXISTS replay_bookmarks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID REFERENCES replay_sessions(id) ON DELETE CASCADE NOT NULL,
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE NOT NULL,
    name VARCHAR(200) NOT NULL,
    event_index INTEGER NOT NULL,
    progress_snapshot JSONB NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_replay_bookmarks_session ON replay_bookmarks(session_id);
CREATE INDEX IF NOT EXISTS idx_replay_bookmarks_tenant ON replay_bookmarks(tenant_id);
CREATE INDEX IF NOT EXISTS idx_replay_bookmarks_session_created ON replay_bookmarks(session_id, created_at);

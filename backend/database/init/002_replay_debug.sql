CREATE TABLE IF NOT EXISTS replay_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE NOT NULL,
    name VARCHAR(200) NOT NULL,
    description TEXT,
    start_time TIMESTAMP,
    end_time TIMESTAMP,
    status VARCHAR(20) NOT NULL DEFAULT 'recording',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_replay_sessions_tenant ON replay_sessions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_replay_sessions_status ON replay_sessions(status);
CREATE INDEX IF NOT EXISTS idx_replay_sessions_name ON replay_sessions(tenant_id, name);

CREATE TABLE IF NOT EXISTS replay_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID REFERENCES replay_sessions(id) ON DELETE CASCADE NOT NULL,
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE NOT NULL,
    event_source VARCHAR(100) NOT NULL,
    event_payload JSONB NOT NULL,
    original_matched_rule_ids UUID[] DEFAULT ARRAY[]::UUID[],
    original_timestamp TIMESTAMP NOT NULL,
    recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_replay_events_session ON replay_events(session_id);
CREATE INDEX IF NOT EXISTS idx_replay_events_tenant ON replay_events(tenant_id);
CREATE INDEX IF NOT EXISTS idx_replay_events_recorded ON replay_events(session_id, recorded_at);

CREATE TABLE IF NOT EXISTS replay_results (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID REFERENCES replay_sessions(id) ON DELETE CASCADE NOT NULL,
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE NOT NULL,
    event_id UUID REFERENCES replay_events(id) ON DELETE CASCADE NOT NULL,
    rule_id UUID,
    matched BOOLEAN NOT NULL DEFAULT false,
    match_detail JSONB,
    replayed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_replay_results_session ON replay_results(session_id);
CREATE INDEX IF NOT EXISTS idx_replay_results_event ON replay_results(event_id);
CREATE INDEX IF NOT EXISTS idx_replay_results_tenant ON replay_results(tenant_id);

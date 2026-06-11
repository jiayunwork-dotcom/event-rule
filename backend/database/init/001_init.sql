CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE tenants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    api_key VARCHAR(255) UNIQUE NOT NULL,
    webhook_secret VARCHAR(255) NOT NULL,
    timezone VARCHAR(50) DEFAULT 'Asia/Shanghai',
    max_rules INT DEFAULT 100,
    max_events_per_second INT DEFAULT 1000,
    max_active_alerts INT DEFAULT 500,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT true
);

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) DEFAULT 'user',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE event_sources (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    type VARCHAR(20) NOT NULL,
    name VARCHAR(100) NOT NULL,
    config JSONB,
    is_enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE agent_configs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    host VARCHAR(255) NOT NULL,
    cpu_enabled BOOLEAN DEFAULT true,
    memory_enabled BOOLEAN DEFAULT true,
    disk_enabled BOOLEAN DEFAULT true,
    network_enabled BOOLEAN DEFAULT true,
    interval INT DEFAULT 60,
    tags JSONB,
    is_active BOOLEAN DEFAULT true,
    last_heartbeat TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE rules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    severity VARCHAR(20) NOT NULL,
    condition_type VARCHAR(20) NOT NULL,
    conditions JSONB NOT NULL,
    dsl TEXT,
    priority INT DEFAULT 0,
    is_enabled BOOLEAN DEFAULT true,
    window_size INT DEFAULT 300,
    group_by_labels VARCHAR(255)[] DEFAULT ARRAY[]::VARCHAR[],
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE alerts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    rule_id UUID REFERENCES rules(id) ON DELETE SET NULL,
    fingerprint VARCHAR(64) NOT NULL,
    name VARCHAR(200) NOT NULL,
    severity VARCHAR(20) NOT NULL,
    status VARCHAR(20) DEFAULT 'pending',
    labels JSONB,
    value NUMERIC,
    count INT DEFAULT 1,
    first_triggered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_triggered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    acknowledged_at TIMESTAMP,
    acknowledged_by UUID REFERENCES users(id),
    processing_at TIMESTAMP,
    processing_by UUID REFERENCES users(id),
    resolved_at TIMESTAMP,
    resolved_by UUID REFERENCES users(id),
    resolved_reason TEXT,
    escalation_level INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_alerts_fingerprint ON alerts(fingerprint);
CREATE INDEX idx_alerts_tenant_status ON alerts(tenant_id, status);
CREATE INDEX idx_alerts_tenant_severity ON alerts(tenant_id, severity);

CREATE TABLE alert_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    alert_id UUID REFERENCES alerts(id) ON DELETE CASCADE,
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    old_status VARCHAR(20),
    new_status VARCHAR(20) NOT NULL,
    operator_id UUID REFERENCES users(id),
    remark TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE silences (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    matchers JSONB,
    starts_at TIMESTAMP NOT NULL,
    ends_at TIMESTAMP NOT NULL,
    created_by UUID REFERENCES users(id),
    comment TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE inhibit_rules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    source_matchers JSONB,
    target_matchers JSONB,
    equal_labels VARCHAR(255)[] DEFAULT ARRAY[]::VARCHAR[],
    is_enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE notification_channels (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    type VARCHAR(20) NOT NULL,
    name VARCHAR(100) NOT NULL,
    config JSONB,
    template TEXT,
    is_enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE notification_policies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    severity_levels VARCHAR(20)[] DEFAULT ARRAY[]::VARCHAR[],
    channel_ids UUID[] DEFAULT ARRAY[]::UUID[],
    schedule_id UUID,
    escalation_chain JSONB,
    is_default BOOLEAN DEFAULT false,
    is_enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE schedules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    type VARCHAR(20) NOT NULL,
    shifts JSONB,
    rotations JSONB,
    holidays JSONB,
    timezone VARCHAR(50),
    is_enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    alert_id UUID REFERENCES alerts(id) ON DELETE CASCADE,
    channel_id UUID REFERENCES notification_channels(id),
    channel_type VARCHAR(20) NOT NULL,
    recipient VARCHAR(255),
    content TEXT,
    status VARCHAR(20) DEFAULT 'pending',
    retry_count INT DEFAULT 0,
    max_retries INT DEFAULT 3,
    next_retry_at TIMESTAMP,
    error_message TEXT,
    sent_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_notifications_status ON notifications(status);
CREATE INDEX idx_notifications_next_retry ON notifications(next_retry_at);

CREATE TABLE dead_letter_queue (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    notification_id UUID REFERENCES notifications(id),
    original_data JSONB,
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE metrics (
    id BIGSERIAL PRIMARY KEY,
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    timestamp TIMESTAMP NOT NULL,
    metric_name VARCHAR(100) NOT NULL,
    value NUMERIC NOT NULL,
    labels JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_metrics_tenant_time ON metrics(tenant_id, timestamp DESC);
CREATE INDEX idx_metrics_tenant_name ON metrics(tenant_id, metric_name, timestamp DESC);

CREATE TABLE rule_hits (
    id BIGSERIAL PRIMARY KEY,
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    rule_id UUID REFERENCES rules(id) ON DELETE CASCADE,
    timestamp TIMESTAMP NOT NULL,
    count INT DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_rule_hits_tenant_time ON rule_hits(tenant_id, timestamp DESC);

CREATE TABLE rule_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    type VARCHAR(20) NOT NULL DEFAULT 'custom',
    name VARCHAR(100) NOT NULL,
    description TEXT,
    severity VARCHAR(20) NOT NULL DEFAULT 'warning',
    condition_type VARCHAR(20) NOT NULL DEFAULT 'single_threshold',
    conditions JSONB NOT NULL,
    dsl TEXT,
    priority INT DEFAULT 0,
    window_size INT DEFAULT 300,
    group_by_labels VARCHAR(255)[] DEFAULT ARRAY[]::VARCHAR[],
    scene_tags VARCHAR(255)[] DEFAULT ARRAY[]::VARCHAR[],
    suggested_threshold VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_rule_templates_tenant ON rule_templates(tenant_id);
CREATE INDEX idx_rule_templates_type ON rule_templates(type);

INSERT INTO rule_templates (id, type, name, description, severity, condition_type, conditions, priority, window_size, group_by_labels, scene_tags, suggested_threshold) VALUES
('00000000-0000-0000-0000-000000000010', 'system', 'CPU使用率告警', '当CPU使用率持续超过阈值时触发告警，适用于服务器资源监控', 'warning', 'window_aggregate', '{"operator": "AND", "conditions": [{"type": "window", "metric": "cpu_usage", "aggregate": "avg", "operator": "gt", "threshold": 80}]}', 1, 300, ARRAY['host']::VARCHAR[], ARRAY['基础设施', 'CPU', '资源监控']::VARCHAR[], '80%'),
('00000000-0000-0000-0000-000000000011', 'system', '内存使用率告警', '当内存使用率持续超过阈值时触发告警，适用于服务器资源监控', 'critical', 'window_aggregate', '{"operator": "AND", "conditions": [{"type": "window", "metric": "memory_usage", "aggregate": "avg", "operator": "gt", "threshold": 90}]}', 2, 180, ARRAY['host']::VARCHAR[], ARRAY['基础设施', '内存', '资源监控']::VARCHAR[], '90%'),
('00000000-0000-0000-0000-000000000012', 'system', '磁盘使用率告警', '当磁盘使用率超过阈值时触发告警，适用于磁盘空间监控', 'warning', 'single_threshold', '{"operator": "AND", "conditions": [{"type": "threshold", "metric": "disk_usage", "operator": "gt", "value": 85}]}', 1, 300, ARRAY['host', 'mount']::VARCHAR[], ARRAY['基础设施', '磁盘', '资源监控']::VARCHAR[], '85%'),
('00000000-0000-0000-0000-000000000013', 'system', '服务响应时间告警', '当服务P99响应时间超过阈值时触发告警，适用于应用性能监控', 'warning', 'window_aggregate', '{"operator": "AND", "conditions": [{"type": "window", "metric": "response_time_p99", "aggregate": "avg", "operator": "gt", "threshold": 2000}]}', 2, 300, ARRAY['service', 'endpoint']::VARCHAR[], ARRAY['应用性能', '响应时间', 'APM']::VARCHAR[], '2秒'),
('00000000-0000-0000-0000-000000000014', 'system', '错误率告警', '当5分钟窗口内错误率超过阈值时触发告警，适用于服务可用性监控', 'critical', 'window_aggregate', '{"operator": "AND", "conditions": [{"type": "window", "metric": "error_rate", "aggregate": "avg", "operator": "gt", "threshold": 5}]}', 3, 300, ARRAY['service']::VARCHAR[], ARRAY['应用性能', '错误率', '可用性']::VARCHAR[], '5%'),
('00000000-0000-0000-0000-000000000015', 'system', '服务宕机检测', '当心跳超时60秒时触发告警，适用于服务存活状态监控', 'fatal', 'frequency', '{"operator": "AND", "conditions": [{"type": "frequency", "windowSize": 60, "threshold": 0}]}', 5, 60, ARRAY['service', 'instance']::VARCHAR[], ARRAY['可用性', '心跳', '存活检测']::VARCHAR[], '心跳超时60秒');

INSERT INTO tenants (id, name, api_key, webhook_secret) VALUES
('00000000-0000-0000-0000-000000000001', 'Default Tenant', 'default-api-key-123', 'default-secret-456');

INSERT INTO users (tenant_id, username, email, password_hash, role) VALUES
('00000000-0000-0000-0000-000000000001', 'admin', 'admin@example.com', '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'admin');

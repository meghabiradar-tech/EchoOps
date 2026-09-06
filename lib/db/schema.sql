-- ============================================================================
-- EchoOps PostgreSQL Database Schema with pgvector
-- Team Lead: Monisha K P (Backend & Integrations)
-- ============================================================================

-- Enable pgvector extension for semantic memory / past incident similarity search
CREATE EXTENSION IF NOT EXISTS vector;

-- Incidents Table
CREATE TABLE IF NOT EXISTS incidents (
    id VARCHAR(64) PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    scenario VARCHAR(64) NOT NULL DEFAULT 'tech_outage',
    severity VARCHAR(16) NOT NULL CHECK (severity IN ('Sev-1', 'Sev-2', 'Sev-3')),
    status VARCHAR(32) NOT NULL CHECK (status IN ('investigating', 'identified', 'monitoring', 'resolved')),
    channel_name VARCHAR(128) NOT NULL,
    summary TEXT,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMPTZ,
    unresolved_risks JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Participants Table
CREATE TABLE IF NOT EXISTS participants (
    id SERIAL PRIMARY KEY,
    incident_id VARCHAR(64) REFERENCES incidents(id) ON DELETE CASCADE,
    uid VARCHAR(64) NOT NULL,
    name VARCHAR(128) NOT NULL,
    role VARCHAR(64) NOT NULL,
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Action Items Table
CREATE TABLE IF NOT EXISTS actions (
    id VARCHAR(64) PRIMARY KEY,
    incident_id VARCHAR(64) REFERENCES incidents(id) ON DELETE CASCADE,
    task TEXT NOT NULL,
    owner VARCHAR(128) NOT NULL,
    deadline VARCHAR(128),
    status VARCHAR(32) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'blocked')),
    requires_confirmation BOOLEAN NOT NULL DEFAULT FALSE,
    confirmed BOOLEAN NOT NULL DEFAULT FALSE,
    confirmed_by VARCHAR(128),
    confirmed_at TIMESTAMPTZ,
    jira_ticket_id VARCHAR(64),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

-- Timeline Events Table
CREATE TABLE IF NOT EXISTS timeline_events (
    id VARCHAR(64) PRIMARY KEY,
    incident_id VARCHAR(64) REFERENCES incidents(id) ON DELETE CASCADE,
    time VARCHAR(32) NOT NULL,
    timestamp BIGINT NOT NULL,
    speaker VARCHAR(128) NOT NULL,
    category VARCHAR(32) NOT NULL CHECK (category IN ('fact', 'hypothesis', 'decision', 'action', 'conflict', 'gap', 'status_change', 'tool_execution')),
    note TEXT NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Facts Table
CREATE TABLE IF NOT EXISTS facts (
    id VARCHAR(64) PRIMARY KEY,
    incident_id VARCHAR(64) REFERENCES incidents(id) ON DELETE CASCADE,
    statement TEXT NOT NULL,
    verified_by VARCHAR(128) NOT NULL,
    confidence NUMERIC(3, 2) DEFAULT 1.00,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Hypotheses & Assumptions Table
CREATE TABLE IF NOT EXISTS hypotheses (
    id VARCHAR(64) PRIMARY KEY,
    incident_id VARCHAR(64) REFERENCES incidents(id) ON DELETE CASCADE,
    statement TEXT NOT NULL,
    raised_by VARCHAR(128) NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'unverified' CHECK (status IN ('unverified', 'validated', 'refuted')),
    validation_note TEXT,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Conflicts Table
CREATE TABLE IF NOT EXISTS conflicts (
    id VARCHAR(64) PRIMARY KEY,
    incident_id VARCHAR(64) REFERENCES incidents(id) ON DELETE CASCADE,
    description TEXT NOT NULL,
    parties_involved JSONB NOT NULL DEFAULT '[]'::jsonb,
    conflicting_statements JSONB NOT NULL DEFAULT '[]'::jsonb,
    status VARCHAR(32) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
    resolution TEXT,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Semantic Memory / Past Incidents Table with pgvector (1536 dims for OpenAI embeddings)
CREATE TABLE IF NOT EXISTS past_incidents (
    id VARCHAR(64) PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    scenario VARCHAR(64) NOT NULL,
    root_cause TEXT NOT NULL,
    resolution TEXT NOT NULL,
    suggested_runbooks JSONB NOT NULL DEFAULT '[]'::jsonb,
    tags JSONB NOT NULL DEFAULT '[]'::jsonb,
    embedding vector(1536),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for high-performance querying
CREATE INDEX IF NOT EXISTS idx_incidents_status ON incidents(status);
CREATE INDEX IF NOT EXISTS idx_actions_incident_id ON actions(incident_id);
CREATE INDEX IF NOT EXISTS idx_timeline_incident_id ON timeline_events(incident_id);
CREATE INDEX IF NOT EXISTS idx_past_incidents_scenario ON past_incidents(scenario);

-- Transcripts Table (for voice and chat history per channel/incident)
CREATE TABLE IF NOT EXISTS transcripts (
    id VARCHAR(64) PRIMARY KEY,
    incident_id VARCHAR(64) REFERENCES incidents(id) ON DELETE CASCADE,
    channel_name VARCHAR(128) NOT NULL,
    speaker VARCHAR(128) NOT NULL,
    text TEXT NOT NULL,
    time VARCHAR(32),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_transcripts_channel ON transcripts(channel_name);

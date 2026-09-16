-- RiffAegis Complete Fortress Architecture Database Migration
-- PostgreSQL / Supabase Schema

-- 1. Enable UUID Extension if not enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Documents Table
CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  encrypted_original_path TEXT,
  certificate_pdf_path TEXT,
  original_sha256 TEXT NOT NULL,
  original_sha3_512 TEXT NOT NULL,
  file_size_bytes BIGINT NOT NULL,
  final_merkle_root TEXT,
  creator_ml_dsa_public_key BYTEA NOT NULL,
  creator_ml_dsa_public_key_hash TEXT NOT NULL,
  creator_ml_dsa_signature BYTEA NOT NULL,
  creator_webauthn_binding JSONB,
  upload_confirmed BOOLEAN DEFAULT false,
  status TEXT NOT NULL DEFAULT 'initialized',
  rejection_reason TEXT,
  cancellation_reason TEXT,
  ots_proof_path TEXT,
  ots_status TEXT DEFAULT 'pending',
  github_commit_sha TEXT,
  retry_count INTEGER DEFAULT 0,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Signers Table
CREATE TABLE IF NOT EXISTS signers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  signing_order INTEGER DEFAULT 1,
  role TEXT NOT NULL DEFAULT 'signer', -- 'creator' | 'signer' | 'witness' | 'approver'
  email TEXT NOT NULL,
  identity_auth_type TEXT NOT NULL DEFAULT 'email_otp',
  identity_auth_verified_at TIMESTAMPTZ,
  auth_token_hash TEXT NOT NULL, -- SHA-256 hash of signing token
  token_expires_at TIMESTAMPTZ NOT NULL,
  otp_code_hash TEXT,            -- SHA-256 hash of OTP code
  otp_expires_at TIMESTAMPTZ,
  auth_attempts INTEGER DEFAULT 0,
  auth_locked_until TIMESTAMPTZ,
  webauthn_credential_id TEXT,
  webauthn_public_key TEXT,
  webauthn_challenge_nonce TEXT,
  attestation_object BYTEA,
  client_data_json TEXT,
  auth_level TEXT, -- 'high_webauthn' | 'medium_security_key' | 'low_fallback'
  signed_at TIMESTAMPTZ
);

-- 4. Audit Logs Table (Merkle Tree Audit Chain)
CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGSERIAL PRIMARY KEY,
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  previous_log_hash TEXT NOT NULL,
  current_log_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Realtime Status Table (Safe for Anon Subscription)
CREATE TABLE IF NOT EXISTS documents_realtime_status (
  id BIGSERIAL PRIMARY KEY,
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE UNIQUE,
  status TEXT NOT NULL,
  certificate_ready BOOLEAN DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Idempotency Keys Table
CREATE TABLE IF NOT EXISTS idempotency_keys (
  key TEXT PRIMARY KEY,
  endpoint TEXT NOT NULL,
  response_status INTEGER NOT NULL,
  response_body JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(status);
CREATE INDEX IF NOT EXISTS idx_documents_expires_at ON documents(expires_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_documents_creator_key_hash ON documents(creator_ml_dsa_public_key_hash);
CREATE INDEX IF NOT EXISTS idx_signers_document_id ON signers(document_id);
CREATE INDEX IF NOT EXISTS idx_signers_email ON signers(email);
CREATE INDEX IF NOT EXISTS idx_signers_auth_token_hash ON signers(auth_token_hash);
CREATE INDEX IF NOT EXISTS idx_audit_logs_document_id ON audit_logs(document_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_event_type ON audit_logs(document_id, event_type);
CREATE INDEX IF NOT EXISTS idx_idempotency_created_at ON idempotency_keys(created_at);

-- Trigger: update_updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_documents_updated_at ON documents;
CREATE TRIGGER trigger_documents_updated_at
  BEFORE UPDATE ON documents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Trigger: sync_documents_realtime_status
CREATE OR REPLACE FUNCTION sync_documents_realtime_status()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO documents_realtime_status (document_id, status, certificate_ready, updated_at)
  VALUES (
    NEW.id,
    NEW.status,
    (NEW.certificate_pdf_path IS NOT NULL),
    NEW.updated_at
  )
  ON CONFLICT (document_id) DO UPDATE SET
    status = EXCLUDED.status,
    certificate_ready = EXCLUDED.certificate_ready,
    updated_at = EXCLUDED.updated_at;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_sync_documents_realtime_status ON documents;
CREATE TRIGGER trigger_sync_documents_realtime_status
  AFTER INSERT OR UPDATE OF status, certificate_pdf_path ON documents
  FOR EACH ROW EXECUTE FUNCTION sync_documents_realtime_status();

-- ROW LEVEL SECURITY (RLS) POLICIES
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE signers ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE idempotency_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents_realtime_status ENABLE ROW LEVEL SECURITY;

-- Deny anon access to sensitive tables
DROP POLICY IF EXISTS "documents_deny_anon" ON documents;
CREATE POLICY "documents_deny_anon" ON documents
  FOR ALL TO anon
  USING (false);

DROP POLICY IF EXISTS "signers_deny_anon" ON signers;
CREATE POLICY "signers_deny_anon" ON signers
  FOR ALL TO anon
  USING (false);

DROP POLICY IF EXISTS "audit_logs_deny_anon" ON audit_logs;
CREATE POLICY "audit_logs_deny_anon" ON audit_logs
  FOR ALL TO anon
  USING (false);

DROP POLICY IF EXISTS "idempotency_deny_anon" ON idempotency_keys;
CREATE POLICY "idempotency_deny_anon" ON idempotency_keys
  FOR ALL TO anon
  USING (false);

-- Permit anon read only on safe realtime table
DROP POLICY IF EXISTS "realtime_status_read_anon" ON documents_realtime_status;
CREATE POLICY "realtime_status_read_anon" ON documents_realtime_status
  FOR SELECT TO anon
  USING (true);

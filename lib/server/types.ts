/**
 * Server Domain Types & Constants
 */

export type DocumentStatus =
  | "initialized"
  | "pending"
  | "consent_received"
  | "timestamp_acquired"
  | "anchored"
  | "certificate_generated"
  | "completed"
  | "rejected"
  | "expired"
  | "cancelled"
  | "admin_review";

export type SignerRole = "creator" | "signer" | "witness" | "approver";

export type IdentityAuthType = "email_otp" | "sms_otp" | "oauth_google";

export type AuthLevel = "high_webauthn" | "medium_security_key" | "low_fallback";

export interface DocumentRecord {
  id: string;
  encrypted_original_path?: string | null;
  certificate_pdf_path?: string | null;
  original_sha256: string;
  original_sha3_512: string;
  file_size_bytes: number;
  final_merkle_root?: string | null;
  creator_ml_dsa_public_key: Uint8Array | string; // bytea or hex
  creator_ml_dsa_public_key_hash: string;
  creator_ml_dsa_signature: Uint8Array | string; // bytea or hex
  creator_webauthn_binding?: Record<string, unknown> | null;
  upload_confirmed: boolean;
  status: DocumentStatus;
  rejection_reason?: string | null;
  cancellation_reason?: string | null;
  ots_proof_path?: string | null;
  ots_status: "pending" | "upgraded";
  github_commit_sha?: string | null;
  retry_count: number;
  expires_at: string;
  created_at: string;
  updated_at: string;
  title?: string;
  signer_email?: string | null;
}

export interface SignerRecord {
  id: string;
  document_id: string;
  signing_order: number;
  role: SignerRole;
  email: string;
  identity_auth_type: IdentityAuthType;
  identity_auth_verified_at?: string | null;
  auth_token_hash: string; // SHA-256 hash of signing token
  token_expires_at: string;
  otp_code_hash?: string | null;
  otp_expires_at?: string | null;
  auth_attempts: number;
  auth_locked_until?: string | null;
  webauthn_credential_id?: string | null;
  webauthn_public_key?: string | null;
  webauthn_challenge_nonce?: string | null;
  attestation_object?: Uint8Array | null;
  client_data_json?: string | null;
  auth_level?: AuthLevel | null;
  signed_at?: string | null;
  name?: string | null;
  address?: string | null;
}

export interface AuditLogRecord {
  id: number;
  document_id: string;
  event_type: string;
  payload_json: Record<string, unknown>;
  previous_log_hash: string;
  current_log_hash: string;
  created_at: string;
}

export interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

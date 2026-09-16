import { db } from "./db";
import { AuditLogRecord } from "./types";
import { genesisHash, calculateLogHash } from "@/lib/crypto/hashes";

// In-process serialized lock per document to prevent Merkle chain bifurcation on concurrent events
const documentWriteLocks = new Map<string, Promise<unknown>>();

/**
 * Append a verified event to the document's Merkle Tree audit chain with serialized concurrency protection
 */
export async function appendAuditLog(
  documentId: string,
  eventType:
    | "CREATED"
    | "IDENTITY_VERIFIED"
    | "VIEWED"
    | "INTEGRITY_VERIFIED"
    | "WEBAUTHN_CONSENT"
    | "SIGNER_ADVANCED"
    | "REJECTED"
    | "CANCELLED"
    | "OTS_ANCHORED"
    | "OTS_UPGRADED"
    | "DOCUMENT_EXPIRED"
    | "COMPLETED",
  payload: Record<string, unknown>
): Promise<AuditLogRecord> {
  const currentLock = documentWriteLocks.get(documentId) || Promise.resolve();

  let releaseLock: () => void;
  const nextLock = new Promise<void>((resolve) => {
    releaseLock = resolve;
  });
  documentWriteLocks.set(documentId, nextLock);

  try {
    await currentLock;

    const latestLog = await db.getLatestAuditLog(documentId);
    const previousLogHash = latestLog ? latestLog.current_log_hash : genesisHash(documentId);
    const createdAt = new Date().toISOString();

    const currentLogHash = calculateLogHash(
      previousLogHash,
      eventType,
      payload,
      createdAt
    );

    return await db.insertAuditLog({
      document_id: documentId,
      event_type: eventType,
      payload_json: payload,
      previous_log_hash: previousLogHash,
      current_log_hash: currentLogHash,
      created_at: createdAt,
    });
  } finally {
    releaseLock!();
    if (documentWriteLocks.get(documentId) === nextLock) {
      documentWriteLocks.delete(documentId);
    }
  }
}

/**
 * Get the latest Merkle Root hash of a document
 */
export async function getLatestMerkleRoot(documentId: string): Promise<string> {
  const latestLog = await db.getLatestAuditLog(documentId);
  return latestLog ? latestLog.current_log_hash : genesisHash(documentId);
}

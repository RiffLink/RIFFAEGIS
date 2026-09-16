import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { DocumentRecord, SignerRecord, AuditLogRecord } from "./types";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

let supabaseInstance: SupabaseClient | null = null;

if (supabaseUrl && supabaseServiceKey) {
  supabaseInstance = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false },
  });
}

// In-Memory Dev Store for when Supabase is not configured locally
class InMemoryDevStore {
  documents = new Map<string, DocumentRecord>();
  signers = new Map<string, SignerRecord>();
  auditLogs = new Map<string, AuditLogRecord[]>();
  idempotency = new Map<string, { endpoint: string; status: number; body: unknown; createdAt: string }>();
  private logIdCounter = 1;

  async getDocument(id: string): Promise<DocumentRecord | null> {
    return this.documents.get(id) || null;
  }

  async deleteDocument(documentId: string): Promise<void> {
    this.documents.delete(documentId);
    for (const [id, signer] of this.signers.entries()) {
      if (signer.document_id === documentId) this.signers.delete(id);
    }
    this.auditLogs.delete(documentId);
  }

  async insertDocument(doc: DocumentRecord): Promise<DocumentRecord> {
    this.documents.set(doc.id, doc);
    return doc;
  }

  async updateDocument(id: string, updates: Partial<DocumentRecord>): Promise<DocumentRecord> {
    const existing = this.documents.get(id);
    if (!existing) throw new Error(`Document ${id} not found in store`);
    const updated: DocumentRecord = {
      ...existing,
      ...updates,
      updated_at: new Date().toISOString(),
    };
    this.documents.set(id, updated);
    return updated;
  }

  async listPendingOtsDocuments(limit = 20): Promise<DocumentRecord[]> {
    const list: DocumentRecord[] = [];
    for (const doc of this.documents.values()) {
      if (doc.status === "completed" && doc.ots_status === "pending") {
        list.push(doc);
        if (list.length >= limit) break;
      }
    }
    return list;
  }

  async listDocumentsByCreator(creatorKeyHash: string, status?: string): Promise<DocumentRecord[]> {
    const list: DocumentRecord[] = [];
    const matchStatuses = status === "pending"
      ? ["pending", "consent_received", "anchored", "initialized"]
      : status === "completed"
      ? ["completed"]
      : status === "cancelled"
      ? ["cancelled", "rejected", "expired"]
      : status ? [status] : null;

    for (const doc of this.documents.values()) {
      if (doc.creator_ml_dsa_public_key_hash === creatorKeyHash) {
        if (!matchStatuses || matchStatuses.includes(doc.status)) {
          list.push(doc);
        }
      }
    }
    return list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }

  async listAllDocuments(limit = 100): Promise<DocumentRecord[]> {
    return Array.from(this.documents.values())
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, limit);
  }

  async getSignerByTokenHash(tokenHash: string): Promise<SignerRecord | null> {
    for (const signer of this.signers.values()) {
      if (signer.auth_token_hash === tokenHash) return signer;
    }
    return null;
  }

  async getSignerById(id: string): Promise<SignerRecord | null> {
    return this.signers.get(id) || null;
  }

  async getSignerByDocument(documentId: string): Promise<SignerRecord | null> {
    for (const signer of this.signers.values()) {
      if (signer.document_id === documentId) return signer;
    }
    return null;
  }

  async insertSigner(signer: SignerRecord): Promise<SignerRecord> {
    this.signers.set(signer.id, signer);
    return signer;
  }

  async updateSigner(id: string, updates: Partial<SignerRecord>): Promise<SignerRecord> {
    const existing = this.signers.get(id);
    if (!existing) throw new Error(`Signer ${id} not found`);
    const updated: SignerRecord = { ...existing, ...updates };
    this.signers.set(id, updated);
    return updated;
  }

  async insertAuditLog(log: Omit<AuditLogRecord, "id">): Promise<AuditLogRecord> {
    const fullLog: AuditLogRecord = {
      ...log,
      id: this.logIdCounter++,
    };
    const list = this.auditLogs.get(log.document_id) || [];
    list.push(fullLog);
    this.auditLogs.set(log.document_id, list);
    return fullLog;
  }

  async getLatestAuditLog(documentId: string): Promise<AuditLogRecord | null> {
    const list = this.auditLogs.get(documentId) || [];
    if (list.length === 0) return null;
    return list[list.length - 1];
  }

  async listAuditLogs(documentId: string): Promise<AuditLogRecord[]> {
    return this.auditLogs.get(documentId) || [];
  }

  async getIdempotencyKey(key: string): Promise<{ status: number; body: unknown } | null> {
    const item = this.idempotency.get(key);
    if (!item) return null;
    return { status: item.status, body: item.body };
  }

  async saveIdempotencyKey(key: string, endpoint: string, status: number, body: unknown): Promise<void> {
    this.idempotency.set(key, {
      endpoint,
      status,
      body,
      createdAt: new Date().toISOString(),
    });
  }

  async getExpiredPendingDocuments(): Promise<DocumentRecord[]> {
    const now = new Date().toISOString();
    const list: DocumentRecord[] = [];
    for (const doc of this.documents.values()) {
      if (doc.status === "pending" && doc.expires_at && doc.expires_at < now) {
        list.push(doc);
      }
    }
    return list;
  }

  async getOrphanedInitializedDocuments(maxAgeMs = 30 * 60 * 1000): Promise<DocumentRecord[]> {
    const now = Date.now();
    const list: DocumentRecord[] = [];
    for (const doc of this.documents.values()) {
      if (doc.status === "initialized" && !doc.upload_confirmed) {
        const created = new Date(doc.created_at).getTime();
        if (now - created > maxAgeMs) {
          list.push(doc);
        }
      }
    }
    return list;
  }

  async cleanExpiredIdempotencyKeys(maxAgeMs = 30 * 60 * 1000): Promise<number> {
    const now = Date.now();
    let count = 0;
    for (const [key, val] of this.idempotency.entries()) {
      const created = new Date(val.createdAt).getTime();
      if (now - created > maxAgeMs) {
        this.idempotency.delete(key);
        count++;
      }
    }
    return count;
  }

  async getOldTerminatedDocuments(days = 90): Promise<DocumentRecord[]> {
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    const list: DocumentRecord[] = [];
    for (const doc of this.documents.values()) {
      if (doc.status === "expired" || doc.status === "cancelled") {
        const created = new Date(doc.created_at).getTime();
        if (created < cutoff) {
          list.push(doc);
        }
      }
    }
    return list;
  }
}

// Global dev store singleton across hot reloads in Next.js development
const globalForStore = globalThis as unknown as { devStore?: InMemoryDevStore };
export const devStore = globalForStore.devStore || new InMemoryDevStore();
if (process.env.NODE_ENV !== "production") globalForStore.devStore = devStore;

function serializeDocForSupabase(doc: DocumentRecord): Record<string, unknown> {
  return {
    ...doc,
    creator_ml_dsa_public_key: toByteaHex(doc.creator_ml_dsa_public_key),
    creator_ml_dsa_signature: toByteaHex(doc.creator_ml_dsa_signature),
  };
}

function deserializeDocFromSupabase(data: Record<string, unknown>): DocumentRecord {
  return {
    ...data,
    creator_ml_dsa_public_key: fromByteaHex(data.creator_ml_dsa_public_key),
    creator_ml_dsa_signature: fromByteaHex(data.creator_ml_dsa_signature),
  } as DocumentRecord;
}

function serializeSignerForSupabase(signer: SignerRecord): Record<string, unknown> {
  return {
    ...signer,
    attestation_object: signer.attestation_object ? toByteaHex(signer.attestation_object) : null,
  };
}

function deserializeSignerFromSupabase(data: Record<string, unknown>): SignerRecord {
  return {
    ...data,
    attestation_object: data.attestation_object ? (fromByteaHex(data.attestation_object) as Uint8Array) : null,
  } as SignerRecord;
}

function toByteaHex(val: Uint8Array | string | null | undefined): string | null {
  if (!val) return null;
  if (typeof val === "string") {
    if (val.startsWith("\\x")) return val;
    return "\\x" + Buffer.from(val, "base64").toString("hex");
  }
  return "\\x" + Buffer.from(val).toString("hex");
}

function fromByteaHex(val: unknown): Uint8Array | string {
  if (!val) return new Uint8Array();
  if (typeof val === "string" && val.startsWith("\\x")) {
    return new Uint8Array(Buffer.from(val.slice(2), "hex"));
  }
  if (val instanceof Uint8Array) return val;
  return String(val);
}

/**
 * Unified Repository Layer
 */
export const db = {
  isMock: !supabaseInstance,

  async getDocument(id: string): Promise<DocumentRecord | null> {
    if (!supabaseInstance) return devStore.getDocument(id);
    const { data, error } = await supabaseInstance
      .from("documents")
      .select("*")
      .eq("id", id)
      .single();
    if (error || !data) return null;
    return deserializeDocFromSupabase(data);
  },

  async insertDocument(doc: DocumentRecord): Promise<DocumentRecord> {
    if (!supabaseInstance) return devStore.insertDocument(doc);
    const payload = serializeDocForSupabase(doc);
    const { data, error } = await supabaseInstance
      .from("documents")
      .insert(payload)
      .select()
      .single();
    if (error) throw error;
    return deserializeDocFromSupabase(data);
  },

  async updateDocument(id: string, updates: Partial<DocumentRecord>): Promise<DocumentRecord> {
    if (!supabaseInstance) return devStore.updateDocument(id, updates);
    const payload = { ...updates } as Record<string, unknown>;
    if (updates.creator_ml_dsa_public_key) {
      payload.creator_ml_dsa_public_key = toByteaHex(updates.creator_ml_dsa_public_key);
    }
    if (updates.creator_ml_dsa_signature) {
      payload.creator_ml_dsa_signature = toByteaHex(updates.creator_ml_dsa_signature);
    }
    const { data, error } = await supabaseInstance
      .from("documents")
      .update(payload)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return deserializeDocFromSupabase(data);
  },

  async listDocumentsByCreator(creatorKeyHash: string, status?: string): Promise<DocumentRecord[]> {
    if (!supabaseInstance) return devStore.listDocumentsByCreator(creatorKeyHash, status);
    let query = supabaseInstance
      .from("documents")
      .select("*")
      .eq("creator_ml_dsa_public_key_hash", creatorKeyHash)
      .order("created_at", { ascending: false });

    if (status) {
      const matchStatuses = status === "pending"
        ? ["pending", "consent_received", "anchored", "initialized"]
        : status === "completed"
        ? ["completed"]
        : status === "cancelled"
        ? ["cancelled", "rejected", "expired"]
        : [status];

      query = query.in("status", matchStatuses);
    }

    const { data, error } = await query;
    if (error) throw error;
    return (data || []).map(deserializeDocFromSupabase);
  },

  async listAllDocuments(limit = 100): Promise<DocumentRecord[]> {
    if (!supabaseInstance) return devStore.listAllDocuments(limit);
    const { data, error } = await supabaseInstance
      .from("documents")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data || []).map(deserializeDocFromSupabase);
  },

  async listPendingOtsDocuments(limit = 20): Promise<DocumentRecord[]> {
    if (!supabaseInstance) return devStore.listPendingOtsDocuments(limit);
    const { data, error } = await supabaseInstance
      .from("documents")
      .select("*")
      .eq("status", "completed")
      .eq("ots_status", "pending")
      .limit(limit);
    if (error) throw error;
    return (data || []).map(deserializeDocFromSupabase);
  },

  async getSignerByTokenHash(tokenHash: string): Promise<SignerRecord | null> {
    if (!supabaseInstance) return devStore.getSignerByTokenHash(tokenHash);
    const { data, error } = await supabaseInstance
      .from("signers")
      .select("*")
      .eq("auth_token_hash", tokenHash)
      .single();
    if (error || !data) return null;
    return deserializeSignerFromSupabase(data);
  },

  async getSignerById(id: string): Promise<SignerRecord | null> {
    if (!supabaseInstance) return devStore.getSignerById(id);
    const { data, error } = await supabaseInstance
      .from("signers")
      .select("*")
      .eq("id", id)
      .single();
    if (error || !data) return null;
    return deserializeSignerFromSupabase(data);
  },

  async getSignerByDocument(documentId: string): Promise<SignerRecord | null> {
    if (!supabaseInstance) return devStore.getSignerByDocument(documentId);
    const { data, error } = await supabaseInstance
      .from("signers")
      .select("*")
      .eq("document_id", documentId)
      .order("signing_order", { ascending: true })
      .limit(1)
      .single();
    if (error || !data) return null;
    return deserializeSignerFromSupabase(data);
  },

  async listSignersByDocument(documentId: string): Promise<SignerRecord[]> {
    if (!supabaseInstance) {
      const list: SignerRecord[] = [];
      for (const signer of devStore.signers.values()) {
        if (signer.document_id === documentId) list.push(signer);
      }
      return list.sort((a, b) => a.signing_order - b.signing_order);
    }
    const { data, error } = await supabaseInstance
      .from("signers")
      .select("*")
      .eq("document_id", documentId)
      .order("signing_order", { ascending: true });
    if (error) throw error;
    return (data || []).map(deserializeSignerFromSupabase);
  },

  async deleteSignersByDocument(documentId: string): Promise<void> {
    if (!supabaseInstance) {
      for (const [id, signer] of devStore.signers.entries()) {
        if (signer.document_id === documentId) devStore.signers.delete(id);
      }
      return;
    }
    const { error } = await supabaseInstance.from("signers").delete().eq("document_id", documentId);
    if (error) throw error;
  },

  async deleteDocument(documentId: string): Promise<void> {
    if (!supabaseInstance) return devStore.deleteDocument(documentId);
    await supabaseInstance.from("signers").delete().eq("document_id", documentId);
    await supabaseInstance.from("audit_logs").delete().eq("document_id", documentId);
    await supabaseInstance.from("documents_realtime_status").delete().eq("document_id", documentId);
    const { error } = await supabaseInstance.from("documents").delete().eq("id", documentId);
    if (error) throw error;
  },

  async purgeAllDocuments(): Promise<number> {
    if (!supabaseInstance) {
      const count = devStore.documents.size;
      devStore.documents.clear();
      devStore.signers.clear();
      devStore.auditLogs.clear();
      return count;
    }
    const { data: allDocs } = await supabaseInstance.from("documents").select("id");
    const count = allDocs?.length || 0;
    if (count > 0) {
      await supabaseInstance.from("documents").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    }
    return count;
  },

  async insertSigner(signer: SignerRecord): Promise<SignerRecord> {
    if (!supabaseInstance) return devStore.insertSigner(signer);
    const payload = serializeSignerForSupabase(signer);
    const { data, error } = await supabaseInstance
      .from("signers")
      .insert(payload)
      .select()
      .single();
    if (error) throw error;
    return deserializeSignerFromSupabase(data);
  },

  async updateSigner(id: string, updates: Partial<SignerRecord>): Promise<SignerRecord> {
    if (!supabaseInstance) return devStore.updateSigner(id, updates);
    const payload = { ...updates } as Record<string, unknown>;
    if (updates.attestation_object) {
      payload.attestation_object = toByteaHex(updates.attestation_object);
    }
    const { data, error } = await supabaseInstance
      .from("signers")
      .update(payload)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return deserializeSignerFromSupabase(data);
  },

  async insertAuditLog(log: Omit<AuditLogRecord, "id">): Promise<AuditLogRecord> {
    if (!supabaseInstance) return devStore.insertAuditLog(log);
    const { data, error } = await supabaseInstance
      .from("audit_logs")
      .insert(log)
      .select()
      .single();
    if (error) throw error;
    return data as AuditLogRecord;
  },

  async getLatestAuditLog(documentId: string): Promise<AuditLogRecord | null> {
    if (!supabaseInstance) return devStore.getLatestAuditLog(documentId);
    const { data, error } = await supabaseInstance
      .from("audit_logs")
      .select("*")
      .eq("document_id", documentId)
      .order("id", { ascending: false })
      .limit(1)
      .single();
    if (error || !data) return null;
    return data as AuditLogRecord;
  },

  async listAuditLogs(documentId: string): Promise<AuditLogRecord[]> {
    if (!supabaseInstance) return devStore.listAuditLogs(documentId);
    const { data, error } = await supabaseInstance
      .from("audit_logs")
      .select("*")
      .eq("document_id", documentId)
      .order("id", { ascending: true });
    if (error) throw error;
    return (data || []) as AuditLogRecord[];
  },

  async getIdempotencyKey(key: string): Promise<{ status: number; body: unknown } | null> {
    if (!supabaseInstance) return devStore.getIdempotencyKey(key);
    const { data, error } = await supabaseInstance
      .from("idempotency_keys")
      .select("response_status, response_body")
      .eq("key", key)
      .single();
    if (error || !data) return null;
    return { status: data.response_status, body: data.response_body };
  },

  async saveIdempotencyKey(key: string, endpoint: string, status: number, body: unknown): Promise<void> {
    if (!supabaseInstance) return devStore.saveIdempotencyKey(key, endpoint, status, body);
    await supabaseInstance.from("idempotency_keys").insert({
      key,
      endpoint,
      response_status: status,
      response_body: body,
    });
  },

  async getExpiredPendingDocuments(): Promise<DocumentRecord[]> {
    if (!supabaseInstance) return devStore.getExpiredPendingDocuments();
    const now = new Date().toISOString();
    const { data, error } = await supabaseInstance
      .from("documents")
      .select("*")
      .eq("status", "pending")
      .lt("expires_at", now);
    if (error || !data) return [];
    return data.map(deserializeDocFromSupabase);
  },

  async getOrphanedInitializedDocuments(maxAgeMs = 30 * 60 * 1000): Promise<DocumentRecord[]> {
    if (!supabaseInstance) return devStore.getOrphanedInitializedDocuments(maxAgeMs);
    const cutoff = new Date(Date.now() - maxAgeMs).toISOString();
    const { data, error } = await supabaseInstance
      .from("documents")
      .select("*")
      .eq("status", "initialized")
      .eq("upload_confirmed", false)
      .lt("created_at", cutoff);
    if (error || !data) return [];
    return data.map(deserializeDocFromSupabase);
  },

  async cleanExpiredIdempotencyKeys(maxAgeMs = 30 * 60 * 1000): Promise<number> {
    if (!supabaseInstance) return devStore.cleanExpiredIdempotencyKeys(maxAgeMs);
    const cutoff = new Date(Date.now() - maxAgeMs).toISOString();
    const { data, error } = await supabaseInstance
      .from("idempotency_keys")
      .delete()
      .lt("created_at", cutoff)
      .select("key");
    if (error) return 0;
    return data?.length || 0;
  },

  async getOldTerminatedDocuments(days = 90): Promise<DocumentRecord[]> {
    if (!supabaseInstance) return devStore.getOldTerminatedDocuments(days);
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabaseInstance
      .from("documents")
      .select("*")
      .in("status", ["expired", "cancelled"])
      .lt("created_at", cutoff);
    if (error || !data) return [];
    return data.map(deserializeDocFromSupabase);
  },
};

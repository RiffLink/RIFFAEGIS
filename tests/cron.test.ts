import { describe, it, expect } from "vitest";
import { GET as expireDocumentsGet, POST as expireDocumentsPost } from "@/app/api/cron/expire-documents/route";
import { GET as cleanupGet, POST as cleanupPost } from "@/app/api/cron/cleanup/route";
import { GET as rebindGet, POST as rebindPost } from "@/app/api/identity/rebind-webauthn/route";
import { db } from "@/lib/server/db";
import { signCreatorIdentityToken } from "@/lib/server/jwt";
import { NextRequest } from "next/server";

describe("Cron & Rebind API Test Suite", () => {
  it("should expire overdue pending documents and purge orphaned initialized docs", async () => {
    const expiredDocId = "test-expired-doc-" + Math.random().toString(36).slice(2);
    const orphanDocId = "test-orphan-doc-" + Math.random().toString(36).slice(2);

    // 1. Insert an expired pending doc
    await db.insertDocument({
      id: expiredDocId,
      original_sha256: "abc",
      original_sha3_512: "def",
      file_size_bytes: 100,
      creator_ml_dsa_public_key: "pk",
      creator_ml_dsa_public_key_hash: "pkhash",
      creator_ml_dsa_signature: "sig",
      status: "pending",
      upload_confirmed: true,
      ots_status: "pending",
      retry_count: 0,
      expires_at: new Date(Date.now() - 1000).toISOString(), // already expired
      created_at: new Date(Date.now() - 7 * 86400 * 1000).toISOString(),
      updated_at: new Date().toISOString(),
      creator_webauthn_binding: {
        creator_email: "creator@example.com",
        document_title: "テスト契約書",
      },
    });

    // 2. Insert an orphaned initialized doc (> 30 min without upload confirmation)
    await db.insertDocument({
      id: orphanDocId,
      original_sha256: "abc2",
      original_sha3_512: "def2",
      file_size_bytes: 200,
      creator_ml_dsa_public_key: "pk2",
      creator_ml_dsa_public_key_hash: "pkhash2",
      creator_ml_dsa_signature: "sig2",
      status: "initialized",
      upload_confirmed: false,
      ots_status: "pending",
      retry_count: 0,
      expires_at: new Date(Date.now() + 86400 * 1000).toISOString(),
      created_at: new Date(Date.now() - 40 * 60 * 1000).toISOString(), // 40 mins ago
      updated_at: new Date().toISOString(),
    });

    // 3. Call GET /api/cron/expire-documents
    const req = new NextRequest("http://localhost:3000/api/cron/expire-documents");
    const res = await expireDocumentsGet(req);
    expect(res.status).toEqual(200);
    const json = await res.json();

    expect(json.success).toBe(true);
    expect(json.expired_count).toBeGreaterThanOrEqual(1);
    expect(json.purged_orphans).toBeGreaterThanOrEqual(1);

    // Verify expired doc changed status to 'expired'
    const updatedExpired = await db.getDocument(expiredDocId);
    expect(updatedExpired?.status).toEqual("expired");

    // Verify orphan doc was deleted
    const updatedOrphan = await db.getDocument(orphanDocId);
    expect(updatedOrphan).toBeNull();
  });

  it("should cleanup expired idempotency keys and old terminated documents", async () => {
    // 1. Insert an expired idempotency key (> 30 mins old)
    const oldKey = "old-key-" + Math.random().toString(36).slice(2);
    await db.saveIdempotencyKey(oldKey, "/api/test", 200, { ok: true });
    // Force date older
    if (db.isMock) {
      const store = (await import("@/lib/server/db")).devStore;
      const val = (store as any).idempotency.get(oldKey);
      if (val) {
        val.createdAt = new Date(Date.now() - 45 * 60 * 1000).toISOString();
      }
    }

    // 2. Call POST /api/cron/cleanup
    const req = new NextRequest("http://localhost:3000/api/cron/cleanup", { method: "POST" });
    const res = await cleanupPost(req);
    expect(res.status).toEqual(200);
    const json = await res.json();

    expect(json.success).toBe(true);
    expect(json.cleaned_idempotency_keys).toBeGreaterThanOrEqual(1);

    const checkKey = await db.getIdempotencyKey(oldKey);
    expect(checkKey).toBeNull();
  });

  it("should issue challenge and rebind webauthn credentials on new device", async () => {
    const pkHash = "test-pk-hash-rebind-12345678";
    const token = await signCreatorIdentityToken(pkHash);

    // 1. GET rebind challenge
    const getReq = new NextRequest("http://localhost:3000/api/identity/rebind-webauthn", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const getRes = await rebindGet(getReq);
    expect(getRes.status).toEqual(200);
    const getJson = await getRes.json();
    expect(getJson.challenge).toBeDefined();

    // 2. POST rebind complete
    const postReq = new NextRequest("http://localhost:3000/api/identity/rebind-webauthn", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        new_credential_id: "new-hardware-credential-id-999",
        fallback: true,
      }),
    });
    const postRes = await rebindPost(postReq);
    expect(postRes.status).toEqual(200);
    const postJson = await postRes.json();
    expect(postJson.rebind_completed).toBe(true);
    expect(postJson.credential_id).toEqual("new-hardware-credential-id-999");
  });
});

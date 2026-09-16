import { NextResponse } from "next/server";
import { db } from "@/lib/server/db";
import { storage } from "@/lib/server/storage";
import { appendAuditLog } from "@/lib/server/merkle";
import { emailService } from "@/lib/server/email";

/**
 * Expire Documents Cron Handler (Runs every 15 minutes)
 * 1. Transitions pending documents past expires_at to 'expired' and notifies creator.
 * 2. Purges orphaned initialized documents (created > 30 mins ago without upload confirmation).
 */
async function handleExpireDocuments(request: Request) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // 1. Process expired pending documents
    const expiredDocs = await db.getExpiredPendingDocuments();
    let expiredCount = 0;

    for (const doc of expiredDocs) {
      try {
        await db.updateDocument(doc.id, {
          status: "expired",
        });

        await appendAuditLog(doc.id, "DOCUMENT_EXPIRED", {
          expired_at: new Date().toISOString(),
          original_expires_at: doc.expires_at,
          reason: "署名期限超過による自動失効",
        });

        const meta = (doc.creator_webauthn_binding || {}) as Record<string, unknown>;
        const creatorEmail = (meta.creator_email as string) || (meta.email as string);
        const title = (meta.document_title as string) || "電子契約書";

        if (creatorEmail) {
          emailService
            .sendDocumentExpiredEmail({
              toEmail: creatorEmail,
              documentId: doc.id,
              documentTitle: title,
            })
            .catch((err) => console.warn(`Failed to send expiry email for ${doc.id}:`, err));
        }

        expiredCount++;
      } catch (err) {
        console.warn(`Error expiring document ${doc.id}:`, err);
      }
    }

    // 2. Clean up orphaned initialized documents (> 30 mins without upload confirmation)
    const orphanedDocs = await db.getOrphanedInitializedDocuments(30 * 60 * 1000);
    let purgedOrphans = 0;

    for (const doc of orphanedDocs) {
      try {
        await storage.deleteDocumentFiles(doc.id);
        await db.deleteDocument(doc.id);
        purgedOrphans++;
      } catch (err) {
        console.warn(`Error purging orphaned doc ${doc.id}:`, err);
      }
    }

    return NextResponse.json({
      success: true,
      expired_count: expiredCount,
      purged_orphans: purgedOrphans,
      timestamp: new Date().toISOString(),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Expire documents error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(request: Request) {
  return handleExpireDocuments(request);
}

export async function POST(request: Request) {
  return handleExpireDocuments(request);
}

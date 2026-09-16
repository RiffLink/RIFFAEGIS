import { NextResponse } from "next/server";
import { db } from "@/lib/server/db";
import { storage } from "@/lib/server/storage";

/**
 * Data Retention & Cleanup Cron Handler (Runs daily at 03:00)
 * 1. Cleans idempotency keys older than 30 minutes.
 * 2. Purges expired and cancelled documents older than 90 days according to retention policy.
 */
async function handleCleanup(request: Request) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // 1. Purge expired idempotency keys (older than 30 minutes)
    const cleanedKeys = await db.cleanExpiredIdempotencyKeys(30 * 60 * 1000);

    // 2. Purge old terminated documents (expired or cancelled older than 90 days)
    const oldDocs = await db.getOldTerminatedDocuments(90);
    let purgedDocs = 0;

    for (const doc of oldDocs) {
      try {
        await storage.deleteDocumentFiles(doc.id);
        await db.deleteDocument(doc.id);
        purgedDocs++;
      } catch (err) {
        console.warn(`Error purging old terminated doc ${doc.id}:`, err);
      }
    }

    return NextResponse.json({
      success: true,
      cleaned_idempotency_keys: cleanedKeys,
      purged_old_documents: purgedDocs,
      timestamp: new Date().toISOString(),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Cleanup cron error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(request: Request) {
  return handleCleanup(request);
}

export async function POST(request: Request) {
  return handleCleanup(request);
}

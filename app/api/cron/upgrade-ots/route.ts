import { NextResponse } from "next/server";
import { db } from "@/lib/server/db";
import { storage } from "@/lib/server/storage";
import { checkAndUpgradeOtsProof } from "@/lib/server/ots";
import { appendAuditLog } from "@/lib/server/merkle";

/**
 * OpenTimestamps Upgrade Cron Handler
 * Periodically polls pending Bitcoin calendar anchors to attach block confirmation headers
 */
export async function GET(request: Request) {
  // Optional auth check for cron secret
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const pendingDocs = await db.listPendingOtsDocuments(20);
    let upgradedCount = 0;

    for (const doc of pendingDocs) {
      if (!doc.ots_proof_path) continue;

      try {
        const proofBytes = await storage.downloadBuffer(doc.ots_proof_path);
        if (!proofBytes) continue;

        const upgradeResult = await checkAndUpgradeOtsProof(proofBytes, doc.final_merkle_root || doc.original_sha256);
        if (upgradeResult.upgraded) {
          const upgradedPath = `documents/${doc.id}/proof_upgraded.ots`;
          await storage.uploadBuffer(upgradedPath, upgradeResult.proofBytes, "application/octet-stream");

          await db.updateDocument(doc.id, {
            ots_status: "upgraded",
            ots_proof_path: upgradedPath,
          });

          await appendAuditLog(doc.id, "OTS_UPGRADED", {
            calendar: upgradeResult.calendarUrl || "https://alice.btc.calendar.opentimestamps.org",
            upgraded_at: new Date().toISOString(),
            ots_proof_path: upgradedPath,
          });

          upgradedCount++;
        }
      } catch (docErr) {
        console.warn(`Failed OTS upgrade attempt for doc ${doc.id}:`, docErr);
      }
    }

    return NextResponse.json({
      success: true,
      scanned: pendingDocs.length,
      upgraded: upgradedCount,
      timestamp: new Date().toISOString(),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Cron error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

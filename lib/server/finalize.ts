import { db } from "./db";
import { storage } from "./storage";
import { appendAuditLog } from "./merkle";
import { getAtomicTime } from "./nict";
import { generateAuditCertificatePdf } from "./certificate";
import { emailService } from "./email";
import { submitToOtsCalendar } from "./ots";
import { createGitHubAnchor } from "./github-anchor";

/**
 * Idempotent background finalization pipeline for completed documents
 */
export async function finalizeDocument(documentId: string): Promise<void> {
  const document = await db.getDocument(documentId);
  if (!document) throw new Error(`Document ${documentId} not found`);

  // Idempotency: if already completed, return immediately
  if (document.status === "completed") return;

  const allSigners = await db.listSignersByDocument(documentId);
  if (allSigners.length === 0) throw new Error(`Signers for document ${documentId} not found`);

  // Check if any signers in order have not yet signed
  const remainingSigners = allSigners.filter((s) => !s.signed_at);
  if (remainingSigners.length > 0) {
    const nextSigner = remainingSigners[0];
    await appendAuditLog(documentId, "SIGNER_ADVANCED", {
      completed_count: allSigners.length - remainingSigners.length,
      total_signers: allSigners.length,
      next_signer_email: nextSigner.email,
      next_signing_order: nextSigner.signing_order,
    });

    // Automatically notify next signer in sequence
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const meta = (document.creator_webauthn_binding || {}) as Record<string, unknown>;
    const documentTitle = (meta.document_title as string) || "電子契約書";
    const creatorName = (meta.creator_name as string) || "契約書作成者";
    const creatorEmail = (meta.creator_email as string) || undefined;

    emailService
      .sendSigningInvitationEmail({
        toEmail: nextSigner.email,
        creatorName,
        creatorEmail,
        signingUrl: `${appUrl}/documents/${documentId}`,
        documentTitle,
      })
      .catch((e) => console.warn(`Failed to dispatch multi-party invitation to ${nextSigner.email}:`, e));

    return;
  }

  const primarySigner = allSigners[0];

  try {
    const merkleRoot = document.final_merkle_root || document.original_sha256;

    // Step 1 & 2: Parallel acquisition of Atomic Time & OTS Proof (Lightning fast)
    const [atomicTime, otsResult] = await Promise.all([
      getAtomicTime(),
      submitToOtsCalendar(merkleRoot),
    ]);

    const otsProofPath = `documents/${documentId}/proof.ots`;
    await storage.uploadBuffer(otsProofPath, otsResult.proofBytes, "application/octet-stream");

    const gitResult = await createGitHubAnchor({
      documentId,
      finalMerkleRoot: merkleRoot,
      originalSha256: document.original_sha256,
      timestampIso: atomicTime.isoTime,
      atomicTimeSource: atomicTime.source,
    });
    const githubCommitSha = gitResult.commitSha;

    await db.updateDocument(documentId, {
      status: "anchored",
      github_commit_sha: githubCommitSha,
      ots_proof_path: otsProofPath,
    });

    await appendAuditLog(documentId, "OTS_ANCHORED", {
      time_source: atomicTime.source,
      atomic_time: atomicTime.isoTime,
      github_commit_sha: githubCommitSha,
      ots_status: otsResult.status,
      ots_calendar: otsResult.calendarUrl,
    });

    // Step 3: CERTIFICATE_GENERATED
    const auditLogs = await db.listAuditLogs(documentId);
    const certificatePdfBytes = await generateAuditCertificatePdf({
      document: {
        ...document,
        github_commit_sha: githubCommitSha,
      },
      signer: primarySigner,
      auditLogs,
      atomicTime,
    });

    const certificatePdfPath = `documents/${documentId}/certificate.pdf`;
    await storage.uploadBuffer(certificatePdfPath, certificatePdfBytes, "application/pdf");

    // Step 4: COMPLETED (Immediately mark ready so UI finishes waiting)
    await db.updateDocument(documentId, {
      status: "completed",
      certificate_pdf_path: certificatePdfPath,
    });

    await appendAuditLog(documentId, "COMPLETED", {
      completed_at: new Date().toISOString(),
      certificate_path: certificatePdfPath,
      total_signers: allSigners.length,
    });

    // Step 5: Send notification emails asynchronously in the background (non-blocking)
    (async () => {
      for (const s of allSigners) {
        if (s.email) {
          await emailService
            .sendSigningCompletedEmail(s.email, documentId, certificatePdfBytes)
            .catch((e) => console.warn(`Email notification failed for ${s.email}:`, e));
        }
      }
    })().catch(() => {});
  } catch (err) {
    const currentRetries = (document.retry_count || 0) + 1;
    console.error(`Finalization attempt ${currentRetries} failed for ${documentId}:`, err);

    if (currentRetries >= 3) {
      await db.updateDocument(documentId, {
        status: "admin_review",
        retry_count: currentRetries,
      });
    } else {
      await db.updateDocument(documentId, {
        retry_count: currentRetries,
      });
    }
    throw err;
  }
}

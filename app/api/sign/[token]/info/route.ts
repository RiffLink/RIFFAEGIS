import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/server/db";
import { storage } from "@/lib/server/storage";
import { sha256Hex, bytesToBase64 } from "@/lib/crypto/hashes";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const tokenHash = sha256Hex(token);

    const signer = await db.getSignerByTokenHash(tokenHash);
    if (!signer) {
      return NextResponse.json(
        { error: { code: "INVALID_SIGNING_TOKEN", message: "Invalid or expired signature URL." } },
        { status: 404 }
      );
    }

    const document = await db.getDocument(signer.document_id);
    if (!document) {
      return NextResponse.json(
        { error: { code: "DOCUMENT_NOT_FOUND", message: "Associated document not found." } },
        { status: 404 }
      );
    }

    const isAlreadySigned = document.status === "completed" || !!signer.signed_at;

    // Only enforce the 7-day signing expiration if the signer has not completed their agreement yet
    if (!isAlreadySigned) {
      if (new Date(signer.token_expires_at).getTime() < Date.now() || document.status === "expired") {
        return NextResponse.json(
          { error: { code: "DOCUMENT_EXPIRED", message: "This signing link has expired." } },
          { status: 410 }
        );
      }
    }

    if (document.status === "cancelled") {
      return NextResponse.json(
        {
          error: {
            code: "DOCUMENT_CANCELLED",
            message: `This signing request was cancelled by the creator. Reason: ${document.cancellation_reason || "None"}`,
          },
        },
        { status: 409 }
      );
    }

    let certificateDownloadUrl: string | null = null;
    if (document.certificate_pdf_path) {
      certificateDownloadUrl = await storage.getPresignedDownloadUrl(
        document.certificate_pdf_path,
        3600 // 1 hour
      );
    }

    let encryptedOriginalDownloadUrl: string | null = null;
    // Only return encrypted original download URL after OTP has been verified or if already signed
    if (document.encrypted_original_path && (isAlreadySigned || !!signer.identity_auth_verified_at)) {
      encryptedOriginalDownloadUrl = await storage.getPresignedDownloadUrl(
        document.encrypted_original_path,
        3600 // 1 hour
      );
    }

    const pkBase64 = typeof document.creator_ml_dsa_public_key === "string"
      ? document.creator_ml_dsa_public_key
      : bytesToBase64(document.creator_ml_dsa_public_key);

    const sigBase64 = typeof document.creator_ml_dsa_signature === "string"
      ? document.creator_ml_dsa_signature
      : bytesToBase64(document.creator_ml_dsa_signature);

    const meta = (document.creator_webauthn_binding || {}) as Record<string, unknown>;
    const documentTitle =
      (meta.document_title as string) ||
      (meta.original_filename as string) ||
      (document.id === "9470715e-b449-4630-8c6a-aff0054cbbd1" ? "プロジェクト参加合意書" : "電子契約書");
    const creatorName =
      (meta.creator_name as string) ||
      (meta.creator_organization as string) ||
      "契約書作成者（甲）";

    const allSigners = await db.listSignersByDocument(document.id);
    const uniqueEmails = Array.from(new Set(allSigners.map((s) => s.email.toLowerCase())));
    const totalSigners = uniqueEmails.length;
    const signedEmails = new Set(allSigners.filter((s) => !!s.signed_at).map((s) => s.email.toLowerCase()));
    const completedSigners = signedEmails.size;
    const isAllCompleted = totalSigners > 0 && completedSigners >= totalSigners;

    // Match signer configured fields from creator's document metadata
    const signerFieldsList = ((meta.signer_fields || []) as any[]);
    const matchedSignerFields = signerFieldsList.find(
      (sf: any) => sf.email?.toLowerCase() === signer.email?.toLowerCase()
    ) || signerFieldsList[0] || {};

    const hasCompany = !!matchedSignerFields.has_company || (typeof matchedSignerFields.company === "string" && matchedSignerFields.company.trim() !== "");
    const hasTitle = !!matchedSignerFields.has_title || (typeof matchedSignerFields.title === "string" && matchedSignerFields.title.trim() !== "");
    const hasAddress = matchedSignerFields.has_address !== undefined ? !!matchedSignerFields.has_address : true;
    const requireAddress = matchedSignerFields.require_address !== undefined ? !!matchedSignerFields.require_address : hasAddress;

    return NextResponse.json({
      document_id: document.id,
      document_title: documentTitle,
      creator_name: creatorName,
      creator_organization: (meta.creator_organization as string) || null,
      original_sha256: document.original_sha256,
      original_sha3_512: document.original_sha3_512,
      file_size_bytes: document.file_size_bytes,
      creator_ml_dsa_public_key: pkBase64,
      creator_ml_dsa_signature: sigBase64,
      status: document.status,
      signer_email: signer.email,
      signer_name: signer.name || matchedSignerFields.name || null,
      signer_address: signer.address || matchedSignerFields.address || null,
      signer_company: matchedSignerFields.company || null,
      signer_title: matchedSignerFields.title || null,
      signer_custom_label: matchedSignerFields.custom_label || null,
      signer_custom_value: matchedSignerFields.custom_value || null,
      has_company: hasCompany,
      has_title: hasTitle,
      has_address: hasAddress,
      require_address: requireAddress,
      requires_otp: !signer.identity_auth_verified_at,
      already_signed: isAlreadySigned,
      total_signers: totalSigners,
      completed_signers: completedSigners,
      is_all_completed: isAllCompleted,
      certificate_ready: !!document.certificate_pdf_path,
      certificate_url: certificateDownloadUrl,
      encrypted_original_url: encryptedOriginalDownloadUrl,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message } },
      { status: 500 }
    );
  }
}

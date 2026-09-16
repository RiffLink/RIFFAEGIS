import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/server/db";
import { extractBearerToken, verifyToken } from "@/lib/server/jwt";
import { storage } from "@/lib/server/storage";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const token = extractBearerToken(request.headers.get("authorization"));
    if (!token) {
      return NextResponse.json(
        { error: { code: "UNAUTHORIZED", message: "Missing Bearer token." } },
        { status: 401 }
      );
    }

    // Verify token exists and is valid
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const claims = await verifyToken<any>(token);

    const document = await db.getDocument(id);
    if (!document) {
      return NextResponse.json(
        { error: { code: "DOCUMENT_NOT_FOUND", message: "Document not found." } },
        { status: 404 }
      );
    }

    // Check authorization: must either be creator document token for this id, or creator identity token with matching key hash, or signer for this doc
    const isDocCreator = claims.document_id === id && claims.role === "creator";
    const isIdentityCreator = claims.ml_dsa_public_key_hash === document.creator_ml_dsa_public_key_hash;
    const isSigner = claims.document_id === id && claims.role === "signer";

    if (!isDocCreator && !isIdentityCreator && !isSigner) {
      return NextResponse.json(
        { error: { code: "FORBIDDEN", message: "Not authorized to view this document." } },
        { status: 403 }
      );
    }

    const auditLogs = await db.listAuditLogs(id);
    const signer = await db.getSignerByDocument(id);
    const meta = (document.creator_webauthn_binding || {}) as Record<string, unknown>;
    const title =
      (meta.document_title as string) ||
      (meta.original_filename as string) ||
      (document.id === "9470715e-b449-4630-8c6a-aff0054cbbd1" ? "プロジェクト参加合意書" : "電子契約書");

    let encryptedOriginalUrl: string | null = null;
    try {
      encryptedOriginalUrl = await storage.getPresignedDownloadUrl(`documents/${id}/original.enc`);
    } catch {
      // ignore
    }

    let certificateUrl: string | null = null;
    if (document.status === "completed") {
      try {
        certificateUrl = await storage.getPresignedDownloadUrl(`documents/${id}/certificate.pdf`);
      } catch {
        // ignore
      }
    }

    return NextResponse.json({
      document: {
        ...document,
        title,
        encrypted_original_url: encryptedOriginalUrl,
        certificate_url: certificateUrl,
      },
      auditLogs,
      signer: signer
        ? {
            id: signer.id,
            email: signer.email,
            status: signer.signed_at ? "signed" : "pending",
            auth_level: signer.auth_level,
            signed_at: signer.signed_at,
          }
        : null,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message } },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const token = extractBearerToken(request.headers.get("authorization"));
    if (!token) {
      return NextResponse.json(
        { error: { code: "UNAUTHORIZED", message: "Missing Bearer token." } },
        { status: 401 }
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const claims = await verifyToken<any>(token);
    const document = await db.getDocument(id);
    if (!document) {
      return NextResponse.json(
        { error: { code: "DOCUMENT_NOT_FOUND", message: "Document not found." } },
        { status: 404 }
      );
    }

    // Only the creator is authorized to delete the document and its data
    const isDocCreator = claims.document_id === id && claims.role === "creator";
    const isIdentityCreator = claims.ml_dsa_public_key_hash === document.creator_ml_dsa_public_key_hash;

    if (!isDocCreator && !isIdentityCreator) {
      return NextResponse.json(
        { error: { code: "FORBIDDEN", message: "Only the document creator can delete this document." } },
        { status: 403 }
      );
    }

    // 1. Delete all encrypted and certificate files from storage (S3 / R2 / Supabase Storage)
    await storage.deleteDocumentFiles(id);

    // 2. Delete document row and all cascaded child records from DB
    await db.deleteDocument(id);

    return NextResponse.json({
      success: true,
      message: "Document and all associated storage files deleted successfully.",
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message } },
      { status: 500 }
    );
  }
}


import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/server/db";
import { storage } from "@/lib/server/storage";
import { extractBearerToken, verifyToken } from "@/lib/server/jwt";
import { sha256Hex } from "@/lib/crypto/hashes";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const document = await db.getDocument(id);

    if (!document) {
      return NextResponse.json(
        { error: { code: "DOCUMENT_NOT_FOUND", message: "Document not found." } },
        { status: 404 }
      );
    }

    const bearerToken = extractBearerToken(request.headers.get("authorization"));
    const queryToken = request.nextUrl.searchParams.get("token");
    const token = bearerToken || queryToken;

    if (!token) {
      return NextResponse.json(
        { error: { code: "UNAUTHORIZED", message: "Missing authorization token." } },
        { status: 401 }
      );
    }

    let isAuthorized = false;

    // 1. Try verifying as JWT
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const claims = await verifyToken<any>(token);
      if (claims) {
        const isDocCreator = claims.document_id === id && claims.role === "creator";
        const isIdentityCreator = claims.ml_dsa_public_key_hash === document.creator_ml_dsa_public_key_hash;
        const isSigner = claims.document_id === id && claims.role === "signer";
        if (isDocCreator || isIdentityCreator || isSigner) {
          isAuthorized = true;
        }
      }
    } catch {
      // Not a JWT, check if it's a raw signing token below
    }

    // 2. If not authorized via JWT, check raw signing token
    if (!isAuthorized) {
      const signer = await db.getSignerByTokenHash(sha256Hex(token));
      if (signer && signer.document_id === id) {
        isAuthorized = true;
      }
    }

    if (!isAuthorized) {
      return NextResponse.json(
        { error: { code: "FORBIDDEN", message: "Not authorized to access status for this document." } },
        { status: 403 }
      );
    }

    let certificateUrl: string | null = null;
    if (document.certificate_pdf_path) {
      certificateUrl = await storage.getPresignedDownloadUrl(
        document.certificate_pdf_path,
        3600
      );
    }

    const allSigners = await db.listSignersByDocument(id);
    const totalSigners = allSigners.length;
    const completedSigners = allSigners.filter((s) => !!s.signed_at).length;
    const isAllCompleted = totalSigners > 0 && completedSigners === totalSigners;

    return NextResponse.json({
      document_id: document.id,
      status: document.status,
      total_signers: totalSigners,
      completed_signers: completedSigners,
      is_all_completed: isAllCompleted,
      certificate_ready: !!document.certificate_pdf_path,
      certificate_url: certificateUrl,
      ots_status: document.ots_status,
      final_merkle_root: document.final_merkle_root,
      updated_at: document.updated_at,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message } },
      { status: 500 }
    );
  }
}


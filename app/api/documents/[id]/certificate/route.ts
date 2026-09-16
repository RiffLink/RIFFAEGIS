import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/server/db";
import { storage } from "@/lib/server/storage";
import { extractBearerToken, verifyToken } from "@/lib/server/jwt";

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

    // Verify token
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const claims = await verifyToken<any>(token);

    const document = await db.getDocument(id);
    if (!document) {
      return NextResponse.json(
        { error: { code: "DOCUMENT_NOT_FOUND", message: "Document not found." } },
        { status: 404 }
      );
    }

    const isDocCreator = claims.document_id === id && claims.role === "creator";
    const isIdentityCreator = claims.ml_dsa_public_key_hash === document.creator_ml_dsa_public_key_hash;
    const isSigner = claims.document_id === id && claims.role === "signer";

    if (!isDocCreator && !isIdentityCreator && !isSigner) {
      return NextResponse.json(
        { error: { code: "FORBIDDEN", message: "Not authorized to access certificate." } },
        { status: 403 }
      );
    }

    if (!document.certificate_pdf_path) {
      return NextResponse.json(
        { error: { code: "CERTIFICATE_NOT_READY", message: "Audit certificate is not yet generated." } },
        { status: 404 }
      );
    }

    const certificatePdfPresignedUrl = await storage.getPresignedDownloadUrl(
      document.certificate_pdf_path,
      900 // 15 mins
    );

    const otsProofPresignedUrl = document.ots_proof_path
      ? await storage.getPresignedDownloadUrl(document.ots_proof_path, 900)
      : null;

    return NextResponse.json({
      certificate_pdf_presigned_url: certificatePdfPresignedUrl,
      ots_proof_presigned_url: otsProofPresignedUrl,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message } },
      { status: 500 }
    );
  }
}

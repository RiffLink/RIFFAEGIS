import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/server/db";
import { storage } from "@/lib/server/storage";
import { extractBearerToken, verifyToken, SignerSessionTokenClaims } from "@/lib/server/jwt";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token: _token } = await params;
    const bearerToken = extractBearerToken(request.headers.get("authorization"));
    if (!bearerToken) {
      return NextResponse.json(
        { error: { code: "UNAUTHORIZED", message: "Missing Bearer token." } },
        { status: 401 }
      );
    }

    const claims = await verifyToken<SignerSessionTokenClaims>(bearerToken);
    if (claims.role !== "signer") {
      return NextResponse.json(
        { error: { code: "FORBIDDEN", message: "Requires signer token." } },
        { status: 403 }
      );
    }

    const document = await db.getDocument(claims.document_id);
    if (!document) {
      return NextResponse.json(
        { error: { code: "DOCUMENT_NOT_FOUND", message: "Document not found." } },
        { status: 404 }
      );
    }

    const downloadUrl = await storage.getPresignedDownloadUrl(
      document.encrypted_original_path || `documents/${document.id}/original.enc`,
      900 // 15 mins
    );

    return NextResponse.json({
      r2_presigned_download_url: downloadUrl,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message } },
      { status: 500 }
    );
  }
}

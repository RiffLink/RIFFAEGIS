import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/server/db";
import { storage } from "@/lib/server/storage";
import { extractBearerToken, verifyToken, CreatorDocumentTokenClaims } from "@/lib/server/jwt";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const token = extractBearerToken(request.headers.get("authorization"));
    if (!token) {
      return NextResponse.json(
        { error: { code: "UNAUTHORIZED", message: "Missing Authorization Bearer token." } },
        { status: 401 }
      );
    }

    const claims = await verifyToken<CreatorDocumentTokenClaims>(token);
    if (claims.role !== "creator" || claims.document_id !== id) {
      return NextResponse.json(
        { error: { code: "FORBIDDEN", message: "Token is not authorized for this document." } },
        { status: 403 }
      );
    }

    const document = await db.getDocument(id);
    if (!document) {
      return NextResponse.json(
        { error: { code: "DOCUMENT_NOT_FOUND", message: "Document not found." } },
        { status: 404 }
      );
    }

    if (!document.encrypted_original_path) {
      return NextResponse.json(
        { error: { code: "INVALID_STATE", message: "Document storage path not found." } },
        { status: 400 }
      );
    }

    // Verify file actually uploaded to storage
    const exists = await storage.objectExists(document.encrypted_original_path);
    if (!exists) {
      return NextResponse.json(
        { error: { code: "UPLOAD_NOT_FOUND", message: "Encrypted binary has not been uploaded to storage yet." } },
        { status: 400 }
      );
    }

    await db.updateDocument(id, {
      upload_confirmed: true,
    });

    return NextResponse.json({
      status: "uploaded",
      upload_confirmed: true,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message } },
      { status: 500 }
    );
  }
}

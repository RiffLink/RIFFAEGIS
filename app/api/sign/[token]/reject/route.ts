import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/server/db";
import { extractBearerToken, verifyToken, SignerSessionTokenClaims } from "@/lib/server/jwt";
import { appendAuditLog } from "@/lib/server/merkle";

export async function POST(
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
        { error: { code: "FORBIDDEN", message: "Unauthorized token." } },
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

    const body = await request.json().catch(() => ({}));
    const reason = body.reason || "Signer rejected the agreement";

    await db.updateDocument(document.id, {
      status: "rejected",
      rejection_reason: reason,
    });

    await appendAuditLog(document.id, "REJECTED", {
      signer_id: claims.signer_id,
      email: claims.email_verified,
      reason,
      rejected_at: new Date().toISOString(),
    });

    return NextResponse.json({
      rejected: true,
      status: "rejected",
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message } },
      { status: 500 }
    );
  }
}

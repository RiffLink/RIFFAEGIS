import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/server/db";
import { extractBearerToken, verifyToken } from "@/lib/server/jwt";
import { appendAuditLog } from "@/lib/server/merkle";
import {
  checkIdempotency,
  getIdempotencyKeyFromRequest,
  recordIdempotency,
} from "@/lib/server/idempotency";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const idempotencyKey = getIdempotencyKeyFromRequest(request);
  const cachedResponse = await checkIdempotency(idempotencyKey);
  if (cachedResponse) return cachedResponse;

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

    const isDocCreator = claims.document_id === id && claims.role === "creator";
    const isIdentityCreator = claims.ml_dsa_public_key_hash === document.creator_ml_dsa_public_key_hash;

    if (!isDocCreator && !isIdentityCreator) {
      return NextResponse.json(
        { error: { code: "FORBIDDEN", message: "Only document creator can cancel." } },
        { status: 403 }
      );
    }

    if (document.status !== "pending") {
      return NextResponse.json(
        {
          error: {
            code: "INVALID_STATE",
            message: `Only documents in 'pending' status can be cancelled. Current status is '${document.status}'.`,
          },
        },
        { status: 400 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const reason = body.reason || "Cancelled by document creator";

    await db.updateDocument(id, {
      status: "cancelled",
      cancellation_reason: reason,
    });

    await appendAuditLog(id, "CANCELLED", {
      reason,
      cancelled_at: new Date().toISOString(),
    });

    const responsePayload = {
      cancelled: true,
      status: "cancelled",
      document_id: id,
    };

    await recordIdempotency(idempotencyKey, `/api/documents/${id}/cancel`, 200, responsePayload);

    return NextResponse.json(responsePayload, { status: 200 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message } },
      { status: 500 }
    );
  }
}

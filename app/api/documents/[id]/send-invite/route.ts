import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/server/db";
import { emailService } from "@/lib/server/email";
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
        { error: { code: "UNAUTHORIZED", message: "Missing Bearer token." } },
        { status: 401 }
      );
    }

    const claims = await verifyToken<CreatorDocumentTokenClaims>(token);
    if (claims.document_id !== id) {
      return NextResponse.json(
        { error: { code: "FORBIDDEN", message: "Unauthorized token." } },
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

    const body = await request.json();
    const { signing_url, to_email, creator_name, document_title } = body;

    if (!signing_url || !to_email) {
      return NextResponse.json(
        { error: { code: "INVALID_PARAMS", message: "signing_url and to_email are required." } },
        { status: 400 }
      );
    }

    const meta = (document.creator_webauthn_binding || {}) as Record<string, unknown>;
    const finalCreatorName = creator_name || meta.creator_name || "契約書作成者";

    const sent = await emailService.sendSigningInvitationEmail({
      toEmail: to_email,
      creatorName: String(finalCreatorName),
      creatorEmail: String(meta.creator_email || ""),
      signingUrl: signing_url,
      documentTitle: document_title || "電子契約書",
    });

    if (!sent) {
      return NextResponse.json(
        { error: { code: "SEND_FAILED", message: "メール送信に失敗しました。" } },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, to_email });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message } },
      { status: 500 }
    );
  }
}

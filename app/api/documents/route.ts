import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/server/db";
import { extractBearerToken, verifyToken, CreatorIdentityTokenClaims } from "@/lib/server/jwt";

export async function GET(request: NextRequest) {
  try {
    const token = extractBearerToken(request.headers.get("authorization"));
    if (!token) {
      return NextResponse.json(
        { error: { code: "UNAUTHORIZED", message: "Missing Bearer token." } },
        { status: 401 }
      );
    }

    const claims = await verifyToken<CreatorIdentityTokenClaims>(token);
    if (claims.role !== "creator_admin") {
      return NextResponse.json(
        { error: { code: "FORBIDDEN", message: "Requires creator identity token." } },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") || undefined;

    const documents = await db.listDocumentsByCreator(claims.ml_dsa_public_key_hash, status);

    const enrichedDocuments = await Promise.all(
      documents.map(async (doc) => {
        const signer = await db.getSignerByDocument(doc.id);
        const meta = (doc.creator_webauthn_binding || {}) as Record<string, unknown>;
        const title =
          (meta.document_title as string) ||
          (meta.original_filename as string) ||
          (doc.id === "9470715e-b449-4630-8c6a-aff0054cbbd1" ? "プロジェクト参加合意書" : "電子契約書");

        return {
          ...doc,
          title,
          signer_email: signer?.email || null,
        };
      })
    );

    return NextResponse.json({
      documents: enrichedDocuments,
      total: enrichedDocuments.length,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message } },
      { status: 500 }
    );
  }
}

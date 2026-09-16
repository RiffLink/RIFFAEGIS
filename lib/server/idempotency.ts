import { NextRequest, NextResponse } from "next/server";
import { db } from "./db";

export function getIdempotencyKeyFromRequest(request: NextRequest): string | null {
  return request.headers.get("idempotency-key") || request.headers.get("Idempotency-Key") || null;
}

export async function checkIdempotency(
  key: string | null
): Promise<NextResponse | null> {
  if (!key) return null;
  const cached = await db.getIdempotencyKey(key);
  if (cached) {
    return NextResponse.json(cached.body, { status: cached.status });
  }
  return null;
}

export async function recordIdempotency(
  key: string | null,
  endpoint: string,
  status: number,
  body: unknown
): Promise<void> {
  if (!key) return;
  await db.saveIdempotencyKey(key, endpoint, status, body);
}

import { NextRequest, NextResponse } from "next/server";
import { mockStorage } from "@/lib/server/storage";

export async function PUT(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const key = searchParams.get("key");

  if (!key) {
    return NextResponse.json({ error: "Missing key parameter" }, { status: 400 });
  }

  const arrayBuffer = await request.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  const contentType = request.headers.get("content-type") || "application/octet-stream";

  mockStorage.set(key, { bytes, contentType });

  return new NextResponse(null, { status: 200 });
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const key = searchParams.get("key");

  if (!key) {
    return NextResponse.json({ error: "Missing key parameter" }, { status: 400 });
  }

  const item = mockStorage.get(key);
  if (!item) {
    return NextResponse.json({ error: "Object not found" }, { status: 404 });
  }

  return new NextResponse(item.bytes as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": item.contentType,
      "Content-Length": item.bytes.byteLength.toString(),
      "Cache-Control": "private, max-age=3600",
    },
  });
}

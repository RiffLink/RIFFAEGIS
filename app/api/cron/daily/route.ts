import { NextRequest, NextResponse } from "next/server";
import { GET as expireDocuments } from "../expire-documents/route";
import { GET as upgradeOts } from "../upgrade-ots/route";
import { GET as cleanup } from "../cleanup/route";

/**
 * Vercel Hobby プラン対応: 統合日次メンテナンス Cron
 * Hobby プランの「1日1回実行制限」を満たすため、全メンテナンス処理を1つに集約して実行します。
 */
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results: Record<string, unknown> = {};

  try {
    // 1. 期限切れ契約の自動失効 & 孤立データのパージ
    const expireRes = await expireDocuments(req);
    results.expire = await expireRes.json();
  } catch (err) {
    results.expire = { error: String(err) };
  }

  try {
    // 2. OpenTimestamps (ビットコイン・カレンダー) 確定確認
    const otsRes = await upgradeOts(req);
    results.ots = await otsRes.json();
  } catch (err) {
    results.ots = { error: String(err) };
  }

  try {
    // 3. 冪等性キー & 終了ドキュメントの安全クリーンアップ
    const cleanupRes = await cleanup(req);
    results.cleanup = await cleanupRes.json();
  } catch (err) {
    results.cleanup = { error: String(err) };
  }

  return NextResponse.json({
    success: true,
    timestamp: new Date().toISOString(),
    results,
  });
}

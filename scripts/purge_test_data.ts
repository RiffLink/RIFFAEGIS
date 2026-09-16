import { db } from "../lib/server/db";
import { storage } from "../lib/server/storage";

async function main() {
  const args = process.argv.slice(2);
  const target = args[0];

  console.log("==================================================");
  console.log("RiffAegis データ削除・クリーンアップツール");
  console.log("==================================================");

  if (!target || target === "--help" || target === "-h") {
    console.log("使用方法:");
    console.log("  npx tsx scripts/purge_test_data.ts <document_id>   : 指定IDのドキュメントと全ファイルを削除");
    console.log("  npx tsx scripts/purge_test_data.ts --all           : 全ドキュメントと全ストレージファイルを一括削除");
    console.log("  npx tsx scripts/purge_test_data.ts --test          : テスト作成データのみを検索して削除");
    process.exit(0);
  }

  if (target === "--all") {
    console.log("⚠️ 全ドキュメントおよびストレージファイルの削除を実行します...");
    const filesCount = await storage.purgeAllFiles();
    const docsCount = await db.purgeAllDocuments();
    console.log(`✅ 完了: ${docsCount} 件のドキュメント、および ${filesCount} 個のストレージファイルを削除しました。`);
    process.exit(0);
  }

  if (target === "--test") {
    console.log("🔍 テスト作成ドキュメントを検索中...");
    const allDocs = await db.listAllDocuments(100);
    const testDocs = allDocs.filter((d) => {
      const meta = (d.creator_webauthn_binding || {}) as Record<string, unknown>;
      const title = (meta.document_title as string) || "";
      const email = (meta.creator_email as string) || (meta.signer_email as string) || "";
      return (
        title.includes("テスト") ||
        title.includes("プロジェクト参加合意書") ||
        email.includes("example.com") ||
        email.includes("test") ||
        d.status === "initialized"
      );
    });

    if (testDocs.length === 0) {
      console.log("テストデータは見つかりませんでした。");
      process.exit(0);
    }

    console.log(`対象件数: ${testDocs.length} 件`);
    for (const doc of testDocs) {
      console.log(`- 削除中: ID=${doc.id} (${(doc.creator_webauthn_binding as Record<string, string>)?.document_title || doc.status})`);
      await storage.deleteDocumentFiles(doc.id);
      await db.deleteDocument(doc.id);
    }
    console.log(`✅ テストデータ ${testDocs.length} 件の削除が完了しました。`);
    process.exit(0);
  }

  // Target is a specific document ID
  const docId = target.trim();
  console.log(`🔍 ドキュメント ID: ${docId} の削除を実行中...`);
  const doc = await db.getDocument(docId);
  if (!doc) {
    console.log(`⚠️ 指定されたドキュメント (ID: ${docId}) はDB内に見つかりませんでした。ストレージファイルの残骸のみ削除を試行します。`);
  }
  await storage.deleteDocumentFiles(docId);
  await db.deleteDocument(docId);
  console.log(`✅ ドキュメント (${docId}) および関連ストレージファイルの削除が完了しました。`);
}

main().catch((err) => {
  console.error("エラーが発生しました:", err);
  process.exit(1);
});

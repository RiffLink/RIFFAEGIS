import { get, set } from "idb-keyval";
import JSZip from "jszip";
import { KeyPairMlDsa } from "./types";
import { bytesToBase64, base64ToBytes } from "./hashes";

const IDB_KEY_MLDSA_PK = "riffaegis_mldsa_public_key";
const IDB_KEY_MLDSA_SK = "riffaegis_mldsa_secret_key";

/**
 * Cache ML-DSA Identity keypair in browser IndexedDB
 */
export async function storeIdentityInIndexedDB(keyPair: KeyPairMlDsa): Promise<void> {
  if (typeof window === "undefined") return;
  await set(IDB_KEY_MLDSA_PK, bytesToBase64(keyPair.publicKey));
  await set(IDB_KEY_MLDSA_SK, bytesToBase64(keyPair.secretKey));
}

/**
 * Load ML-DSA Identity keypair from browser IndexedDB
 */
export async function loadIdentityFromIndexedDB(): Promise<KeyPairMlDsa | null> {
  if (typeof window === "undefined") return null;
  const pkBase64 = await get<string>(IDB_KEY_MLDSA_PK);
  const skBase64 = await get<string>(IDB_KEY_MLDSA_SK);

  if (!pkBase64 || !skBase64) return null;

  return {
    publicKey: base64ToBytes(pkBase64),
    secretKey: base64ToBytes(skBase64),
  };
}

/**
 * Trigger in-browser file download (used for .riffkey and ZIP bundle)
 */
export function downloadBlob(filename: string, data: Uint8Array | Blob | string, mimeType = "application/octet-stream"): void {
  if (typeof window === "undefined") return;
  const blob = data instanceof Blob ? data : new Blob([data as unknown as BlobPart], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Bundle Original PDF and Audit Certificate PDF into a single ZIP file using JSZip
 */
export async function createDetachedZipBundle(
  originalPdfBytes: Uint8Array,
  certificatePdfBytes: Uint8Array,
  baseFilename = "agreement"
): Promise<Blob> {
  const zip = new JSZip();
  zip.file(`${baseFilename}_original.pdf`, originalPdfBytes);
  zip.file(`${baseFilename}_audit_certificate.pdf`, certificatePdfBytes);
  zip.file(
    "README_VERIFICATION.txt",
    `RIFFAEGIS AGREEMENT PACKET
=============================================
This packet contains:
1. ${baseFilename}_original.pdf - The original, unmodified agreement binary.
2. ${baseFilename}_audit_certificate.pdf - The independent legal audit certificate.

You can verify the authenticity, SHA-256 integrity, and quantum-resistant ML-DSA-65 signatures offline at:
https://app.riff-aegis.com/verify
`
  );

  return zip.generateAsync({
    type: "blob",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
}

/**
 * Merge Original PDF and Audit Certificate PDF into a single, unified PDF file
 */
export async function mergeOriginalAndCertificatePdf(
  originalPdfBytes: Uint8Array,
  certificatePdfBytes: Uint8Array
): Promise<Uint8Array> {
  const { PDFDocument } = await import("pdf-lib");
  const originalDoc = await PDFDocument.load(originalPdfBytes);
  const certDoc = await PDFDocument.load(certificatePdfBytes);

  const copiedPages = await originalDoc.copyPages(certDoc, certDoc.getPageIndices());
  for (const page of copiedPages) {
    originalDoc.addPage(page);
  }

  return await originalDoc.save();
}

/**
 * Cache AES-256 document decryption key in browser IndexedDB
 */
export async function storeDocumentAesKey(documentId: string, aesKeyBase64Url: string): Promise<void> {
  if (typeof window === "undefined" || !documentId || !aesKeyBase64Url) return;
  await set(`riffaegis_aes_key_${documentId}`, aesKeyBase64Url);
}

/**
 * Retrieve cached AES-256 document decryption key from IndexedDB
 */
export async function getDocumentAesKey(documentId: string): Promise<string | null> {
  if (typeof window === "undefined" || !documentId) return null;
  const key = await get<string>(`riffaegis_aes_key_${documentId}`);
  return key || null;
}

/**
 * Bundle for Creator (甲): Original PDF, Certificate PDF, Merged Combined PDF, and Storage README
 */
export async function createCreatorPackageZip(
  originalPdfBytes: Uint8Array,
  certificatePdfBytes: Uint8Array,
  combinedPdfBytes: Uint8Array,
  docTitle: string,
  docId: string
): Promise<Blob> {
  const zip = new JSZip();
  const safeTitle = (docTitle || "contract").replace(/[/\\?%*:|"<>]/g, "_");
  zip.file(`①原本契約書_${safeTitle}.pdf`, originalPdfBytes);
  zip.file(`②合意締結証明書_${safeTitle}.pdf`, certificatePdfBytes);
  zip.file(`③締結完了契約書_${safeTitle}_結合版.pdf`, combinedPdfBytes);

  const readme = `======================================================================
RiffAegis // 甲（契約作成者）契約保全パッケージ
======================================================================

文書名: ${docTitle}
文書識別ID: ${docId}
発行時刻: ${new Date().toISOString()}

【本ZIPアーカイブに含まれるファイル】
① 原本契約書_${safeTitle}.pdf
   - 作成時にアップロードされた契約書の原本PDFです。
   - 暗号学的完全性（SHA-256ハッシュ）が合意締結証明書およびブロックチェーン/GitHubに記録されています。

② 合意締結証明書_${safeTitle}.pdf
   - NICT世界原子時計による日本標準時、GitHub公開タイムスタンプ、OpenTimestamps、
     および全署名者（甲・乙）の耐量子署名・WebAuthn生体署名を記録した公式監査証跡です。

③ 締結完了契約書_${safeTitle}_結合版.pdf
   - 原本PDFの末尾に合意締結証明書を結合した1本のPDFです。
   - 社内保管、法務確認、税務調査等の日常的な契約書管理・閲覧にそのままご活用いただけます。

【保管・保全に関する重要なお願い（電子帳簿保存法・民法対応）】
1. 保存推奨期間:
   - 会社法・法人税法・電子帳簿保存法に基づき、7年間〜10年間の保管が推奨されます。
2. 保管先:
   - 本ZIPパッケージ、または結合版PDFを貴社のGoogle Drive、OneDrive、Dropbox、
     社内ファイルサーバー等の安全なバックアップストレージに格納してください。
3. 耐量子キーストア（.riffkey）について:
   - 契約作成時（Step 2）にダウンロードした「.riffkey」ファイルは、甲の本人確認鍵です。
   - パスフレーズとともに安全なキーストアまたはオフライン媒体に保管してください。

【検証について】
- 本契約書はサーバーやRiffAegisサービスが将来終了した場合でも、
  原本PDFと証明書PDFがあれば完全にオフラインで有効性を検証可能です。
- 検証ポータル: /verify （またはローカル検証ツール）

RiffAegis - Post-Quantum Zero-Knowledge Electronic Signature Platform
======================================================================
`;
  zip.file("README_契約書保管・検証ガイド.txt", readme);
  return await zip.generateAsync({
    type: "blob",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
}

/**
 * Run cryptographic tasks in off-thread Web Worker if available
 */
export async function runCryptoWorker<T>(
  type: "HASH_SHA256" | "ENCRYPT_AES_GCM" | "DECRYPT_AND_VERIFY",
  payload: unknown,
  transfer: Transferable[] = []
): Promise<T> {
  if (typeof window === "undefined" || typeof Worker === "undefined") {
    throw new Error("Web Worker unavailable in this environment");
  }

  return new Promise((resolve, reject) => {
    const worker = new Worker("/workers/crypto-worker.js");
    const id = Math.random().toString(36).slice(2);

    const timer = setTimeout(() => {
      worker.terminate();
      reject(new Error("Worker operation timed out"));
    }, 60000);

    worker.onmessage = (e) => {
      clearTimeout(timer);
      worker.terminate();
      if (e.data.id === id) {
        if (e.data.success) {
          resolve(e.data.result as T);
        } else {
          reject(new Error(e.data.error || "Worker operation failed"));
        }
      }
    };

    worker.onerror = (err) => {
      clearTimeout(timer);
      worker.terminate();
      reject(err);
    };

    worker.postMessage({ id, type, payload }, transfer);
  });
}


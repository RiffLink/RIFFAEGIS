"use client";

import { useState } from "react";
import {
  ShieldCheck,
  CheckCircle2,
  FileCheck,
  Printer,
  FileText,
  ExternalLink,
} from "lucide-react";
import {
  verifyAgreementOffline,
  extractCertificateMetadata,
  DocumentVerificationReport,
} from "@/lib/crypto/verify-portal";

export default function VerifyPortalPage() {
  const [originalFile, setOriginalFile] = useState<File | null>(null);
  const [certFile, setCertFile] = useState<File | null>(null);
  const [expectedSha256, setExpectedSha256] = useState<string>("");
  const [report, setReport] = useState<DocumentVerificationReport | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [metaAutoDetected, setMetaAutoDetected] = useState(false);

  const handleCertFileSelect = async (file: File | null) => {
    setCertFile(file);
    setMetaAutoDetected(false);
    if (!file) return;

    try {
      const buf = await file.arrayBuffer();
      const meta = await extractCertificateMetadata(new Uint8Array(buf));
      if (meta?.originalSha256) {
        setExpectedSha256(meta.originalSha256);
        setMetaAutoDetected(true);
      }
    } catch {
      // ignore
    }
  };

  const handleVerify = async () => {
    if (!originalFile) {
      alert("原本PDFを選択してください。");
      return;
    }

    setIsVerifying(true);
    try {
      const originalBuf = await originalFile.arrayBuffer();
      const originalBytes = new Uint8Array(originalBuf);

      let certBytes: Uint8Array | undefined;
      let meta = null;
      if (certFile) {
        const certBuf = await certFile.arrayBuffer();
        certBytes = new Uint8Array(certBuf);
        meta = await extractCertificateMetadata(certBytes);
      }

      const verificationResult = verifyAgreementOffline({
        originalPdfBytes: originalBytes,
        certificatePdfBytes: certBytes,
        expectedSha256: expectedSha256.trim() || meta?.originalSha256,
        expectedSha3_512: meta?.originalSha3_512,
        creatorPublicKeyBase64: meta?.creatorPublicKeyBase64,
        creatorSignatureBase64: meta?.creatorSignatureBase64,
        finalMerkleRoot: meta?.finalMerkleRoot,
      });

      setReport(verificationResult);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "検証エラー");
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6 py-2">
      <div className="text-center space-y-2">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
          第三者・スタンドアローン検証
        </h1>
        <p className="text-xs sm:text-sm text-slate-500 max-w-lg mx-auto leading-relaxed">
          サーバー通信を行わず、原本PDFと合意締結証明書（および.ots）をブラウザ内で完全検証します。
        </p>
      </div>

      <div className="riff-card p-6 sm:p-8 rounded-2xl space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="p-5 rounded-xl bg-slate-50 border border-slate-200 text-center space-y-2">
            <FileText className="w-8 h-8 text-[#0284c7] mx-auto" />
            <p className="text-xs font-bold text-slate-800">1. 検証対象の原本PDF</p>
            <input
              type="file"
              accept="application/pdf"
              onChange={(e) => e.target.files && setOriginalFile(e.target.files[0])}
              className="text-xs text-slate-500 file:mr-2 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-xs file:bg-white file:text-slate-800 file:shadow-sm cursor-pointer"
            />
            {originalFile && (
              <p className="text-[11px] font-mono text-emerald-600 truncate font-bold">
                {originalFile.name}
              </p>
            )}
          </div>

          <div className="p-6 rounded-[2rem] bg-slate-50 border border-slate-200 text-center space-y-2">
            <FileCheck className="w-8 h-8 text-[#FF70A6] mx-auto" />
            <p className="text-xs font-bold text-slate-800">2. 合意締結証明書 (PDF)</p>
            <input
              type="file"
              accept="application/pdf"
              onChange={(e) => e.target.files && handleCertFileSelect(e.target.files[0])}
              className="text-xs text-slate-500 file:mr-2 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-xs file:bg-white file:text-slate-800 file:shadow-sm cursor-pointer"
            />
            {certFile && (
              <div className="space-y-1">
                <p className="text-[11px] font-mono text-emerald-600 truncate font-bold">
                  {certFile.name}
                </p>
                {metaAutoDetected && (
                  <span className="inline-block px-2 py-0.5 rounded-full bg-blue-100 text-[#0284c7] text-[10px] font-bold">
                    ✓ メタデータ＆暗号署名を自動抽出
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">
            照合用 SHA-256 ハッシュ (任意)
          </label>
          <input
            type="text"
            placeholder="証明書記載のハッシュ値を貼り付け"
            value={expectedSha256}
            onChange={(e) => setExpectedSha256(e.target.value)}
            className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 font-mono text-xs focus:outline-none focus:border-[#70D6FF]"
          />
        </div>

        <button
          onClick={handleVerify}
          disabled={!originalFile || isVerifying}
          className="w-full riff-btn-primary py-4 rounded-2xl text-slate-950 font-bold text-sm tracking-wide disabled:opacity-40 flex items-center justify-center space-x-2"
        >
          <ShieldCheck className="w-5 h-5 text-slate-950" />
          <span>{isVerifying ? "オフライン再計算中..." : "完全性検証を実行"}</span>
        </button>

        {report && (
          <div className="pt-4 border-t border-slate-100 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-900 flex items-center space-x-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                <span>検証レポート</span>
              </h2>

              <button
                onClick={() => window.print()}
                className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold flex items-center space-x-1"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>印刷 / 保存</span>
              </button>
            </div>

            <div className="space-y-2">
              {report.checks.map((c) => (
                <div key={c.id} className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 flex items-center justify-between text-xs">
                  <div>
                    <span className="font-bold text-slate-900">{c.name}</span>
                    <p className="text-[11px] text-slate-500 mt-0.5">{c.description}</p>
                  </div>
                  <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[10px] font-mono font-bold">
                    {c.status}
                  </span>
                </div>
              ))}
            </div>

            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 font-mono text-[11px] text-slate-600 space-y-1">
              <div>SHA-256: <strong className="text-slate-900 break-all">{report.originalSha256}</strong></div>
              <div>ファイルサイズ: {report.fileSizeBytes.toLocaleString()} bytes</div>
            </div>
          </div>
        )}

        {/* Global Public Anchor Verification Guide */}
        <div className="p-5 rounded-2xl bg-amber-50/60 border border-amber-200/70 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <span className="text-xs font-bold text-amber-900">🌐 外部分散アンカー（第三者監査）</span>
            </div>
            <a
              href="https://github.com/RiffLink/riffaegis-anchors"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-semibold text-amber-800 hover:text-amber-950 flex items-center space-x-1 underline underline-offset-2"
            >
              <span>公開台帳を開く</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
          <p className="text-xs text-amber-800/90 leading-relaxed">
            合意締結証明書に記載された <strong>Final Merkle Root</strong> は、GitHub 公開リポジトリ（
            <a
              href="https://github.com/RiffLink/riffaegis-anchors"
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono font-bold underline"
            >
              RiffLink/riffaegis-anchors
            </a>
            ）にも自動刻印されています。コミット履歴のハッシュと突き合わせることで、RiffAegis サーバーの稼働状況に依存せず、いつでも契約日時の存在を数学的・客観的に立証できます。
          </p>
        </div>
      </div>
    </div>
  );
}

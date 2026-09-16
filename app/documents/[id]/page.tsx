"use client";

import { useState, useEffect, use, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ShieldCheck,
  Download,
  ArrowLeft,
  XCircle,
  Loader2,
  HardDrive,
  Info,
  CheckCircle2,
  FileText,
  Sparkles,
  ExternalLink,
  Key,
  Trash2,
} from "lucide-react";
import { DocumentRecord, AuditLogRecord } from "@/lib/server/types";
import { createClient } from "@supabase/supabase-js";
import { importAesKeyFromBase64Url, decryptPdfAndVerify } from "@/lib/crypto";
import {
  downloadBlob,
  mergeOriginalAndCertificatePdf,
  createCreatorPackageZip,
  getDocumentAesKey,
  storeDocumentAesKey,
} from "@/lib/crypto/client";

export default function DocumentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();

  const [document, setDocument] = useState<DocumentRecord | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLogRecord[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [signer, setSigner] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Creator Download States
  const [isZipping, setIsZipping] = useState(false);
  const [isMerging, setIsMerging] = useState(false);
  const [zipDownloaded, setZipDownloaded] = useState(false);
  const [mergedDownloaded, setMergedDownloaded] = useState(false);
  const [decryptedOriginalBytes, setDecryptedOriginalBytes] = useState<Uint8Array | null>(null);
  const [manualKey, setManualKey] = useState("");
  const [hasAesKey, setHasAesKey] = useState<boolean | null>(null);

  const fetchDetails = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    const token =
      sessionStorage.getItem(`riff_doc_token_${id}`) ||
      sessionStorage.getItem("riff_creator_identity_token");

    try {
      const res = await fetch(`/api/documents/${id}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      if (!res.ok) {
        throw new Error("ドキュメント詳細の取得に失敗しました。");
      }

      const data = await res.json();
      setDocument(data.document);
      setAuditLogs(data.auditLogs || []);
      setSigner(data.signer);

      // Check if AES key is cached in IndexedDB
      const cachedKey = await getDocumentAesKey(id);
      const tempKey = sessionStorage.getItem("riffaegis_temp_aes_key");
      setHasAesKey(!!cachedKey || !!tempKey);
    } catch (err: unknown) {
      if (!isSilent) setError(err instanceof Error ? err.message : "読み込みエラー");
    } finally {
      if (!isSilent) setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchDetails();

    // Supabase Realtime live update
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (supabaseUrl && supabaseAnonKey) {
      try {
        const supabase = createClient(supabaseUrl, supabaseAnonKey);
        const channel = supabase
          .channel(`creator-doc-${id}`)
          .on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: "documents_realtime_status",
              filter: `document_id=eq.${id}`,
            },
            () => {
              fetchDetails(true);
            }
          )
          .subscribe();

        return () => {
          supabase.removeChannel(channel);
        };
      } catch (err) {
        console.warn("Realtime creator subscription failed:", err);
      }
    }
  }, [id, fetchDetails]);

  const handleCancel = async () => {
    if (!confirm("この契約依頼を取り消しますか？相手方は署名できなくなります。")) {
      return;
    }
    setIsCancelling(true);
    const token =
      sessionStorage.getItem(`riff_doc_token_${id}`) ||
      sessionStorage.getItem("riff_creator_identity_token");

    try {
      const res = await fetch(`/api/documents/${id}/cancel`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ reason: "作成者による手動キャンセル" }),
      });

      if (!res.ok) throw new Error("キャンセルの処理に失敗しました。");
      await fetchDetails();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "キャンセルエラー");
    } finally {
      setIsCancelling(false);
    }
  };

  const handleDeleteDocument = async () => {
    const ok = window.confirm(
      "この契約書とストレージ上の暗号化データを完全に削除しますか？\n（この操作は元に戻せません）"
    );
    if (!ok) return;

    setIsDeleting(true);
    const token =
      sessionStorage.getItem(`riff_doc_token_${id}`) ||
      sessionStorage.getItem("riff_creator_identity_token");

    try {
      const res = await fetch(`/api/documents/${id}`, {
        method: "DELETE",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error?.message || "削除に失敗しました。");
      }

      sessionStorage.removeItem(`riff_doc_token_${id}`);
      router.push("/documents");
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "削除エラーが発生しました。");
      setIsDeleting(false);
    }
  };

  const getCertificatePdfBytes = useCallback(async (): Promise<Uint8Array | null> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let certUrl = (document as any)?.certificate_url;
    if (!certUrl) {
      const token =
        sessionStorage.getItem(`riff_doc_token_${id}`) ||
        sessionStorage.getItem("riff_creator_identity_token");
      const res = await fetch(`/api/documents/${id}/certificate`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        const data = await res.json();
        certUrl = data.certificate_pdf_presigned_url;
      }
    }
    if (!certUrl) return null;
    try {
      const certRes = await fetch(certUrl);
      if (!certRes.ok) return null;
      return new Uint8Array(await certRes.arrayBuffer());
    } catch (e) {
      console.error(e);
      return null;
    }
  }, [id, document]);

  const getOrDecryptOriginalPdf = useCallback(async (): Promise<Uint8Array | null> => {
    if (decryptedOriginalBytes) return decryptedOriginalBytes;
    let keyToUse = manualKey.trim();
    if (!keyToUse) {
      keyToUse = (await getDocumentAesKey(id)) || "";
    }
    if (!keyToUse) {
      const tempKey = sessionStorage.getItem("riffaegis_temp_aes_key");
      if (tempKey) keyToUse = tempKey;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const encUrl = (document as any)?.encrypted_original_url;
    if (keyToUse && encUrl && document) {
      try {
        const encRes = await fetch(encUrl);
        if (encRes.ok) {
          const encBytes = new Uint8Array(await encRes.arrayBuffer());
          const cryptoKey = await importAesKeyFromBase64Url(keyToUse);
          const plainBytes = await decryptPdfAndVerify(encBytes, cryptoKey, document.original_sha256);
          setDecryptedOriginalBytes(plainBytes);
          await storeDocumentAesKey(id, keyToUse);
          setHasAesKey(true);
          return plainBytes;
        }
      } catch (e) {
        console.warn("Creator PDF decryption failed:", e);
      }
    }
    return null;
  }, [decryptedOriginalBytes, manualKey, id, document]);

  const handleDownloadCertificate = async () => {
    const token =
      sessionStorage.getItem(`riff_doc_token_${id}`) ||
      sessionStorage.getItem("riff_creator_identity_token");

    try {
      const res = await fetch(`/api/documents/${id}/certificate`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("証明書の取得に失敗しました。");
      const data = await res.json();
      if (data.certificate_pdf_presigned_url) {
        window.open(data.certificate_pdf_presigned_url, "_blank");
      }
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "ダウンロードエラー");
    }
  };

  const handleDownloadCreatorPackage = async () => {
    setIsZipping(true);
    try {
      const certBytes = await getCertificatePdfBytes();
      if (!certBytes) throw new Error("合意締結証明書PDFが取得できませんでした。");

      let plainBytes = await getOrDecryptOriginalPdf();
      if (!plainBytes) {
        // Prompt for key if not in local storage
        const userKey = prompt(
          "この端末のブラウザに原本復号鍵がありません。\n契約作成時の共有URLに含まれる鍵（#以降）を入力してください:"
        );
        if (userKey) {
          const trimmed = userKey.trim();
          setManualKey(trimmed);
          const cryptoKey = await importAesKeyFromBase64Url(trimmed);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const encUrl = (document as any)?.encrypted_original_url;
          if (encUrl && document) {
            const encRes = await fetch(encUrl);
            const encBytes = new Uint8Array(await encRes.arrayBuffer());
            plainBytes = await decryptPdfAndVerify(encBytes, cryptoKey, document.original_sha256);
            setDecryptedOriginalBytes(plainBytes);
            await storeDocumentAesKey(id, trimmed);
            setHasAesKey(true);
          }
        }
      }

      if (!plainBytes) {
        downloadBlob(`合意締結証明書_${document?.title || "contract"}.pdf`, certBytes, "application/pdf");
        alert("原本復号鍵が入力されなかったため、合意締結証明書のみダウンロードしました。原本を含むZIPが必要な場合は共有URLの#以降の鍵を入力してください。");
        return;
      }

      const mergedBytes = await mergeOriginalAndCertificatePdf(plainBytes, certBytes);
      const zipBlob = await createCreatorPackageZip(
        plainBytes,
        certBytes,
        mergedBytes,
        document?.title || "契約書",
        id
      );
      downloadBlob(`RiffAegis_Creator_Packet_${id.slice(0, 8)}.zip`, zipBlob, "application/zip");
      setZipDownloaded(true);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "ZIP生成エラー");
    } finally {
      setIsZipping(false);
    }
  };

  const handleDownloadMergedPdf = async () => {
    setIsMerging(true);
    try {
      const certBytes = await getCertificatePdfBytes();
      if (!certBytes) throw new Error("合意締結証明書PDFが取得できませんでした。");

      const plainBytes = await getOrDecryptOriginalPdf();
      if (!plainBytes) {
        handleDownloadCertificate();
        return;
      }

      const mergedBytes = await mergeOriginalAndCertificatePdf(plainBytes, certBytes);
      downloadBlob(`${document?.title || "契約書"}_締結版.pdf`, mergedBytes, "application/pdf");
      setMergedDownloaded(true);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "結合PDF作成エラー");
    } finally {
      setIsMerging(false);
    }
  };

  const handleDownloadOriginalPdf = async () => {
    try {
      const plainBytes = await getOrDecryptOriginalPdf();
      if (plainBytes) {
        downloadBlob(`原本契約書_${document?.title || "contract"}.pdf`, plainBytes, "application/pdf");
      } else {
        alert("原本の復号鍵が見つかりません。作成時の共有URL（#以降）をご確認ください。");
      }
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "原本ダウンロードエラー");
    }
  };

  if (loading) {
    return (
      <div className="p-20 text-center space-y-3 riff-card max-w-4xl mx-auto">
        <Loader2 className="w-8 h-8 animate-spin text-[#70D6FF] mx-auto" />
        <p className="text-xs text-slate-400 font-mono">ドキュメント詳細を取得中...</p>
      </div>
    );
  }

  if (error || !document) {
    return (
      <div className="max-w-4xl mx-auto space-y-4 py-6">
        <Link href="/documents" className="text-xs font-bold text-slate-500 hover:text-slate-800 flex items-center space-x-1">
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>一覧へ戻る</span>
        </Link>
        <div className="p-6 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 py-2">
      {/* Top Bar */}
      <div className="flex items-center justify-between">
        <Link href="/documents" className="text-xs font-bold text-slate-500 hover:text-slate-800 flex items-center space-x-1 transition-colors">
          <ArrowLeft className="w-4 h-4" />
          <span>ダッシュボードへ戻る</span>
        </Link>

        <div className="flex items-center space-x-2">
          {document.status === "completed" && (
            <button
              onClick={handleDownloadCreatorPackage}
              disabled={isZipping}
              className="riff-btn-primary px-4 py-2 rounded-xl text-slate-950 font-bold text-xs flex items-center space-x-1.5"
            >
              <Sparkles className="w-4 h-4 text-slate-950" />
              <span>{zipDownloaded ? "契約保全パック再DL" : "契約保全パック一括DL (ZIP)"}</span>
            </button>
          )}

          {document.status === "pending" && (
            <button
              onClick={handleCancel}
              disabled={isCancelling}
              className="px-4 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 font-bold text-xs flex items-center space-x-1.5 transition-colors"
            >
              <XCircle className="w-4 h-4" />
              <span>{isCancelling ? "処理中..." : "依頼を取り消す"}</span>
            </button>
          )}

          <button
            onClick={handleDeleteDocument}
            disabled={isDeleting}
            className="px-3.5 py-2 rounded-xl border border-slate-200 hover:border-rose-300 hover:bg-rose-50 text-slate-500 hover:text-rose-600 font-bold text-xs flex items-center space-x-1.5 transition-colors"
            title="契約書とストレージ上のデータを完全削除"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>{isDeleting ? "削除中..." : "完全削除"}</span>
          </button>
        </div>
      </div>

      {/* Completed Document Download Hub for Creator */}
      {document.status === "completed" && (
        <div className="riff-card p-6 sm:p-8 rounded-[2.5rem] bg-gradient-to-br from-white via-slate-50/50 to-blue-50/30 border-2 border-emerald-500/20 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200/60 pb-4">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center flex-shrink-0">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <span className="text-[10px] font-mono text-emerald-600 font-bold uppercase tracking-wider">
                  AGREEMENT COMPLETED // 全員合意締結完了
                </span>
                <h2 className="text-lg sm:text-xl font-black italic tracking-tight text-slate-900">
                  締結完了契約書の保管・ダウンロード
                </h2>
              </div>
            </div>
            <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 self-start sm:self-auto">
              法的効力確定済
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {/* 1. All-in-One Creator Package ZIP */}
            <button
              onClick={handleDownloadCreatorPackage}
              disabled={isZipping}
              className="riff-btn-primary p-4 rounded-2xl font-bold text-xs flex items-center justify-between shadow-sm group transition-all"
            >
              <div className="flex items-center space-x-3">
                <Sparkles className="w-5 h-5 text-slate-950 flex-shrink-0" />
                <div className="text-left">
                  <div className="text-slate-950 font-black text-sm">
                    {zipDownloaded ? "再度保存: 甲用契約保全パック (ZIP)" : "甲用・契約保全パック一括DL (ZIP)"}
                  </div>
                  <div className="text-[11px] text-slate-800 font-normal mt-0.5">
                    原本PDF ＋ 締結証明書 ＋ 結合版 ＋ 保管ガイドをすべて同梱
                  </div>
                </div>
              </div>
              <span className="px-2 py-1 rounded-full bg-slate-950/10 text-[10px] font-black text-slate-950 whitespace-nowrap">
                ★ 推奨
              </span>
            </button>

            {/* 2. Combined Merged PDF */}
            <button
              onClick={handleDownloadMergedPdf}
              disabled={isMerging}
              className="p-4 rounded-2xl bg-white border border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-slate-800 font-bold text-xs flex items-center justify-between transition-colors shadow-sm"
            >
              <div className="flex items-center space-x-3">
                <FileText className="w-5 h-5 text-[#0284c7] flex-shrink-0" />
                <div className="text-left">
                  <div className="text-slate-900 font-bold text-sm">
                    {mergedDownloaded ? "再度保存: 結合版契約書 (PDF)" : "締結完了契約書（結合版PDF）"}
                  </div>
                  <div className="text-[11px] text-slate-400 font-normal mt-0.5">
                    原本末尾に証明書を綴じた1本のPDF（日常の社内管理・共有用）
                  </div>
                </div>
              </div>
              <Download className="w-4 h-4 text-slate-400" />
            </button>
          </div>

          {/* Individual items and tools */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-100 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={handleDownloadCertificate}
                className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-[11px] flex items-center space-x-1.5 transition-colors"
              >
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                <span>合意締結証明書のみ</span>
              </button>

              <button
                onClick={handleDownloadOriginalPdf}
                className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-[11px] flex items-center space-x-1.5 transition-colors"
              >
                <FileText className="w-3.5 h-3.5 text-slate-500" />
                <span>原本PDFのみ</span>
              </button>

              <button
                onClick={() => window.open("/verify", "_blank")}
                className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-[11px] flex items-center space-x-1.5 transition-colors"
              >
                <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
                <span>独立検証ポータル</span>
              </button>
            </div>

            {hasAesKey === false && (
              <span className="text-[10px] text-amber-600 font-medium">
                ※このブラウザに暗号鍵が未保存です（ZIP保存時に鍵を入力できます）
              </span>
            )}
          </div>
        </div>
      )}

      {/* Main Info Card */}
      <div className="riff-card p-8 rounded-[2.5rem] space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div>
            <div className="riff-label text-[#0284c7]">DOCUMENT DETAILS</div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 mt-1">
              {document.title || ((document.creator_webauthn_binding || {}) as Record<string, unknown>).document_title as string || "電子契約書"}
            </h1>
            <p className="font-mono text-xs text-slate-400 mt-1 break-all">
              識別ID: {document.id}
            </p>
          </div>
          <div>
            <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase ${
              document.status === "completed"
                ? "bg-emerald-100 text-emerald-800"
                : document.status === "pending"
                ? "bg-amber-100 text-amber-800"
                : "bg-slate-100 text-slate-700"
            }`}>
              {document.status}
            </span>
          </div>
        </div>

        {/* Hashes Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 space-y-1">
            <span className="text-slate-400 font-bold text-[10px] uppercase tracking-wider">原本 SHA-256</span>
            <p className="text-slate-800 break-all font-semibold">{document.original_sha256}</p>
          </div>
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 space-y-1">
            <span className="text-slate-400 font-bold text-[10px] uppercase tracking-wider">最終 Merkle Root</span>
            <p className="text-[#0284c7] break-all font-bold">{document.final_merkle_root || "締結完了後に確定"}</p>
          </div>
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 space-y-1">
            <span className="text-slate-400 font-bold text-[10px] uppercase tracking-wider">甲のML-DSA公開鍵ハッシュ</span>
            <p className="text-slate-700 break-all">{document.creator_ml_dsa_public_key_hash}</p>
          </div>
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 space-y-1">
            <span className="text-slate-400 font-bold text-[10px] uppercase tracking-wider">相手方 (乙) 署名状況</span>
            <p className="text-slate-800 font-sans font-bold">
              {signer ? `${signer.email} (${signer.status === "signed" ? "署名完了" : "未署名"})` : "署名者情報なし"}
            </p>
          </div>
        </div>

        {/* Public GitHub & OTS Anchor Proof Banner */}
        {document.status === "completed" && (
          <div className="p-4 rounded-2xl bg-amber-50/70 border border-amber-200/80 text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="space-y-0.5">
              <span className="font-bold text-amber-900 flex items-center space-x-1.5">
                <span>🌐 GitHub公開監査台帳刻印</span>
                {document.github_commit_sha ? (
                  <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[10px] font-mono font-bold">刻印完了</span>
                ) : (
                  <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-800 text-[10px] font-mono font-bold">公開アンカー準備完了</span>
                )}
              </span>
              <p className="text-amber-800 text-[11px]">
                {document.github_commit_sha
                  ? `コミット SHA: ${document.github_commit_sha.slice(0, 10)}... (Merkle Root刻印済み)`
                  : "本契約の Final Merkle Root は外部の公開台帳リポジトリで第三者照合が可能です。"}
              </p>
            </div>
            <a
              href={
                document.github_commit_sha
                  ? `https://github.com/RiffLink/riffaegis-anchors/commit/${document.github_commit_sha}`
                  : "https://github.com/RiffLink/riffaegis-anchors"
              }
              target="_blank"
              rel="noopener noreferrer"
              className="px-3.5 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs flex items-center space-x-1.5 shadow-xs transition-colors shrink-0"
            >
              <span>{document.github_commit_sha ? "コミット証跡を確認" : "公開台帳を見る"}</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        )}
      </div>

      {/* Creator Storage & Preservation Guide */}
      <div className="riff-card p-6 sm:p-7 rounded-[2rem] space-y-3 bg-gradient-to-br from-white to-slate-50 border border-slate-200/80">
        <div className="flex items-center space-x-2.5 font-bold text-slate-800 text-sm">
          <HardDrive className="w-4 h-4 text-[#0284c7]" />
          <span>甲（作成者）の契約書保管・保全ガイド（推奨）</span>
        </div>

        <div className="space-y-2.5 text-xs text-slate-600 leading-relaxed">
          <p className="text-slate-500">
            RiffAegisでは締結完了した契約書および証明書を <strong>無期限（永久保存）</strong> で安全に保持します。また、電子帳簿保存法および会社法上の契約時効に基づき、契約当事者（甲および乙）の手元でも自社ストレージに <strong>7年〜10年以上保管</strong> していただく運用を推奨しています。
          </p>

          <div className="p-4 rounded-2xl bg-white border border-slate-200/80 space-y-2">
            <span className="font-bold text-slate-800 text-xs block">📋 甲が手元に保管すべき3点:</span>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px]">
              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100 flex items-start space-x-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                <div>
                  <strong className="text-slate-800 block">① 原本契約書PDF</strong>
                  <span className="text-slate-500 text-[10px]">作成時原本（上のZIPでまとめてDL可能）</span>
                </div>
              </div>

              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100 flex items-start space-x-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                <div>
                  <strong className="text-slate-800 block">② 合意締結証明書 (PDF)</strong>
                  <span className="text-slate-500 text-[10px]">NICT時刻・GitHub等の公式監査証跡</span>
                </div>
              </div>

              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100 flex items-start space-x-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                <div>
                  <strong className="text-slate-800 block">③ .riffkey（キーストア）</strong>
                  <span className="text-slate-500 text-[10px]">作成時に保存した耐量子身元秘密鍵</span>
                </div>
              </div>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-emerald-50/80 border border-emerald-100 text-emerald-800 text-[11px] flex items-start space-x-2">
            <Sparkles className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
            <span>
              <strong>すべてまとめて保管完了:</strong> 上の <strong>『甲用・契約保全パック一括DL (ZIP)』</strong> をダウンロードすると、①原本PDF、②合意締結証明書PDF、および両者を1本に綴じた「結合版PDF」がすべて自動同梱されます。このZIPを作成時に保存した「.riffkey」と同じフォルダーに保管していただくだけで、7〜10年間の法的保全が完結します！
            </span>
          </div>

          <div className="p-3 rounded-xl bg-blue-50/80 border border-blue-100 text-blue-800 text-[11px] flex items-start space-x-2">
            <Info className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
            <span>
              <strong>おすすめの保管先:</strong> 自社のGoogle Drive、OneDrive、Dropbox、または社内ファイルサーバー等の安全なクラウドストレージに本ZIPフォルダーを格納してください。
            </span>
          </div>
        </div>
      </div>

      {/* Merkle Logs */}
      <div className="space-y-3">
        <h2 className="text-base font-bold text-slate-900 flex items-center space-x-2">
          <ShieldCheck className="w-5 h-5 text-[#70D6FF]" />
          <span>Merkle Tree 監査チェーン ({auditLogs.length}件)</span>
        </h2>

        <div className="space-y-2.5">
          {auditLogs.map((log, idx) => (
            <div key={log.id || idx} className="riff-card p-5 rounded-2xl text-xs font-mono space-y-2 border-l-4 border-l-[#70D6FF]">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-900 tracking-wide text-[#0284c7]">
                  {log.event_type}
                </span>
                <span className="text-slate-400">
                  {new Date(log.created_at).toLocaleString("ja-JP")}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-slate-500 pt-1 border-t border-slate-100">
                <div>
                  <span>PREV: </span>
                  <span className="text-slate-700">{log.previous_log_hash.slice(0, 24)}...</span>
                </div>
                <div>
                  <span>CURRENT: </span>
                  <span className="text-slate-900 font-bold">{log.current_log_hash.slice(0, 24)}...</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

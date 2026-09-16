"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  FileText,
  ShieldCheck,
  CheckCircle2,
  Clock,
  XCircle,
  FileKey,
  Plus,
  ArrowRight,
  Loader2,
  Download,
  Trash2,
} from "lucide-react";
import { DocumentRecord } from "@/lib/server/types";

export default function DocumentsDashboardPage() {
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");

  const handleDownloadCert = async (id: string) => {
    const token =
      sessionStorage.getItem(`riff_doc_token_${id}`) ||
      sessionStorage.getItem("riff_creator_identity_token");

    try {
      const res = await fetch(`/api/documents/${id}/certificate`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        const data = await res.json();
        if (data.certificate_pdf_presigned_url) {
          window.open(data.certificate_pdf_presigned_url, "_blank");
          return;
        }
      }
      const statusRes = await fetch(`/api/documents/${id}/status`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (statusRes.ok) {
        const sData = await statusRes.json();
        if (sData.certificate_url) {
          window.open(sData.certificate_url, "_blank");
          return;
        }
      }
      alert("合意締結証明書の取得に失敗しました。");
    } catch {
      alert("ダウンロードエラーが発生しました。");
    }
  };

  const handleDeleteDocument = async (id: string, title: string) => {
    const ok = window.confirm(
      `契約書「${title}」と、ストレージ上の暗号化データを完全に削除しますか？\n（この操作は元に戻せません）`
    );
    if (!ok) return;

    const token =
      sessionStorage.getItem(`riff_doc_token_${id}`) ||
      sessionStorage.getItem("riff_creator_identity_token");

    if (!token) {
      alert("作成者トークンが見つかりません。削除権限がありません。");
      return;
    }

    try {
      const res = await fetch(`/api/documents/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error?.message || "削除に失敗しました。");
      }
      setDocuments((prev) => prev.filter((d) => d.id !== id));
      sessionStorage.removeItem(`riff_doc_token_${id}`);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "削除エラーが発生しました。");
    }
  };

  const fetchDocuments = useCallback(async () => {
    setLoading(true);
    let identityToken = sessionStorage.getItem("riff_creator_identity_token");
    if (!identityToken) {
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);
        if (key && key.startsWith("riff_doc_token_")) {
          break;
        }
      }
    }

    try {
      const url = filter === "all" ? "/api/documents" : `/api/documents?status=${filter}`;
      const res = await fetch(url, {
        headers: identityToken ? { Authorization: `Bearer ${identityToken}` } : {},
      });

      if (res.ok) {
        const data = await res.json();
        setDocuments(data.documents || []);
      }
    } catch {
      // Fallback
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "completed":
        return (
          <span className="px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold flex items-center space-x-1">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            <span>締結完了</span>
          </span>
        );
      case "pending":
        return (
          <span className="px-3 py-1 rounded-full bg-amber-100 text-amber-800 text-xs font-bold flex items-center space-x-1">
            <Clock className="w-3.5 h-3.5 text-amber-600" />
            <span>署名待ち</span>
          </span>
        );
      case "consent_received":
        return (
          <span className="px-3 py-1 rounded-full bg-blue-100 text-blue-800 text-xs font-bold flex items-center space-x-1">
            <Clock className="w-3.5 h-3.5 text-blue-600" />
            <span>一部署名済（合意待ち）</span>
          </span>
        );
      case "anchored":
        return (
          <span className="px-3 py-1 rounded-full bg-sky-100 text-sky-800 text-xs font-bold flex items-center space-x-1">
            <Loader2 className="w-3.5 h-3.5 text-sky-600 animate-spin" />
            <span>刻印・証明書発行中</span>
          </span>
        );
      case "initialized":
        return (
          <span className="px-3 py-1 rounded-full bg-slate-100 text-slate-700 text-xs font-bold flex items-center space-x-1">
            <FileText className="w-3.5 h-3.5 text-slate-500" />
            <span>作成中（未共有）</span>
          </span>
        );
      case "rejected":
        return (
          <span className="px-3 py-1 rounded-full bg-rose-100 text-rose-800 text-xs font-bold flex items-center space-x-1">
            <XCircle className="w-3.5 h-3.5 text-rose-600" />
            <span>署名拒否</span>
          </span>
        );
      case "cancelled":
        return (
          <span className="px-3 py-1 rounded-full bg-slate-100 text-slate-600 text-xs font-bold flex items-center space-x-1">
            <XCircle className="w-3.5 h-3.5 text-slate-400" />
            <span>取消済み</span>
          </span>
        );
      case "expired":
        return (
          <span className="px-3 py-1 rounded-full bg-slate-100 text-slate-600 text-xs font-bold flex items-center space-x-1">
            <Clock className="w-3.5 h-3.5 text-slate-400" />
            <span>期限切れ</span>
          </span>
        );
      default:
        return (
          <span className="px-3 py-1 rounded-full bg-slate-100 text-slate-700 text-xs font-bold">
            {status}
          </span>
        );
    }
  };

  return (
    <div className="space-y-6 py-2">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 flex items-center space-x-2">
            <ShieldCheck className="w-7 h-7 text-[#0284c7]" />
            <span>契約管理ダッシュボード</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            作成・署名された契約書と監査ログの管理
          </p>
        </div>

        <div className="flex items-center space-x-2.5">
          <Link
            href="/restore"
            className="px-4 py-2.5 rounded-xl bg-white border border-slate-200 hover:border-slate-300 text-slate-700 font-bold text-xs flex items-center space-x-1.5 shadow-sm transition-colors"
          >
            <FileKey className="w-3.5 h-3.5 text-[#FF70A6]" />
            <span>.riffkey で復元</span>
          </Link>

          <Link
            href="/new"
            className="riff-btn-primary px-5 py-2.5 rounded-xl text-slate-950 font-bold text-xs flex items-center space-x-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>新規作成</span>
          </Link>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center space-x-1.5 border-b border-slate-200 pb-3 text-xs font-bold">
        {["all", "pending", "completed", "cancelled"].map((tab) => (
          <button
            key={tab}
            onClick={() => setFilter(tab)}
            className={`px-4 py-1.5 rounded-full transition-colors ${
              filter === tab
                ? "bg-[#70D6FF] text-slate-950 shadow-sm"
                : "text-slate-500 hover:text-slate-800 hover:bg-white"
            }`}
          >
            {tab === "all" ? "すべて" : tab === "pending" ? "署名待ち" : tab === "completed" ? "締結完了" : "取消済み"}
          </button>
        ))}
      </div>

      {/* Documents List */}
      {loading ? (
        <div className="p-16 text-center space-y-3 riff-card">
          <Loader2 className="w-8 h-8 animate-spin text-[#70D6FF] mx-auto" />
          <p className="text-xs text-slate-400 font-mono">ドキュメントを読み込み中...</p>
        </div>
      ) : documents.length === 0 ? (
        <div className="p-16 text-center space-y-4 riff-card">
          <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
            <FileText className="w-6 h-6 text-slate-400" />
          </div>
          <div>
            <p className="text-base font-bold text-slate-800">契約書が見つかりません</p>
            <p className="text-xs text-slate-500 mt-1">
              新規作成するか、保存済みの .riffkey を読み込んで過去の契約書を表示してください。
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-3 pt-2">
            <Link
              href="/restore"
              className="px-5 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-bold text-slate-700 flex items-center space-x-1.5 shadow-xs"
            >
              <FileKey className="w-4 h-4 text-[#FF70A6]" />
              <span>.riffkey で復元</span>
            </Link>
            <Link
              href="/new"
              className="riff-btn-primary px-5 py-2.5 rounded-xl text-xs font-bold flex items-center space-x-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>新規契約書を作成</span>
            </Link>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {documents.map((doc) => {
            const meta = (doc.creator_webauthn_binding || {}) as Record<string, unknown>;
            const title =
              doc.title ||
              (meta.document_title as string) ||
              (meta.original_filename as string) ||
              (doc.id === "9470715e-b449-4630-8c6a-aff0054cbbd1" ? "プロジェクト参加合意書" : "電子契約書");

            return (
              <div
                key={doc.id}
                className="riff-card riff-card-hover p-5 sm:p-6 rounded-[2rem] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 transition-all duration-200"
              >
                <div className="space-y-2 flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <span className="w-8 h-8 rounded-xl bg-blue-50 text-[#0284c7] flex items-center justify-center shrink-0">
                      <FileText className="w-4 h-4 text-[#0284c7]" />
                    </span>
                    <h2 className="text-base font-bold text-slate-900 truncate">
                      {title}
                    </h2>
                    {getStatusBadge(doc.status)}
                  </div>

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-500 pl-0.5">
                    <span className="font-mono text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md text-[11px]">
                      ID: {doc.id.slice(0, 8)}...{doc.id.slice(-4)}
                    </span>
                    {doc.signer_email && (
                      <span className="text-slate-600">
                        相手方: <strong className="text-slate-800 font-medium">{doc.signer_email}</strong>
                      </span>
                    )}
                    <span className="text-slate-400">
                      サイズ: {(doc.file_size_bytes / (1024 * 1024)).toFixed(2)} MB
                    </span>
                    <span className="text-slate-400">
                      作成日: {new Date(doc.created_at).toLocaleDateString("ja-JP")}
                    </span>
                    <span className="font-mono text-slate-400 text-[11px] hidden md:inline">
                      SHA: {doc.original_sha256.slice(0, 12)}...
                    </span>
                  </div>
                </div>

                <div className="flex items-center space-x-2 shrink-0 self-end sm:self-center">
                  {doc.status === "completed" && (
                    <button
                      onClick={() => handleDownloadCert(doc.id)}
                      className="riff-btn-primary px-3.5 py-2.5 rounded-xl text-slate-950 font-bold text-xs flex items-center space-x-1.5 shadow-sm"
                    >
                      <Download className="w-3.5 h-3.5 text-slate-950" />
                      <span>証明書PDF</span>
                    </button>
                  )}

                  <Link
                    href={`/documents/${doc.id}`}
                    className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold transition-colors flex items-center space-x-1"
                  >
                    <span>詳細・監査ログ</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>

                  <button
                    onClick={() => handleDeleteDocument(doc.id, title)}
                    className="p-2.5 rounded-xl border border-slate-200 hover:border-rose-300 hover:bg-rose-50 text-slate-400 hover:text-rose-600 transition-colors"
                    title="契約書とデータを完全に削除"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

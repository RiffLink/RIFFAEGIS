"use client";

import { useState, useEffect, useCallback, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  ShieldCheck,
  Copy,
  Check,
  Key,
  ExternalLink,
  ArrowRight,
  AlertTriangle,
  Loader2,
  CheckCircle,
  Mail,
  Send,
} from "lucide-react";

function ShareContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const documentId = searchParams.get("id");

  const [signingUrl, setSigningUrl] = useState<string>("");
  const [aesKey, setAesKey] = useState<string>("");
  const [totalSigners, setTotalSigners] = useState<number>(1);
  const [isActivating, setIsActivating] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedFull, setCopiedFull] = useState(false);
  const [copiedKey, setCopiedKey] = useState(false);
  const [signerEmail, setSignerEmail] = useState<string>("");
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [emailSentSuccess, setEmailSentSuccess] = useState(false);
  const [emailSendError, setEmailSendError] = useState<string | null>(null);
  const isActivatingRef = useRef(false);

  const activateDocument = useCallback(async () => {
    if (isActivatingRef.current) return;
    isActivatingRef.current = true;

    const token = sessionStorage.getItem(`riff_doc_token_${documentId}`);
    const tempAesKey = sessionStorage.getItem("riffaegis_temp_aes_key");
    const signerEmail = sessionStorage.getItem("riffaegis_temp_signer_email");

    if (!token || !tempAesKey) {
      setError("セッション情報が失われました。初めからやり直してください。");
      setIsActivating(false);
      isActivatingRef.current = false;
      return;
    }

    setAesKey(tempAesKey);

    const cachedSigningUrl = sessionStorage.getItem(`riff_signing_url_${documentId}`);
    if (cachedSigningUrl) {
      setSigningUrl(cachedSigningUrl);
      if (signerEmail) {
        setSignerEmail(signerEmail);
      }
      setIsActivating(false);
      return;
    }

    const tempSignersRaw = sessionStorage.getItem("riffaegis_temp_signers");
    let signersPayload = undefined;
    if (tempSignersRaw) {
      try {
        const parsed = JSON.parse(tempSignersRaw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          signersPayload = parsed.filter((s: { email?: string }) => s.email && s.email.trim() !== "");
        }
      } catch {
        // Fallback
      }
    }

    try {
      const res = await fetch(`/api/documents/${documentId}/activate`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          keystore_backup_confirmed: true,
          signer_email: signerEmail || "signer@partner.org",
          signers: signersPayload,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.error?.message || "アクティベーションに失敗しました。");
      }

      const data = await res.json();
      const origin = window.location.origin;
      const fullUrl = `${origin}/sign/${data.signing_token}#${tempAesKey}`;
      sessionStorage.setItem(`riff_signing_url_${documentId}`, fullUrl);
      setSigningUrl(fullUrl);
      if (signerEmail) {
        setSignerEmail(signerEmail);
      }
      if (data.total_signers) {
        setTotalSigners(data.total_signers);
      }
      setIsActivating(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "アクティベーションエラー");
      setIsActivating(false);
    }
  }, [documentId]);

  useEffect(() => {
    if (!documentId) {
      router.push("/new");
      return;
    }
    activateDocument();
  }, [documentId, router, activateDocument]);

  const copyToClipboard = async (text: string, isKeyOnly = false) => {
    try {
      await navigator.clipboard.writeText(text);
      if (isKeyOnly) {
        setCopiedKey(true);
        setTimeout(() => setCopiedKey(false), 2000);
      } else {
        setCopiedFull(true);
        setTimeout(() => setCopiedFull(false), 2000);
      }
    } catch {
      // Fallback
    }
  };

  const handleSendInviteEmail = async () => {
    if (!documentId || !signingUrl) return;
    const token = sessionStorage.getItem(`riff_doc_token_${documentId}`);
    if (!token) return;

    let targetEmail = signerEmail;
    if (!targetEmail) {
      targetEmail = sessionStorage.getItem("riffaegis_temp_signer_email") || "";
    }
    if (!targetEmail) {
      try {
        const raw = sessionStorage.getItem("riffaegis_temp_signers");
        if (raw) {
          const arr = JSON.parse(raw);
          if (arr[0]?.email) targetEmail = arr[0].email;
        }
      } catch {
        // Fallback
      }
    }

    if (!targetEmail) {
      setEmailSendError("送信先のメールアドレスが見つかりません。");
      return;
    }

    let creatorName = "契約書作成者";
    try {
      const raw = sessionStorage.getItem("riffaegis_temp_creator_profile");
      if (raw) {
        const p = JSON.parse(raw);
        if (p.creatorName) creatorName = p.creatorName;
      }
    } catch {
      // Fallback
    }

    setIsSendingEmail(true);
    setEmailSendError(null);

    try {
      const res = await fetch(`/api/documents/${documentId}/send-invite`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          signing_url: signingUrl,
          to_email: targetEmail,
          creator_name: creatorName,
          document_title: "電子契約書",
        }),
      });

      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.error?.message || "メール送信に失敗しました。");
      }

      setEmailSentSuccess(true);
    } catch (err: unknown) {
      setEmailSendError(err instanceof Error ? err.message : "メール送信エラー");
    } finally {
      setIsSendingEmail(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6 py-2">
      {/* Step Indicator */}
      <div className="flex items-center justify-between px-2 text-xs font-bold text-slate-400">
        <span className="text-emerald-600 flex items-center space-x-1 font-bold">
          <CheckCircle className="w-4 h-4 text-emerald-500" />
          <span>1. 原本暗号化</span>
        </span>
        <span className="text-slate-300">➔</span>
        <span className="text-emerald-600 flex items-center space-x-1 font-bold">
          <CheckCircle className="w-4 h-4 text-emerald-500" />
          <span>2. 本人確認</span>
        </span>
        <span className="text-slate-300">➔</span>
        <span className="text-[#0284c7] flex items-center space-x-1.5 font-bold">
          <span className="w-5 h-5 rounded-full bg-[#70D6FF] text-slate-950 flex items-center justify-center text-[11px] font-black">3</span>
          <span>URL共有</span>
        </span>
      </div>

      <div className="riff-card p-6 sm:p-8 rounded-2xl space-y-6">
        <div>
          <div className="inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-md bg-[#70D6FF]/20 text-[#0284c7] text-xs font-bold tracking-wider">
            STEP 3
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 mt-2 flex items-center space-x-2">
            <ShieldCheck className="w-7 h-7 text-[#0284c7]" />
            <span>署名URLを発行しました</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            {totalSigners > 1
              ? `全 ${totalSigners} 名の署名者へ順次引き継がれる第1署名者（乙）用のURLです。復号鍵はハッシュフラグメントに秘匿されています。`
              : "復号鍵はURLのハッシュフラグメント (#以降) に格納されており、サーバーには届きません。相手方へ安全に送付してください。"}
          </p>
        </div>

        {isActivating ? (
          <div className="p-12 text-center space-y-3 bg-slate-50 rounded-2xl">
            <Loader2 className="w-8 h-8 animate-spin text-[#0284c7] mx-auto" />
            <p className="text-xs text-slate-500 font-mono">署名URLを準備中...</p>
          </div>
        ) : error ? (
          <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-start space-x-2.5">
            <AlertTriangle className="w-4 h-4 text-rose-500 flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        ) : (
          <div className="space-y-5">
            {/* Direct Email Send Card */}
            <div className="p-5 rounded-2xl bg-gradient-to-br from-[#70D6FF]/15 via-white to-[#FF70A6]/10 border border-[#70D6FF]/40 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Mail className="w-4 h-4 text-[#0284c7]" />
                  <span className="text-xs font-bold text-slate-900">相手へ署名依頼メールを送信（おすすめ）</span>
                </div>
                <span className="text-[10px] text-emerald-700 bg-emerald-100 font-bold px-2 py-0.5 rounded-full">Resend公式配信</span>
              </div>

              <p className="text-[11px] text-slate-600 leading-relaxed">
                RiffAegis公式アドレス（<code className="text-[#0284c7] font-mono">security@riffaegis.rifflink.com</code>）から、相手のメールアドレスへ専用リンク付きの署名依頼メールをワンクリックで送信します。
              </p>

              {emailSendError && (
                <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs">
                  {emailSendError}
                </div>
              )}

              {emailSentSuccess ? (
                <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold flex items-center space-x-2">
                  <CheckCircle className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                  <span>署名依頼メールを送信しました！（{signerEmail || "相手方"} 宛て）</span>
                </div>
              ) : (
                <button
                  onClick={handleSendInviteEmail}
                  disabled={isSendingEmail}
                  className="w-full riff-btn-primary py-3.5 rounded-xl font-bold text-xs flex items-center justify-center space-x-2 text-slate-950"
                >
                  {isSendingEmail ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-slate-950" />
                      <span>署名依頼メールを送信中...</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      <span>相手に署名依頼メールを今すぐ送信（{signerEmail || "相手方"}）</span>
                    </>
                  )}
                </button>
              )}
            </div>

            {/* Signing URL Container */}
            <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
              <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                <span>暗号化 署名用URL（手動送信用）</span>
                <span className="text-[11px] text-slate-400 font-mono">有効期限: 7日間</span>
              </div>

              <div className="p-3.5 rounded-xl bg-white border border-slate-200 font-mono text-xs text-slate-800 break-all select-all shadow-inner">
                {signingUrl}
              </div>

              <div className="flex flex-col sm:flex-row gap-3 pt-1">
                <button
                  onClick={() => copyToClipboard(signingUrl, false)}
                  className="flex-1 riff-btn-primary py-3.5 rounded-xl font-bold text-xs flex items-center justify-center space-x-2"
                >
                  {copiedFull ? (
                    <>
                      <Check className="w-4 h-4" />
                      <span>URLを一括コピーしました</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      <span>完全URLを一括コピー</span>
                    </>
                  )}
                </button>

                <button
                  onClick={() => copyToClipboard(aesKey, true)}
                  className="px-5 py-3.5 rounded-xl bg-white border border-slate-200 hover:border-slate-300 text-slate-700 font-mono text-xs font-bold transition-colors flex items-center justify-center space-x-1.5 shadow-sm"
                >
                  <Key className="w-3.5 h-3.5 text-[#FF70A6]" />
                  <span>{copiedKey ? "鍵をコピー済" : "暗号鍵のみコピー"}</span>
                </button>
              </div>
            </div>

            {/* Guidance */}
            <div className="p-4 rounded-2xl bg-[#70D6FF]/10 border border-[#70D6FF]/30 text-xs text-slate-700 space-y-1">
              <p className="font-bold text-slate-900">🔒 機密契約における推奨事項</p>
              <p className="text-slate-600 text-[11px] leading-relaxed">
                高機密な契約書の場合、SignalやSlackダイレクトメッセージ等の暗号化メッセンジャーでURLを相手方へ直接お渡しすることを推奨します。
              </p>
            </div>

            {/* Actions */}
            <div className="flex flex-col sm:flex-row items-center justify-end gap-3 pt-4 border-t border-slate-100">
              <Link
                href="/documents"
                className="w-full sm:w-auto px-6 py-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs transition-colors flex items-center justify-center space-x-1.5"
              >
                <span>管理ダッシュボードを見る</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ShareDocumentPage() {
  return (
    <Suspense fallback={<div className="p-16 text-center font-mono text-xs text-slate-400">読み込み中...</div>}>
      <ShareContent />
    </Suspense>
  );
}

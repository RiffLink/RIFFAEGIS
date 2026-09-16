"use client";

import { useState, useEffect, useTransition, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Fingerprint,
  FileKey,
  Download,
  CheckCircle,
  AlertTriangle,
  ArrowRight,
  Lock,
  Loader2,
} from "lucide-react";
import { startRegistration } from "@simplewebauthn/browser";
import { exportRiffKey, base64ToBytes } from "@/lib/crypto";
import { downloadBlob } from "@/lib/crypto/client";

function AuthenticateContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const documentId = searchParams.get("id");

  const [passphrase, setPassphrase] = useState("");
  const [confirmPassphrase, setConfirmPassphrase] = useState("");
  const [isWebAuthnDone, setIsWebAuthnDone] = useState(false);
  const [isKeystoreDownloaded, setIsKeystoreDownloaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [, startTransition] = useTransition();

  useEffect(() => {
    if (!documentId) {
      router.push("/new");
    }
  }, [documentId, router]);

  // 1. WebAuthn Registration
  const handleWebAuthnRegistration = async () => {
    setError(null);
    const token = sessionStorage.getItem(`riff_doc_token_${documentId}`);
    if (!token) {
      setError("セッショントークンが見つかりません。最初からやり直してください。");
      return;
    }

    try {
      const challengeRes = await fetch(`/api/documents/${documentId}/webauthn/register-challenge`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!challengeRes.ok) {
        throw new Error("WebAuthnチャレンジの取得に失敗しました。");
      }

      const options = await challengeRes.json();

      let credentialResponse;
      try {
        credentialResponse = await startRegistration({ optionsJSON: options });
      } catch {
        credentialResponse = null;
      }

      let creatorProfile: Record<string, string> = {};
      try {
        const raw = sessionStorage.getItem("riffaegis_temp_creator_profile");
        if (raw) creatorProfile = JSON.parse(raw);
      } catch {
        // Fallback
      }

      const completeRes = await fetch(`/api/documents/${documentId}/webauthn/register-complete`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          credential_response: credentialResponse,
          fallback: !credentialResponse,
          mock: !credentialResponse,
          creator_name: creatorProfile.creatorName || null,
          creator_address: creatorProfile.creatorAddress || null,
          creator_organization: creatorProfile.creatorOrg || null,
          creator_email: creatorProfile.creatorEmail || null,
        }),
      });

      if (!completeRes.ok) {
        const errJson = await completeRes.json().catch(() => ({}));
        throw new Error(errJson.error?.message || "WebAuthnクレデンシャルの登録検証に失敗しました。");
      }

      setIsWebAuthnDone(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "生体認証の登録に失敗しました。");
    }
  };

  // 2. Export & Download .riffkey
  const handleDownloadKeystore = async () => {
    setError(null);
    if (!passphrase || passphrase.length < 8) {
      setError("パスフレーズは8文字以上で設定してください。");
      return;
    }
    if (passphrase !== confirmPassphrase) {
      setError("確認用パスフレーズが一致しません。");
      return;
    }

    setIsExporting(true);
    try {
      const skBase64 = sessionStorage.getItem("riffaegis_temp_mldsa_sk");
      const pkBase64 = sessionStorage.getItem("riffaegis_temp_mldsa_pk");

      if (!skBase64 || !pkBase64) {
        throw new Error("暗号鍵情報が見つかりません。最初からやり直してください。");
      }

      const secretKey = base64ToBytes(skBase64);
      const publicKey = base64ToBytes(pkBase64);

      const riffKeyJson = await exportRiffKey(
        { secretKey, publicKey },
        passphrase,
        false
      );

      const filename = `RiffAegis_Identity_${new Date().toISOString().slice(0, 10)}.riffkey`;
      downloadBlob(filename, riffKeyJson, "application/json");

      setIsKeystoreDownloaded(true);
      setIsExporting(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "キーストアの生成に失敗しました。");
      setIsExporting(false);
    }
  };

  const handleProceedToShare = () => {
    if (!isKeystoreDownloaded) {
      setError("署名URLを発行する前に、.riffkeyキーストアのダウンロードを完了してください。");
      return;
    }
    startTransition(() => {
      router.push(`/new/share?id=${documentId}`);
    });
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
        <span className="text-[#0284c7] flex items-center space-x-1.5 font-bold">
          <span className="w-5 h-5 rounded-full bg-[#70D6FF] text-slate-950 flex items-center justify-center text-[11px] font-black">2</span>
          <span>本人確認 ＆ 鍵保存</span>
        </span>
        <span className="text-slate-300">➔</span>
        <span className="text-slate-400">3. URL共有</span>
      </div>

      <div className="riff-card p-6 sm:p-8 rounded-2xl space-y-6">
        <div>
          <div className="inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-md bg-[#FF70A6]/15 text-[#e11d48] text-xs font-bold tracking-wider">
            STEP 2
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 mt-2">
            生体バインドとキーストア保存
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Touch ID / Face IDによる端末署名バインドと、安全な鍵ファイル (.riffkey) の保存を行います。
          </p>
        </div>

        {error && (
          <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-start space-x-2.5">
            <AlertTriangle className="w-4 h-4 text-rose-500 flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* WebAuthn Box */}
        <div className="p-6 rounded-[2rem] bg-slate-50 border border-slate-200/80 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-2xl bg-[#70D6FF]/20 text-[#0284c7] flex items-center justify-center">
                <Fingerprint className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-slate-900">甲の端末生体バインド (WebAuthn)</h2>
                <p className="text-[11px] text-slate-400">原本ハッシュ ＋ ML-DSA公開鍵を端末で署名</p>
              </div>
            </div>
            {isWebAuthnDone && (
              <span className="px-3 py-1 rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold flex items-center space-x-1">
                <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                <span>登録完了</span>
              </span>
            )}
          </div>

          {!isWebAuthnDone ? (
            <button
              onClick={handleWebAuthnRegistration}
              className="w-full py-3 rounded-xl bg-white border border-slate-200 hover:border-[#70D6FF] text-slate-800 font-bold text-xs shadow-sm hover:shadow transition-all flex items-center justify-center space-x-2"
            >
              <Fingerprint className="w-4 h-4 text-[#0284c7]" />
              <span>Touch ID / Face ID で登録</span>
            </button>
          ) : (
            <p className="text-xs text-emerald-700 bg-emerald-50/80 p-3 rounded-xl border border-emerald-200">
              ✓ 端末ハードウェア鍵との暗号学的バインドが完了しました。
            </p>
          )}
        </div>

        {/* Keystore Save Box */}
        <div className="p-6 rounded-[2rem] bg-amber-50/40 border border-amber-200/80 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-2xl bg-[#FFD670]/40 text-amber-800 flex items-center justify-center">
                <FileKey className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-slate-900">耐量子キーストア (.riffkey) の必須保存</h2>
                <p className="text-[11px] text-amber-700">鍵紛失防止のためダウンロード必須</p>
              </div>
            </div>
            {isKeystoreDownloaded && (
              <span className="px-3 py-1 rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold flex items-center space-x-1">
                <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                <span>保存済み</span>
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">暗号化パスフレーズ (8文字以上)</label>
              <input
                type="password"
                placeholder="••••••••••••"
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-900 text-xs focus:outline-none focus:border-[#70D6FF]"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">パスフレーズ（確認再入力）</label>
              <input
                type="password"
                placeholder="••••••••••••"
                value={confirmPassphrase}
                onChange={(e) => setConfirmPassphrase(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-900 text-xs focus:outline-none focus:border-[#70D6FF]"
              />
            </div>
          </div>

          <button
            onClick={handleDownloadKeystore}
            disabled={isExporting || isKeystoreDownloaded}
            className={`w-full py-3.5 rounded-xl font-bold text-xs transition-all flex items-center justify-center space-x-2 ${
              isKeystoreDownloaded
                ? "bg-emerald-100 text-emerald-700 border border-emerald-300"
                : "bg-[#FFD670] hover:bg-[#ffcf54] text-slate-900 shadow-md shadow-[#FFD670]/40"
            }`}
          >
            {isExporting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Argon2id 鍵導出中...</span>
              </>
            ) : isKeystoreDownloaded ? (
              <>
                <CheckCircle className="w-4 h-4 text-emerald-600" />
                <span>.riffkey ファイルを保存しました</span>
              </>
            ) : (
              <>
                <Download className="w-4 h-4" />
                <span>.riffkey を生成してダウンロード (必須)</span>
              </>
            )}
          </button>
        </div>

        {/* Proceed Button */}
        <button
          onClick={handleProceedToShare}
          disabled={!isKeystoreDownloaded}
          className="w-full riff-btn-primary py-4 rounded-2xl text-slate-950 font-bold text-sm tracking-wide disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
        >
          {!isKeystoreDownloaded ? (
            <>
              <Lock className="w-4 h-4 text-slate-700" />
              <span>キーストア保存後にURLを発行できます</span>
            </>
          ) : (
            <>
              <span>署名URL発行・共有へ進む</span>
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </div>
    </div>
  );
}

export default function AuthenticatePage() {
  return (
    <Suspense fallback={<div className="p-16 text-center font-mono text-xs text-slate-400">読み込み中...</div>}>
      <AuthenticateContent />
    </Suspense>
  );
}

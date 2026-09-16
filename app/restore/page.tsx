"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  FileKey,
  Unlock,
  AlertTriangle,
  ArrowLeft,
  Loader2,
  Fingerprint,
  CheckCircle2,
  ArrowRight,
} from "lucide-react";
import { importRiffKey, bytesToBase64, signOriginalHash } from "@/lib/crypto";
import { storeIdentityInIndexedDB } from "@/lib/crypto/client";
import { startRegistration } from "@simplewebauthn/browser";

export default function RestoreKeyPage() {
  const router = useRouter();

  const [riffKeyContent, setRiffKeyContent] = useState<string>("");
  const [fileName, setFileName] = useState<string>("");
  const [passphrase, setPassphrase] = useState<string>("");
  const [isRestoring, setIsRestoring] = useState(false);
  const [restoreSuccess, setRestoreSuccess] = useState(false);
  const [isRebinding, setIsRebinding] = useState(false);
  const [rebindSuccess, setRebindSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setFileName(file.name);
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          setRiffKeyContent(event.target.result.toString());
        }
      };
      reader.readAsText(file);
    }
  };

  const handleRestore = async () => {
    if (!riffKeyContent) {
      setError(".riffkey ファイルを選択してください。");
      return;
    }
    if (!passphrase) {
      setError("暗号化パスフレーズを入力してください。");
      return;
    }

    setError(null);
    setIsRestoring(true);

    try {
      // 1. Decrypt keypair from .riffkey
      const keyPair = await importRiffKey(riffKeyContent, passphrase);
      await storeIdentityInIndexedDB(keyPair);

      // 2. Request challenge from server
      const challengeRes = await fetch("/api/identity/restore");
      if (!challengeRes.ok) {
        throw new Error("認証チャレンジの取得に失敗しました。");
      }
      const challengeData = await challengeRes.json();

      // 3. Cryptographically sign the server challenge using the restored private key
      const signatureBytes = signOriginalHash(keyPair.secretKey, challengeData.challenge_message);
      const signatureBase64 = bytesToBase64(signatureBytes);

      // 4. Submit public key and signature for verified token issuance
      const res = await fetch("/api/identity/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          creator_ml_dsa_public_key: bytesToBase64(keyPair.publicKey),
          challenge_signature: signatureBase64,
          challenge_message: challengeData.challenge_message,
          challenge_token: challengeData.challenge_token,
          timestamp: challengeData.timestamp,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error?.message || "サーバー認証トークンの発行に失敗しました。");
      }

      const data = await res.json();
      sessionStorage.setItem("riff_creator_identity_token", data.creator_identity_token);
      setRestoreSuccess(true);
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : "キーストアの復号に失敗しました。パスフレーズが異なるか、ファイルが破損しています。"
      );
    } finally {
      setIsRestoring(false);
    }
  };

  const handleRebindWebAuthn = async () => {
    setIsRebinding(true);
    setError(null);
    const token = sessionStorage.getItem("riff_creator_identity_token");
    if (!token) {
      setError("認証トークンが見つかりません。");
      setIsRebinding(false);
      return;
    }

    try {
      const challengeRes = await fetch("/api/identity/rebind-webauthn", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!challengeRes.ok) throw new Error("WebAuthn登録オプションの取得に失敗しました。");
      const { options } = await challengeRes.json();

      let credentialResponse;
      try {
        credentialResponse = await startRegistration({ optionsJSON: options });
      } catch {
        throw new Error("生体認証の登録がキャンセルされたか、未対応のブラウザです。");
      }

      const completeRes = await fetch("/api/identity/rebind-webauthn", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ credential_response: credentialResponse }),
      });

      if (!completeRes.ok) throw new Error("生体認証の紐付け登録に失敗しました。");

      setRebindSuccess(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "再登録エラー");
    } finally {
      setIsRebinding(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto space-y-6 py-2">
      <Link href="/documents" className="text-xs font-bold text-slate-500 hover:text-slate-800 flex items-center space-x-1 transition-colors">
        <ArrowLeft className="w-4 h-4" />
        <span>ダッシュボードへ戻る</span>
      </Link>

      <div className="riff-card p-6 sm:p-8 rounded-2xl space-y-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 flex items-center space-x-2">
            <FileKey className="w-7 h-7 text-[#FF70A6]" />
            <span>.riffkey からの復元</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            保存した `.riffkey` ファイルとパスフレーズを入力し、耐量子署名鍵と管理権限を復元します。
          </p>
        </div>

        {error && (
          <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-start space-x-2.5">
            <AlertTriangle className="w-4 h-4 text-rose-500 flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {restoreSuccess ? (
          <div className="p-6 rounded-2xl bg-emerald-50 border border-emerald-200 space-y-4">
            <div className="flex items-center space-x-2.5 text-emerald-800 font-bold">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              <span>作成者IDの復元に成功しました！</span>
            </div>
            <p className="text-xs text-emerald-700 leading-relaxed">
              端末移行時（新しいPC・スマートフォン）の場合は、新端末の Touch ID / Face ID 認証器をIDに再登録（再バインド）することをお勧めします。
            </p>

            <div className="pt-2 flex flex-col gap-2.5">
              {!rebindSuccess ? (
                <button
                  onClick={handleRebindWebAuthn}
                  disabled={isRebinding}
                  className="w-full px-4 py-3 rounded-xl bg-white border border-emerald-300 hover:bg-emerald-100/50 text-emerald-800 font-bold text-xs flex items-center justify-center space-x-2 transition-colors shadow-xs"
                >
                  <Fingerprint className="w-4 h-4 text-emerald-600" />
                  <span>{isRebinding ? "認証器を起動中..." : "新端末の生体認証（Touch ID/Face ID）を再登録"}</span>
                </button>
              ) : (
                <div className="p-3 rounded-xl bg-white border border-emerald-200 text-emerald-800 text-xs font-bold flex items-center space-x-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>新端末の生体認証が正常に再バインドされました</span>
                </div>
              )}

              <button
                onClick={() => router.push("/documents")}
                className="w-full riff-btn-primary py-3.5 rounded-xl text-slate-950 font-bold text-xs flex items-center justify-center space-x-2"
              >
                <span>ダッシュボードへ移動</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                1. .riffkey ファイルの選択
              </label>
              <input
                type="file"
                accept=".riffkey,.json"
                onChange={handleFileUpload}
                className="w-full text-xs text-slate-500 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:bg-slate-100 file:text-slate-800 hover:file:bg-slate-200 cursor-pointer"
              />
              {fileName && (
                <p className="text-xs font-mono text-emerald-600 mt-1 font-bold">選択中: {fileName}</p>
              )}
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                2. パスフレーズ
              </label>
              <input
                type="password"
                placeholder="••••••••••••"
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 text-xs focus:outline-none focus:border-[#70D6FF]"
              />
            </div>

            <button
              onClick={handleRestore}
              disabled={!riffKeyContent || !passphrase || isRestoring}
              className="w-full riff-btn-primary py-4 rounded-2xl text-slate-950 font-bold text-sm tracking-wide disabled:opacity-40 flex items-center justify-center space-x-2"
            >
              {isRestoring ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-slate-950" />
                  <span>Argon2id 復号を実行中...</span>
                </>
              ) : (
                <>
                  <Unlock className="w-4 h-4 text-slate-950" />
                  <span>キーストアを復号して復元</span>
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

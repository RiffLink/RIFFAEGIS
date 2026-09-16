"use client";

import { useState, useEffect, use, useCallback, useRef } from "react";
import {
  ShieldCheck,
  Mail,
  Fingerprint,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Download,
  Key,
  Loader2,
  ExternalLink,
  User,
  Sparkles,
  HardDrive,
  Info,
  HelpCircle,
} from "lucide-react";
import { createClient } from "@supabase/supabase-js";
import {
  importAesKeyFromBase64Url,
  decryptPdfAndVerify,
  sha256Hex,
} from "@/lib/crypto";
import { startRegistration } from "@simplewebauthn/browser";
import {
  createDetachedZipBundle,
  downloadBlob,
  mergeOriginalAndCertificatePdf,
  storeDocumentAesKey,
  getDocumentAesKey,
} from "@/lib/crypto/client";

export default function SignerFlowPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);

  const [step, setStep] = useState<number>(1);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Step 1: Info & OTP state
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [docInfo, setDocInfo] = useState<any>(null);
  const [email, setEmail] = useState<string>("");
  const [otpCode, setOtpCode] = useState<string>("");
  const [otpSent, setOtpSent] = useState<boolean>(false);
  const [isVerifyingOtp, setIsVerifyingOtp] = useState<boolean>(false);

  // Step 2: Decryption & Document state
  const [aesKeyStr, setAesKeyStr] = useState<string>("");
  const [manualKeyInput, setManualKeyInput] = useState<string>("");
  const [downloadUrl, setDownloadUrl] = useState<string>("");
  const [decryptedPdfBytes, setDecryptedPdfBytes] = useState<Uint8Array | null>(null);
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);
  const [isDecrypting, setIsDecrypting] = useState<boolean>(false);
  const [signerJwt, setSignerJwt] = useState<string>("");

  // Step 3: Consent / Reject state
  const [signerName, setSignerName] = useState<string>("");
  const [signerAddress, setSignerAddress] = useState<string>("");
  const [signerCompany, setSignerCompany] = useState<string>("");
  const [signerTitle, setSignerTitle] = useState<string>("");
  const [authLevel, setAuthLevel] = useState<"high_webauthn" | "medium_security_key" | "low_fallback">("high_webauthn");
  const [isSigning, setIsSigning] = useState<boolean>(false);
  const [rejectReason, setRejectReason] = useState<string>("");
  const [showRejectModal, setShowRejectModal] = useState<boolean>(false);

  // Step 4: Completion state
  const [isFinalizing, setIsFinalizing] = useState<boolean>(true);
  const [isZipping, setIsZipping] = useState<boolean>(false);
  const [zipDownloaded, setZipDownloaded] = useState<boolean>(false);
  const [isMerging, setIsMerging] = useState<boolean>(false);
  const [mergedDownloaded, setMergedDownloaded] = useState<boolean>(false);

  // Clean up Object URL on unmount
  useEffect(() => {
    return () => {
      if (pdfBlobUrl) URL.revokeObjectURL(pdfBlobUrl);
    };
  }, [pdfBlobUrl]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const hash = window.location.hash.replace(/^#/, "").trim();
      if (hash) {
        setAesKeyStr(hash);
      }
    }
  }, []);

  const downloadCertificatePdf = useCallback(
    async (certUrlOverride?: string, docIdOverride?: string) => {
      const url = certUrlOverride || docInfo?.certificate_url;
      if (url) {
        window.open(url, "_blank");
        return;
      }
      const targetDocId = docIdOverride || docInfo?.document_id;
      if (!targetDocId) return;
      try {
        const targetAuth = signerJwt || token;
        const res = await fetch(`/api/documents/${targetDocId}/status`, {
          headers: targetAuth ? { Authorization: `Bearer ${targetAuth}` } : {},
        });
        if (res.ok) {
          const data = await res.json();
          if (data.certificate_url) {
            setDocInfo((prev: any) => ({ ...prev, certificate_url: data.certificate_url, certificate_ready: true }));
            window.open(data.certificate_url, "_blank");
          }
        }
      } catch (e) {
        console.error(e);
      }
    },
    [docInfo?.certificate_url, docInfo?.document_id, signerJwt, token]
  );

  const getOrDecryptOriginalPdf = useCallback(async (): Promise<Uint8Array | null> => {
    if (decryptedPdfBytes) return decryptedPdfBytes;
    let keyToUse = aesKeyStr || (typeof window !== "undefined" ? window.location.hash.replace(/^#/, "").trim() : "");
    if (!keyToUse && docInfo?.document_id) {
      keyToUse = (await getDocumentAesKey(docInfo.document_id)) || "";
    }
    const encUrl = docInfo?.encrypted_original_url;
    if (keyToUse && encUrl) {
      try {
        const encRes = await fetch(encUrl);
        if (encRes.ok) {
          const encBytes = new Uint8Array(await encRes.arrayBuffer());
          const cryptoKey = await importAesKeyFromBase64Url(keyToUse);
          const plainBytes = await decryptPdfAndVerify(encBytes, cryptoKey, docInfo.original_sha256);
          setDecryptedPdfBytes(plainBytes);
          return plainBytes;
        }
      } catch (e) {
        console.warn("On-demand original PDF decryption failed:", e);
      }
    }
    return null;
  }, [decryptedPdfBytes, aesKeyStr, docInfo]);

  const downloadOriginalPdf = useCallback(async () => {
    setIsZipping(true);
    try {
      const plainBytes = await getOrDecryptOriginalPdf();
      if (plainBytes) {
        const blob = new Blob([plainBytes as unknown as BufferSource], { type: "application/pdf" });
        downloadBlob(`${docInfo?.document_title || "原本契約書"}.pdf`, blob, "application/pdf");
      } else {
        alert("原本の復号鍵が見つかりません。URLのハッシュ(#以降)が失われていないかご確認ください。");
      }
    } catch (e) {
      console.error(e);
      alert("原本PDFのダウンロードに失敗しました。");
    } finally {
      setIsZipping(false);
    }
  }, [getOrDecryptOriginalPdf, docInfo]);

  const downloadZipPackage = useCallback(
    async (certUrlOverride?: string, docIdOverride?: string) => {
      const targetDocId = docIdOverride || docInfo?.document_id;
      if (!targetDocId) return;

      setIsZipping(true);
      try {
        const plainBytes = await getOrDecryptOriginalPdf();

        if (!plainBytes) {
          downloadCertificatePdf(certUrlOverride, targetDocId);
          return;
        }

        let certUrl = certUrlOverride || docInfo?.certificate_url;
        if (!certUrl) {
          const targetAuth = signerJwt || token;
          const res = await fetch(`/api/documents/${targetDocId}/status`, {
            headers: targetAuth ? { Authorization: `Bearer ${targetAuth}` } : {},
          });
          if (res.ok) {
            const data = await res.json();
            certUrl = data.certificate_url;
            if (certUrl) {
              setDocInfo((prev: any) => ({ ...prev, certificate_url: certUrl, certificate_ready: true }));
            }
          }
        }

        if (!certUrl) {
          throw new Error("合意締結証明書が準備中または取得できませんでした。");
        }

        const certPdfRes = await fetch(certUrl);
        const certPdfBytes = new Uint8Array(await certPdfRes.arrayBuffer());

        const zipBlob = await createDetachedZipBundle(
          plainBytes,
          certPdfBytes,
          `agreement_${targetDocId.slice(0, 8)}`
        );

        downloadBlob(`RiffAegis_Signed_Packet_${targetDocId.slice(0, 8)}.zip`, zipBlob, "application/zip");
        setZipDownloaded(true);
      } catch (err: unknown) {
        console.error(err);
        setError(err instanceof Error ? err.message : "ZIPダウンロードに失敗しました。");
      } finally {
        setIsZipping(false);
      }
    },
    [docInfo?.document_id, docInfo?.certificate_url, getOrDecryptOriginalPdf, downloadCertificatePdf, signerJwt, token]
  );

  const downloadMergedPdf = useCallback(async () => {
    setIsMerging(true);
    try {
      const plainBytes = await getOrDecryptOriginalPdf();
      let certUrl = docInfo?.certificate_url;
      if (!certUrl && docInfo?.document_id) {
        const targetAuth = signerJwt || token;
        const res = await fetch(`/api/documents/${docInfo.document_id}/status`, {
          headers: targetAuth ? { Authorization: `Bearer ${targetAuth}` } : {},
        });
        if (res.ok) {
          const data = await res.json();
          certUrl = data.certificate_url;
        }
      }
      if (!certUrl) {
        throw new Error("合意締結証明書が準備中または取得できませんでした。");
      }

      const certPdfRes = await fetch(certUrl);
      const certPdfBytes = new Uint8Array(await certPdfRes.arrayBuffer());

      if (plainBytes) {
        const mergedBytes = await mergeOriginalAndCertificatePdf(plainBytes, certPdfBytes);
        downloadBlob(
          `${docInfo?.document_title || "締結完了契約書"}_締結版.pdf`,
          mergedBytes,
          "application/pdf"
        );
        setMergedDownloaded(true);
      } else {
        downloadCertificatePdf();
      }
    } catch (err: unknown) {
      console.error(err);
      alert(err instanceof Error ? err.message : "結合PDFの作成に失敗しました。");
    } finally {
      setIsMerging(false);
    }
  }, [getOrDecryptOriginalPdf, docInfo, downloadCertificatePdf]);

  // Keep references to avoid re-triggering dependency cycles
  const downloadZipPackageRef = useRef(downloadZipPackage);
  downloadZipPackageRef.current = downloadZipPackage;

  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, []);

  const pollFinalization = useCallback(
    (docIdOverride?: string) => {
      const targetDocId = docIdOverride || docInfo?.document_id;
      if (!targetDocId) return;
      setIsFinalizing(true);
      let resolved = false;

      const onCompleted = (certUrl?: string) => {
        if (resolved) return;
        resolved = true;
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }
        setIsFinalizing(false);
        setDocInfo((prev: any) => ({
          ...prev,
          certificate_ready: true,
          ...(certUrl ? { certificate_url: certUrl } : {}),
        }));
        downloadZipPackageRef.current(certUrl, targetDocId);
      };

      // 1. Supabase Realtime (WebSocket) instant trigger
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (supabaseUrl && supabaseAnonKey) {
        try {
          const supabase = createClient(supabaseUrl, supabaseAnonKey);
          supabase
            .channel(`rt-doc-${targetDocId}`)
            .on(
              "postgres_changes",
              {
                event: "*",
                schema: "public",
                table: "documents_realtime_status",
                filter: `document_id=eq.${targetDocId}`,
              },
              async (payload) => {
                const row = payload.new as any;
                if (row && row.status === "completed" && row.certificate_ready) {
                  try {
                    const targetAuth = signerJwt || token;
                    const sRes = await fetch(`/api/documents/${targetDocId}/status`, {
                      headers: targetAuth ? { Authorization: `Bearer ${targetAuth}` } : {},
                    });
                    const sData = await sRes.json();
                    onCompleted(sData.certificate_url);
                  } catch {
                    onCompleted();
                  }
                }
              }
            )
            .subscribe();
        } catch (err) {
          console.warn("Realtime subscription fallback:", err);
        }
      }

      // 2. Continuous polling fallback (every 600ms)
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      const checkStatus = async () => {
        if (resolved) return;
        try {
          const targetAuth = signerJwt || token;
          const statusRes = await fetch(`/api/documents/${targetDocId}/status`, {
            headers: targetAuth ? { Authorization: `Bearer ${targetAuth}` } : {},
          });
          if (statusRes.ok) {
            const statusData = await statusRes.json();
            if (statusData.status === "completed" && statusData.certificate_ready) {
              onCompleted(statusData.certificate_url);
            }
          }
        } catch {
          // Retry
        }
      };

      checkStatus();
      pollIntervalRef.current = setInterval(checkStatus, 600);
    },
    [docInfo?.document_id, signerJwt, token]
  );

  const pollFinalizationRef = useRef(pollFinalization);
  pollFinalizationRef.current = pollFinalization;

  const fetchInfo = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/sign/${token}/info`);
      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.error?.message || "署名情報の取得に失敗しました。");
      }
      const data = await res.json();
      setDocInfo(data);
      if (data.signer_email) {
        setEmail(data.signer_email);
      }
      if (data.signer_name) {
        setSignerName(data.signer_name);
      }
      if (data.signer_address) {
        setSignerAddress(data.signer_address);
      }
      if (data.signer_company) {
        setSignerCompany(data.signer_company);
      }
      if (data.signer_title) {
        setSignerTitle(data.signer_title);
      } else if (data.signer_custom_value) {
        setSignerTitle(data.signer_custom_label ? `${data.signer_custom_label}: ${data.signer_custom_value}` : data.signer_custom_value);
      }

      // Cache decryption key to IndexedDB if present in URL
      if (data.document_id && typeof window !== "undefined") {
        const hash = window.location.hash.replace(/^#/, "").trim();
        if (hash) {
          storeDocumentAesKey(data.document_id, hash).catch(console.warn);
        }
      }

      // If document has already been agreed and signed, jump directly to Step 4
      if (data.already_signed) {
        setStep(4);
        if (data.is_all_completed) {
          if (data.certificate_ready) {
            setIsFinalizing(false);
          } else {
            setIsFinalizing(true);
            pollFinalizationRef.current?.(data.document_id);
          }
        } else {
          // Waiting for other signers in multi-party agreement
          setIsFinalizing(false);
        }
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "読み込みエラー");
    } finally {
      setLoading(false);
    }
  }, [token]);

  const hasFetchedRef = useRef(false);
  useEffect(() => {
    if (hasFetchedRef.current) return;
    hasFetchedRef.current = true;
    fetchInfo();
  }, [token, fetchInfo]);

  const handleSendOtp = async () => {
    setError(null);
    try {
      const res = await fetch(`/api/sign/${token}/otp/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error?.message || "OTPコードの送信に失敗しました。");
      }
      const data = await res.json();
      setOtpSent(true);
      if (data.debug_otp) {
        setOtpCode(data.debug_otp);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "送信エラー");
    }
  };

  const handleVerifyOtp = async () => {
    setError(null);
    setIsVerifyingOtp(true);
    try {
      const res = await fetch(`/api/sign/${token}/otp/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, otp_code: otpCode }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error?.message || "OTPコードが正しくありません。");
      }
      const data = await res.json();
      setSignerJwt(data.signer_session_token);
      setDownloadUrl(data.r2_presigned_download_url);
      setStep(2);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "認証エラー");
    } finally {
      setIsVerifyingOtp(false);
    }
  };

  const handleDecryptDocument = useCallback(async (keyToUse: string) => {
    if (!keyToUse) {
      setError("復号鍵が見つかりません。手動で暗号鍵を入力してください。");
      return;
    }
    setError(null);
    setIsDecrypting(true);

    try {
      const encRes = await fetch(downloadUrl);
      if (!encRes.ok) throw new Error("暗号化PDFのダウンロードに失敗しました。");
      const encBytes = new Uint8Array(await encRes.arrayBuffer());

      const cryptoKey = await importAesKeyFromBase64Url(keyToUse);
      const plainBytes = await decryptPdfAndVerify(encBytes, cryptoKey, docInfo.original_sha256);

      setDecryptedPdfBytes(plainBytes);
      const blob = new Blob([plainBytes as unknown as BufferSource], { type: "application/pdf" });
      const objectUrl = URL.createObjectURL(blob);
      setPdfBlobUrl(objectUrl);
      setAesKeyStr(keyToUse);
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : "原本の復号または完全性検証（SHA-256）に失敗しました。暗号鍵が異なるか、ファイルが破損しています。"
      );
    } finally {
      setIsDecrypting(false);
    }
  }, [downloadUrl, docInfo]);

  useEffect(() => {
    if (step === 2 && downloadUrl && aesKeyStr && !decryptedPdfBytes && !isDecrypting) {
      handleDecryptDocument(aesKeyStr);
    }
  }, [step, downloadUrl, aesKeyStr, decryptedPdfBytes, isDecrypting, handleDecryptDocument]);

  const handleConsent = async () => {
    setIsSigning(true);
    setError(null);
    try {
      let credResponse = null;

      // Only trigger WebAuthn/Passkey if not low_fallback (email OTP fallback)
      if (authLevel !== "low_fallback") {
        const challengeRes = await fetch(`/api/sign/${token}/webauthn/challenge`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${signerJwt}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ auth_level: authLevel }),
        });
        if (!challengeRes.ok) throw new Error("WebAuthnチャレンジ取得に失敗しました。");
        const options = await challengeRes.json();

        try {
          credResponse = await startRegistration({ optionsJSON: options });
        } catch (err: unknown) {
          console.warn("Passkey registration cancelled/failed:", err);
          credResponse = null;
        }
      }

      const consentRes = await fetch(`/api/sign/${token}/consent`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${signerJwt}`,
          "Content-Type": "application/json",
          "Idempotency-Key": crypto.randomUUID(),
        },
        body: JSON.stringify({
          credential_response: credResponse,
          auth_level: authLevel,
          signer_name: signerName.trim() || undefined,
          signer_address: signerAddress.trim() || undefined,
          signer_company: signerCompany.trim() || undefined,
          signer_title: signerTitle.trim() || undefined,
          mock: authLevel !== "low_fallback" && !credResponse,
        }),
      });

      if (!consentRes.ok) {
        const err = await consentRes.json();
        throw new Error(err.error?.message || "合意署名の記録に失敗しました。");
      }

      setStep(4);
      try {
        const targetAuth = signerJwt || token;
        const sRes = await fetch(`/api/documents/${docInfo.document_id}/status`, {
          headers: targetAuth ? { Authorization: `Bearer ${targetAuth}` } : {},
        });
        if (sRes.ok) {
          const sData = await sRes.json();
          setDocInfo((prev: any) => ({
            ...prev,
            already_signed: true,
            completed_signers: sData.completed_signers,
            total_signers: sData.total_signers,
            is_all_completed: sData.is_all_completed,
            certificate_ready: sData.certificate_ready,
            certificate_url: sData.certificate_url || prev?.certificate_url,
          }));

          if (sData.is_all_completed) {
            if (sData.certificate_ready) {
              setIsFinalizing(false);
            } else {
              setIsFinalizing(true);
              pollFinalization(docInfo.document_id);
            }
          } else {
            setIsFinalizing(false);
          }
        } else {
          setIsFinalizing(false);
        }
      } catch {
        setIsFinalizing(false);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "合意署名エラー");
      setIsSigning(false);
    }
  };

  const handleReject = async () => {
    try {
      const res = await fetch(`/api/sign/${token}/reject`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${signerJwt}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ reason: rejectReason || "署名者による不同意" }),
      });
      if (!res.ok) throw new Error("拒否処理に失敗しました。");
      alert("契約への不同意を記録しました。甲へ通知されます。");
      window.location.reload();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "エラー");
    }
  };

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto p-16 text-center space-y-4 riff-card">
        <Loader2 className="w-8 h-8 animate-spin text-[#70D6FF] mx-auto" />
        <p className="text-xs font-mono text-slate-400">署名情報を確認中...</p>
      </div>
    );
  }

  if (error && step === 1) {
    return (
      <div className="max-w-2xl mx-auto p-8 space-y-3 riff-card border-rose-200">
        <div className="flex items-center space-x-2 text-rose-600 font-bold">
          <AlertTriangle className="w-5 h-5" />
          <span>署名URLエラー</span>
        </div>
        <p className="text-sm text-slate-700">{error}</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6 py-2">
      {/* Step Indicators */}
      <div className="flex items-center justify-between px-2 text-xs font-bold text-slate-400">
        <span className={step >= 1 ? "text-[#0284c7]" : ""}>1. 本人確認 (OTP)</span>
        <span className="text-slate-300">➔</span>
        <span className={step >= 2 ? "text-[#0284c7]" : ""}>2. 原本復号 ＆ 確認</span>
        <span className="text-slate-300">➔</span>
        <span className={step >= 3 ? "text-[#0284c7]" : ""}>3. 生体合意</span>
        <span className="text-slate-300">➔</span>
        <span className={step >= 4 ? "text-emerald-600" : ""}>4. 締結 ＆ 納品</span>
      </div>

      {error && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-start space-x-2.5">
          <AlertTriangle className="w-4 h-4 text-rose-500 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* STEP 1: OTP */}
      {step === 1 && (
        <div className="riff-card p-6 sm:p-8 rounded-2xl space-y-6">
          <div>
            <div className="inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-md bg-[#70D6FF]/20 text-[#0284c7] text-xs font-bold tracking-wider">
              STEP 1
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 mt-2 flex items-center space-x-2">
              <Mail className="w-6 h-6 text-[#0284c7]" />
              <span>本人確認 (メールOTP)</span>
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-1">
              電子署名の身元紐付けのためワンタイム認証を行います。認証完了後に暗号化PDFが復号可能になります。
            </p>
          </div>

          {docInfo?.document_title && (
            <div className="p-4 rounded-2xl bg-blue-50/70 border border-blue-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-0.5">
                <span className="text-[10px] font-bold text-[#0284c7] uppercase tracking-wider">署名対象の契約書</span>
                <p className="text-base font-bold text-slate-900">{docInfo.document_title}</p>
              </div>
              {docInfo.creator_name && (
                <div className="text-left sm:text-right">
                  <span className="text-[10px] font-bold text-slate-400">作成・依頼元（甲）</span>
                  <p className="text-xs font-bold text-slate-700">{docInfo.creator_name}</p>
                </div>
              )}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">署名者メールアドレス</label>
              <div className="flex gap-2">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="signer@example.com"
                  className="flex-1 px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 text-xs focus:outline-none focus:border-[#70D6FF]"
                />
                <button
                  onClick={handleSendOtp}
                  className="riff-btn-primary px-5 py-3 rounded-xl text-xs font-bold whitespace-nowrap"
                >
                  {otpSent ? "再送信" : "認証コード送信"}
                </button>
              </div>
            </div>

            {otpSent && (
              <div className="space-y-3 pt-2">
                <label className="block text-xs font-bold text-slate-700">メールに届いた6桁の認証コード</label>
                <input
                  type="text"
                  maxLength={6}
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.trim())}
                  placeholder="123456"
                  className="w-full text-center tracking-widest text-2xl font-mono py-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 focus:outline-none focus:border-[#70D6FF]"
                />
                <button
                  onClick={handleVerifyOtp}
                  disabled={otpCode.length < 6 || isVerifyingOtp}
                  className="w-full riff-btn-primary py-4 rounded-2xl text-slate-950 font-bold text-sm tracking-wide disabled:opacity-40 flex items-center justify-center space-x-2"
                >
                  {isVerifyingOtp ? (
                    <Loader2 className="w-4 h-4 animate-spin text-slate-950" />
                  ) : (
                    <span>本人確認を完了して文書を確認</span>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* STEP 2: Decrypt & Preview */}
      {step === 2 && (
        <div className="riff-card p-6 sm:p-8 rounded-2xl space-y-6">
          <div className="flex items-start justify-between">
            <div>
              <div className="inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-md bg-[#70D6FF]/20 text-[#0284c7] text-xs font-bold tracking-wider">
                STEP 2
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 mt-2 flex items-center space-x-2">
                <FileText className="w-6 h-6 text-[#0284c7]" />
                <span>原本PDFの復号 ＆ 完全性検証</span>
              </h1>
            </div>
            {decryptedPdfBytes && (
              <span className="px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold flex items-center space-x-1">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                <span>完全一致</span>
              </span>
            )}
          </div>

          {!aesKeyStr && !decryptedPdfBytes && (
            <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 space-y-2 text-xs">
              <p className="font-bold text-slate-800">暗号鍵の貼り付けが必要です</p>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="AES-256-GCM 鍵文字列 (Base64URL)"
                  value={manualKeyInput}
                  onChange={(e) => setManualKeyInput(e.target.value.trim())}
                  className="flex-1 px-3 py-2 rounded-xl bg-white border border-slate-200 text-xs"
                />
                <button
                  onClick={() => handleDecryptDocument(manualKeyInput)}
                  className="riff-btn-primary px-4 py-2 rounded-xl text-xs font-bold"
                >
                  復号
                </button>
              </div>
            </div>
          )}

          {isDecrypting && (
            <div className="p-12 text-center space-y-3 bg-slate-50 rounded-2xl">
              <Loader2 className="w-8 h-8 animate-spin text-[#70D6FF] mx-auto" />
              <p className="text-xs font-mono text-slate-400">原本PDFを復号照合中...</p>
            </div>
          )}

          {decryptedPdfBytes && (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-emerald-50/70 border border-emerald-200 text-xs font-mono space-y-1">
                <div className="font-bold text-emerald-800 flex items-center space-x-1">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>原本SHA-256完全一致 (改ざんなし)</span>
                </div>
                <div className="text-slate-600 break-all">
                  SHA-256: <strong className="text-slate-900">{sha256Hex(decryptedPdfBytes)}</strong>
                </div>
              </div>

              {/* In-Memory Responsive PDF Viewer */}
              <div className="space-y-2.5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                  <span className="font-bold text-slate-800 flex items-center space-x-1.5">
                    <FileText className="w-4 h-4 text-[#0284c7]" />
                    <span>契約書本文プレビュー (スクロールして全ページを確認)</span>
                  </span>
                  <div className="flex items-center space-x-2">
                    {pdfBlobUrl && (
                      <>
                        <a
                          href={pdfBlobUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs flex items-center space-x-1 transition-colors"
                        >
                          <span>別タブで最大化</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                        <button
                          onClick={() => downloadBlob(`contract_original_${docInfo.document_id.slice(0, 8)}.pdf`, new Blob([decryptedPdfBytes as unknown as BufferSource]), "application/pdf")}
                          className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs flex items-center space-x-1 transition-colors"
                        >
                          <Download className="w-3 h-3" />
                          <span>原本保存</span>
                        </button>
                      </>
                    )}
                  </div>
                </div>

                <div className="rounded-[2rem] border border-slate-200 overflow-hidden bg-slate-100 shadow-inner">
                  {pdfBlobUrl ? (
                    <iframe
                      src={`${pdfBlobUrl}#toolbar=1&navpanes=0`}
                      title="契約書原本PDF"
                      className="w-full h-[540px] rounded-[2rem] bg-white border-0"
                    />
                  ) : (
                    <div className="p-12 text-center text-xs text-slate-400">PDFを準備中...</div>
                  )}
                </div>
                <p className="text-[11px] text-slate-400 text-right font-mono">
                  容量: {(decryptedPdfBytes.byteLength / 1024).toFixed(1)} KB ・ ブラウザ内メモリ上に安全展開
                </p>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  onClick={() => setStep(3)}
                  className="riff-btn-primary px-7 py-3.5 rounded-2xl text-xs font-bold tracking-wide flex items-center space-x-2"
                >
                  <span>合意・署名へ進む</span>
                  <Fingerprint className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* STEP 3: WebAuthn Consent */}
      {step === 3 && (
        <div className="riff-card p-6 sm:p-8 rounded-2xl space-y-6">
          <div>
            <div className="inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-md bg-[#FF70A6]/15 text-[#e11d48] text-xs font-bold tracking-wider">
              STEP 3
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 mt-2 flex items-center space-x-2">
              <Fingerprint className="w-6 h-6 text-[#FF70A6]" />
              <span>WebAuthn 生体合意署名</span>
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-1">
              端末のセキュアエレメント（Touch ID / Face ID / セキュリティキー）で暗号学的合意を行います。
            </p>
          </div>

          {/* Signer Identity Input */}
          <div className="p-4 sm:p-5 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-800 flex items-center space-x-1.5">
                <User className="w-3.5 h-3.5 text-[#0284c7]" />
                <span>署名者情報（合意締結証明書に公式印字されます）</span>
              </label>
              <span className="text-[10px] text-slate-400">氏名・住所の確認</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  氏名（又は代表者名） <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="例: 山田 太郎"
                  value={signerName}
                  onChange={(e) => setSignerName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-900 text-xs focus:outline-none focus:border-[#70D6FF]"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  住所（所在地又は居住地）
                </label>
                <input
                  type="text"
                  placeholder="例: 東京都渋谷区..."
                  value={signerAddress}
                  onChange={(e) => setSignerAddress(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-900 text-xs focus:outline-none focus:border-[#70D6FF]"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  所属組織／法人名／大学名（任意）
                </label>
                <input
                  type="text"
                  placeholder="例: 株式会社〇〇 / 〇〇大学"
                  value={signerCompany}
                  onChange={(e) => setSignerCompany(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-900 text-xs focus:outline-none focus:border-[#70D6FF]"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  役職／学籍番号／肩書（任意）
                </label>
                <input
                  type="text"
                  placeholder="例: 代表取締役 / 学籍番号: 2026AB1234"
                  value={signerTitle}
                  onChange={(e) => setSignerTitle(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-900 text-xs focus:outline-none focus:border-[#70D6FF]"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <button
              onClick={() => setAuthLevel("high_webauthn")}
              className={`p-4 rounded-2xl border text-left transition-all ${
                authLevel === "high_webauthn"
                  ? "border-[#70D6FF] bg-[#70D6FF]/10 text-slate-900"
                  : "border-slate-200 text-slate-500 hover:bg-slate-50"
              }`}
            >
              <div className="font-bold text-xs text-[#0284c7]">LEVEL HIGH</div>
              <div className="text-xs font-bold text-slate-800 mt-0.5">Touch ID / Face ID</div>
              <div className="text-[10px] text-slate-400 mt-0.5">推奨・プラットフォーム認証器</div>
            </button>

            <button
              onClick={() => setAuthLevel("medium_security_key")}
              className={`p-4 rounded-2xl border text-left transition-all ${
                authLevel === "medium_security_key"
                  ? "border-[#FF70A6] bg-[#FF70A6]/10 text-slate-900"
                  : "border-slate-200 text-slate-500 hover:bg-slate-50"
              }`}
            >
              <div className="font-bold text-xs text-[#FF70A6]">LEVEL MEDIUM</div>
              <div className="text-xs font-bold text-slate-800 mt-0.5">YubiKey / USBキー</div>
              <div className="text-[10px] text-slate-400 mt-0.5">外部セキュリティキー</div>
            </button>

            <button
              onClick={() => setAuthLevel("low_fallback")}
              className={`p-4 rounded-2xl border text-left transition-all ${
                authLevel === "low_fallback"
                  ? "border-amber-400 bg-amber-50 text-slate-900"
                  : "border-slate-200 text-slate-500 hover:bg-slate-50"
              }`}
            >
              <div className="font-bold text-xs text-amber-700">LEVEL LOW</div>
              <div className="text-xs font-bold text-slate-800 mt-0.5">メールOTPのみ</div>
              <div className="text-[10px] text-slate-400 mt-0.5">生体非対応のフォールバック</div>
            </button>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
            <button
              onClick={handleConsent}
              disabled={isSigning}
              className="w-full sm:flex-1 riff-btn-primary py-4 rounded-2xl text-slate-950 font-bold text-sm tracking-wide flex items-center justify-center space-x-2"
            >
              {isSigning ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-slate-950" />
                  <span>
                    {authLevel === "low_fallback"
                      ? "合意署名を記録中..."
                      : authLevel === "medium_security_key"
                      ? "セキュリティキー認証中..."
                      : "生体署名を実行中..."}
                  </span>
                </>
              ) : (
                <>
                  <ShieldCheck className="w-5 h-5 text-slate-950" />
                  <span>
                    {authLevel === "low_fallback"
                      ? "契約内容に同意して署名 (メールOTP認証)"
                      : authLevel === "medium_security_key"
                      ? "セキュリティキーで認証して同意"
                      : "Touch ID / Face ID で生体署名"}
                  </span>
                </>
              )}
            </button>

            <button
              onClick={() => setShowRejectModal(true)}
              className="px-5 py-4 rounded-2xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-500 font-bold text-xs transition-colors"
            >
              拒否する
            </button>
          </div>

          {showRejectModal && (
            <div className="p-5 rounded-2xl bg-rose-50 border border-rose-200 space-y-3">
              <label className="block text-xs font-bold text-rose-800">拒否理由の入力</label>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="合意できない理由を入力..."
                rows={2}
                className="w-full p-3 rounded-xl bg-white border border-rose-200 text-slate-900 text-xs focus:outline-none"
              />
              <div className="flex justify-end gap-2">
                <button onClick={() => setShowRejectModal(false)} className="px-3 py-1.5 rounded-lg text-xs text-slate-600">
                  キャンセル
                </button>
                <button onClick={handleReject} className="px-4 py-1.5 rounded-lg bg-rose-600 text-white font-bold text-xs">
                  拒否を送信
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* STEP 4: Completed & ZIP or Multi-Signer Pending */}
      {step === 4 && docInfo?.total_signers > 1 && !docInfo?.is_all_completed ? (
        <div className="riff-card p-10 rounded-[2.5rem] text-center space-y-6">
          <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto shadow-inner">
            <CheckCircle2 className="w-9 h-9" />
          </div>

          <div className="space-y-2">
            <div className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200">
              署名進捗: {docInfo?.completed_signers ?? 1} / {docInfo?.total_signers} 名完了
            </div>
            <h2 className="text-2xl font-bold tracking-tight text-slate-900">
              あなたの合意署名が完了しました
            </h2>
            <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
              契約原本への合意署名が正常に記録されました。<br />
              本契約は複数者署名のため、他の署名者の合意手続きを待機しています。
            </p>
          </div>

          <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 text-left text-xs text-slate-600 max-w-md mx-auto space-y-2.5">
            <div className="font-bold text-slate-800 flex items-center space-x-2">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span>締結完了までの流れ</span>
            </div>
            <p className="text-[11px] text-slate-500 leading-normal">
              すべての署名者が合意を完了した時点で、NICT世界原子時計による刻印、OpenTimestamps、GitHub公開刻印が行われ、最終的な合意締結証明書（原本＋全署名者の監査証跡付きPDF）が生成されます。
            </p>
            <p className="text-[11px] text-slate-500 leading-normal">
              締結完了後、ご登録メールアドレス（<span className="font-mono text-slate-700 font-semibold">{email}</span>）へダウンロードリンク付きの締結完了通知が自動配信されます。
            </p>
          </div>

          <div className="flex justify-center gap-3 pt-2">
            <button
              onClick={() => window.open("/verify", "_blank")}
              className="px-5 py-3 rounded-xl bg-white border border-slate-200 hover:border-slate-300 text-slate-700 font-bold text-xs flex items-center space-x-2 transition-colors"
            >
              <ExternalLink className="w-4 h-4 text-slate-400" />
              <span>検証ポータルを開く</span>
            </button>
          </div>
        </div>
      ) : step === 4 && (
        <div className="riff-card p-8 sm:p-10 rounded-2xl text-center space-y-6">
          {isFinalizing ? (
            <div className="space-y-4 py-8">
              <Loader2 className="w-10 h-10 animate-spin text-[#70D6FF] mx-auto" />
              <h2 className="text-xl font-bold tracking-tight text-slate-900">
                合意締結証明書を発行中...
              </h2>
              <p className="text-xs text-slate-400 font-mono">
                NICT世界原子時計 ➔ OpenTimestamps ＆ GitHub刻印 ➔ 証明書PDF生成
              </p>
            </div>
          ) : (
            <div className="space-y-5 py-4">
              <div className="w-14 h-14 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-8 h-8" />
              </div>

              <div>
                <h2 className="text-2xl font-bold tracking-tight text-slate-900">
                  署名手続きが完了しました！
                </h2>
                <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto leading-relaxed">
                  契約原本への生体合意署名、およびNICT世界原子時計・GitHub刻印・OpenTimestamps刻印がすべて完了しました。
                </p>
              </div>

              {/* Download Buttons Section */}
              <div className="space-y-3 pt-2 max-w-lg mx-auto">
                {/* 1. Recommended: Merged PDF */}
                <button
                  onClick={() => downloadMergedPdf()}
                  disabled={isMerging}
                  className="w-full riff-btn-primary py-3.5 px-5 rounded-2xl font-bold text-xs flex items-center justify-between shadow-sm group transition-all"
                >
                  <div className="flex items-center space-x-2.5">
                    <Sparkles className="w-4 h-4 text-slate-950 flex-shrink-0" />
                    <div className="text-left">
                      <div className="text-slate-950 font-black">
                        {mergedDownloaded ? "再度ダウンロード: 結合版PDF" : "締結完了契約書（結合版PDF）をダウンロード"}
                      </div>
                      <div className="text-[10px] text-slate-800 font-normal">
                        原本の末尾に合意締結証明書を結合した1本のPDF（日常管理・共有に最適）
                      </div>
                    </div>
                  </div>
                  <span className="px-2 py-0.5 rounded-full bg-slate-950/10 text-[10px] font-bold text-slate-950 whitespace-nowrap">
                    ★ おすすめ
                  </span>
                </button>

                {/* 2. Full Verification ZIP */}
                <button
                  onClick={() => downloadZipPackage()}
                  disabled={isZipping}
                  className="w-full py-3 px-5 rounded-2xl bg-white border border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-slate-800 font-bold text-xs flex items-center justify-between transition-colors shadow-sm"
                >
                  <div className="flex items-center space-x-2.5">
                    <Download className="w-4 h-4 text-[#0284c7] flex-shrink-0" />
                    <div className="text-left">
                      <div>{zipDownloaded ? "再度保存: ZIP完全パケット" : "ZIP完全パケット（原本 ＋ 独立証明書）"}</div>
                      <div className="text-[10px] text-slate-400 font-normal">
                        原本SHA-256ハッシュを1ビットも変えずに証明する分離保存用（裁判・法的検証用）
                      </div>
                    </div>
                  </div>
                  <span className="text-[10px] text-slate-400">ZIP形式</span>
                </button>

                {/* 3. Individual Downloads & Verification */}
                <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                  <button
                    onClick={() => downloadOriginalPdf()}
                    disabled={isZipping || isMerging}
                    className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-[11px] flex items-center space-x-1.5 transition-colors"
                  >
                    <FileText className="w-3.5 h-3.5 text-slate-500" />
                    <span>原本PDFのみ</span>
                  </button>

                  <button
                    onClick={() => downloadCertificatePdf()}
                    className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-[11px] flex items-center space-x-1.5 transition-colors"
                  >
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                    <span>証明書PDFのみ</span>
                  </button>

                  <button
                    onClick={() => window.open("/verify", "_blank")}
                    className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-[11px] flex items-center space-x-1.5 transition-colors"
                  >
                    <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
                    <span>検証ポータル</span>
                  </button>
                </div>
              </div>

              {/* Helpful Storage Recommendation Guide Box */}
              <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 text-left text-xs max-w-lg mx-auto space-y-3 mt-4">
                <div className="flex items-center space-x-2 font-bold text-slate-800">
                  <HardDrive className="w-4 h-4 text-[#0284c7]" />
                  <span>契約書の保存・保管について（推奨ガイド）</span>
                </div>

                <div className="space-y-2 text-[11px] text-slate-600 leading-relaxed">
                  <div>
                    <span className="font-bold text-slate-800">Q. ダウンロード保存は必須ですか？</span>
                    <p className="text-slate-500 mt-0.5">
                      はい、手元への保存を強く推奨します。電子帳簿保存法や民法上の時効（7〜10年）に備え、法人の税務調査や将来の契約確認にいつでも提示できるようにするためです。
                    </p>
                  </div>

                  <div>
                    <span className="font-bold text-slate-800">Q. 甲（作成者）と乙（署名者）で保存するものは何ですか？</span>
                    <ul className="list-disc list-inside mt-0.5 text-slate-500 space-y-0.5">
                      <li><strong className="text-slate-700">乙（あなた）</strong>: 上記の「結合版PDF（またはZIP）」を1部ダウンロードして保存してください。</li>
                      <li><strong className="text-slate-700">甲（作成者）</strong>: ダッシュボードから「証明書PDF」および原本PDF、作成時に保存した耐量子キーストア（.riffkey）を保管します。</li>
                    </ul>
                  </div>

                  <div>
                    <span className="font-bold text-slate-800">Q. どこに保存するのがおすすめ？</span>
                    <p className="text-slate-500 mt-0.5">
                      自社のGoogle Drive、OneDrive、Dropbox、または社内ファイルサーバー・PC等、日常的にバックアップされているクラウドストレージへの保管が最もおすすめです。
                    </p>
                  </div>

                  <div className="p-2.5 rounded-xl bg-blue-50/80 border border-blue-100 text-blue-800 text-[10px] flex items-start space-x-2">
                    <Info className="w-3.5 h-3.5 text-blue-600 flex-shrink-0 mt-0.5" />
                    <span>
                      RiffAegisはサーバー原本非保持（運営者であっても平文の契約書を保持・閲覧できない）プライバシー設計です。運営側のサーバー障害や将来のサービス終了時にも困らないよう、ダウンロードした原本と証明書を大切に保管してください。
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

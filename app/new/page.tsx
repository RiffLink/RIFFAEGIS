"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  UploadCloud,
  FileText,
  Lock,
  Cpu,
  ArrowRight,
  AlertCircle,
  Loader2,
  CheckCircle,
  Plus,
  Trash2,
  Users,
  RefreshCw,
  Building2,
  User,
  Edit3,
  FileSignature,
  Eye,
} from "lucide-react";
import {
  validatePdfFile,
  generateAesKey,
  exportAesKeyBase64Url,
  encryptPdf,
  generateMlDsaKeyPair,
  signOriginalHash,
  bytesToBase64,
  MAX_PDF_SIZE_BYTES,
} from "@/lib/crypto";
import {
  loadIdentityFromIndexedDB,
  storeIdentityInIndexedDB,
  storeDocumentAesKey,
} from "@/lib/crypto/client";
import {
  SignatureFusionConfig,
  getDefaultPartyFields,
} from "@/lib/crypto/signature-types";
import { fuseSignatureSheet } from "@/lib/crypto/signature-sheet";
import SignatureSheetConfigurator from "@/components/SignatureSheetConfigurator";
import ContractMarkdownEditor from "@/components/ContractMarkdownEditor";

interface SignerInput {
  id: string;
  email: string;
  name?: string;
  address?: string;
  role: "signer" | "witness" | "approver";
}

export default function NewDocumentPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Creation Mode: 'upload' | 'markdown'
  const [creationMode, setCreationMode] = useState<"upload" | "markdown">("upload");

  const [file, setFile] = useState<File | null>(null);
  const [fileBytes, setFileBytes] = useState<Uint8Array | null>(null);
  const [documentTitle, setDocumentTitle] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Creator (Party A) Information
  const [creatorOrg, setCreatorOrg] = useState("");
  const [creatorName, setCreatorName] = useState("");
  const [creatorAddress, setCreatorAddress] = useState("");
  const [creatorEmail, setCreatorEmail] = useState("");

  // Signers (Party B, etc.)
  const [signers, setSigners] = useState<SignerInput[]>([
    { id: "1", email: "", name: "", address: "", role: "signer" },
  ]);

  // Smart Signature Sheet Fusion Configuration
  const [fusionConfig, setFusionConfig] = useState<SignatureFusionConfig>({
    enabled: true,
    placement: "inline_margin",
    inlineMarginOffset: 40,
    agreementDateType: "auto_on_sign",
    parties: [
      {
        roleName: "甲",
        roleDescription: "作成者 / プロジェクト代表",
        fields: getDefaultPartyFields("partyA"),
      },
      {
        roleName: "乙",
        roleDescription: "参加者 / 署名者",
        fields: getDefaultPartyFields("partyB"),
      },
    ],
  });

  const [isProcessing, setIsProcessing] = useState(false);
  const [progressStage, setProgressStage] = useState<string>("");

  useEffect(() => {
    try {
      const saved = localStorage.getItem("riffaegis_creator_profile");
      if (saved) {
        const p = JSON.parse(saved);
        if (p.creatorOrg) setCreatorOrg(p.creatorOrg);
        if (p.creatorName) setCreatorName(p.creatorName);
        if (p.creatorAddress) setCreatorAddress(p.creatorAddress);
        if (p.creatorEmail) setCreatorEmail(p.creatorEmail);

        // Sync to fusionConfig party A
        setFusionConfig((prev) => {
          const newParties = [...prev.parties];
          const partyA = { ...newParties[0] };
          partyA.fields = partyA.fields.map((f) => {
            if (f.key === "company" && p.creatorOrg) return { ...f, value: p.creatorOrg };
            if (f.key === "name" && p.creatorName) return { ...f, value: p.creatorName };
            if (f.key === "address" && p.creatorAddress) return { ...f, value: p.creatorAddress };
            return f;
          });
          newParties[0] = partyA;
          return { ...prev, parties: newParties };
        });
      }
    } catch {
      // Fallback
    }
  }, []);

  // Keep Party A fields in sync with profile inputs
  const handleCreatorOrgChange = (val: string) => {
    setCreatorOrg(val);
    updatePartyAField("company", val);
  };
  const handleCreatorNameChange = (val: string) => {
    setCreatorName(val);
    updatePartyAField("name", val);
  };
  const handleCreatorAddressChange = (val: string) => {
    setCreatorAddress(val);
    updatePartyAField("address", val);
  };

  const updatePartyAField = (key: string, val: string) => {
    setFusionConfig((prev) => {
      const newParties = [...prev.parties];
      if (!newParties[0]) return prev;
      newParties[0].fields = newParties[0].fields.map((f) =>
        f.key === key ? { ...f, value: val } : f
      );
      return { ...prev, parties: newParties };
    });
  };

  const updatePartyBField = (key: string, val: string) => {
    setFusionConfig((prev) => {
      const newParties = [...prev.parties];
      if (!newParties[1]) return prev;
      newParties[1].fields = newParties[1].fields.map((f) =>
        f.key === key ? { ...f, value: val } : f
      );
      return { ...prev, parties: newParties };
    });
  };

  const addSigner = () => {
    const newId = crypto.randomUUID();
    const newIdx = signers.length;
    const roleLetters = ["乙", "丙", "丁", "戊", "己"];
    const roleName = roleLetters[newIdx] || `${newIdx + 1}人目`;

    setSigners((prev) => [
      ...prev,
      { id: newId, email: "", name: "", address: "", role: "signer" },
    ]);

    // Add corresponding party config
    setFusionConfig((prev) => ({
      ...prev,
      parties: [
        ...prev.parties,
        {
          roleName,
          roleDescription: "署名者",
          fields: getDefaultPartyFields("partyB"),
        },
      ],
    }));
  };

  const removeSigner = (id: string) => {
    if (signers.length <= 1) return;
    const signerIdx = signers.findIndex((s) => s.id === id);
    setSigners((prev) => prev.filter((s) => s.id !== id));

    setFusionConfig((prev) => {
      const newParties = prev.parties.filter((_, idx) => idx !== signerIdx + 1);
      return { ...prev, parties: newParties };
    });
  };

  const updateSigner = (
    id: string,
    field: "email" | "role" | "name" | "address",
    val: string
  ) => {
    setSigners((prev) =>
      prev.map((s) => (s.id === id ? { ...s, [field]: val } : s))
    );
    if (field === "name") {
      updatePartyBField("name", val);
    } else if (field === "address") {
      updatePartyBField("address", val);
    }
  };

  const handleFileChange = async (selectedFile: File) => {
    setError(null);
    try {
      const buffer = await selectedFile.arrayBuffer();
      const bytes = new Uint8Array(buffer);

      const validation = validatePdfFile(bytes, MAX_PDF_SIZE_BYTES);
      if (!validation.isValid) {
        setError(validation.error || "無効なファイルです。");
        setFile(null);
        setFileBytes(null);
        return;
      }

      setFile(selectedFile);
      setFileBytes(bytes);
      setDocumentTitle(selectedFile.name.replace(/\.pdf$/i, ""));
    } catch {
      setError("ファイルの読み込みに失敗しました。");
    }
  };

  const handleMarkdownPdfGenerated = (pdfBytes: Uint8Array, title: string) => {
    const generatedFile = new File([pdfBytes as any], `${title}.pdf`, {
      type: "application/pdf",
    });
    setFile(generatedFile);
    setFileBytes(pdfBytes);
    setDocumentTitle(title);
    setCreationMode("upload"); // switch back to confirmation view with generated PDF
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileChange(e.dataTransfer.files[0]);
    }
  };

  const clearSelectedFile = () => {
    setFile(null);
    setFileBytes(null);
    setDocumentTitle("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleProcessAndUpload = async () => {
    if (!fileBytes || !file) {
      setError("PDFファイルを選択または作成してください。");
      return;
    }

    if (!creatorName.trim()) {
      setError("甲（作成者／あなた）のお名前を入力してください。");
      return;
    }

    if (!creatorEmail.trim() || !creatorEmail.includes("@")) {
      setError("有効な認証・通知用メールアドレスを入力してください。");
      return;
    }

    const invalidSigner = signers.find((s) => !s.email.trim() || !s.email.includes("@"));
    if (invalidSigner) {
      setError("乙（署名相手）の有効なメールアドレスを入力してください。");
      return;
    }

    setIsProcessing(true);
    setError(null);

    try {
      // 1. Fuse Signature Sheet if enabled
      let targetBytes = fileBytes;
      if (fusionConfig.enabled) {
        setProgressStage("1. 当事者署名欄を原本PDFにスマート融合中...");
        targetBytes = await fuseSignatureSheet(fileBytes, fusionConfig);
      }

      // 2. Client-Side AES-256-GCM Encryption
      setProgressStage("2. ブラウザ内で完全暗号化中 (AES-256-GCM)...");
      const aesKey = await generateAesKey();
      const keyBase64Url = await exportAesKeyBase64Url(aesKey);
      const encResult = await encryptPdf(targetBytes, aesKey);

      // 3. ML-DSA-65 Post-Quantum Key & Signature
      setProgressStage("3. NIST ML-DSA-65 耐量子デジタル署名を計算中...");
      let identityKeyPair = await loadIdentityFromIndexedDB();
      if (!identityKeyPair) {
        identityKeyPair = generateMlDsaKeyPair();
        await storeIdentityInIndexedDB(identityKeyPair);
      }

      const mlDsaSignature = signOriginalHash(
        identityKeyPair.secretKey,
        encResult.originalSha3_512
      );

      // Store in sessionStorage temporarily for Step 2
      sessionStorage.setItem("riffaegis_temp_aes_key", keyBase64Url);
      sessionStorage.setItem("riffaegis_temp_mldsa_sk", bytesToBase64(identityKeyPair.secretKey));
      sessionStorage.setItem("riffaegis_temp_mldsa_pk", bytesToBase64(identityKeyPair.publicKey));
      sessionStorage.setItem("riffaegis_temp_signer_email", signers[0]?.email || "");
      sessionStorage.setItem("riffaegis_temp_signers", JSON.stringify(signers));
      sessionStorage.setItem(
        "riffaegis_temp_creator_profile",
        JSON.stringify({ creatorOrg, creatorName, creatorAddress, creatorEmail })
      );

      // Save creator profile for future documents
      localStorage.setItem(
        "riffaegis_creator_profile",
        JSON.stringify({ creatorOrg, creatorName, creatorAddress, creatorEmail })
      );

      // 4. Call POST /api/documents/init
      setProgressStage("4. サーバーへ登録要求を送信中...");
      const initRes = await fetch("/api/documents/init", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": crypto.randomUUID(),
        },
        body: JSON.stringify({
          original_sha256: encResult.originalSha256,
          original_sha3_512: encResult.originalSha3_512,
          file_size_bytes: encResult.fileSizeBytes,
          creator_email: creatorEmail || "creator@local",
          creator_ml_dsa_public_key: bytesToBase64(identityKeyPair.publicKey),
          creator_ml_dsa_signature: bytesToBase64(mlDsaSignature),
          document_title: documentTitle || file.name.replace(/\.pdf$/i, ""),
          original_filename: file.name,
        }),
      });

      if (!initRes.ok) {
        const errorJson = await initRes.json();
        throw new Error(errorJson.error?.message || "初期化APIエラー");
      }

      const { document_id, r2_presigned_upload_url, creator_document_token, creator_identity_token } = await initRes.json();

      // 5. Direct Upload encrypted binary to Storage
      setProgressStage("5. 暗号化バイナリを直接ストレージへ転送中...");
      const uploadRes = await fetch(r2_presigned_upload_url, {
        method: "PUT",
        headers: { "Content-Type": "application/octet-stream" },
        body: encResult.encryptedBytes as unknown as BodyInit,
      });

      if (!uploadRes.ok) {
        throw new Error("暗号化ファイルの保存に失敗しました。");
      }

      // 6. Confirm Upload
      setProgressStage("6. 格納完了を確認中...");
      const confirmRes = await fetch(`/api/documents/${document_id}/confirm-upload`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${creator_document_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ upload_completed: true }),
      });

      if (!confirmRes.ok) {
        throw new Error("アップロード検証に失敗しました。");
      }

      sessionStorage.setItem(`riff_doc_token_${document_id}`, creator_document_token);
      if (creator_identity_token) {
        sessionStorage.setItem("riff_creator_identity_token", creator_identity_token);
      }
      try {
        await storeDocumentAesKey(document_id, keyBase64Url);
      } catch (err) {
        console.warn("Failed to cache document AES key in IndexedDB:", err);
      }
      router.push(`/new/authenticate?id=${document_id}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "予期せぬエラーが発生しました");
      setIsProcessing(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6 py-2">
      {/* Step Indicator */}
      <div className="flex items-center justify-between px-2 text-xs font-bold text-slate-400">
        <span className="text-[#0284c7] flex items-center space-x-1.5 font-bold">
          <span className="w-5 h-5 rounded-full bg-[#70D6FF] text-slate-950 flex items-center justify-center text-[11px] font-black">1</span>
          <span>原本選択 ＆ 暗号化</span>
        </span>
        <span className="text-slate-300">➔</span>
        <span className="text-slate-400">2. 本人確認 ＆ 鍵保存</span>
        <span className="text-slate-300">➔</span>
        <span className="text-slate-400">3. URL共有</span>
      </div>

      <div className="riff-card p-6 sm:p-8 rounded-2xl space-y-6">
        <div>
          <div className="inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-md bg-[#70D6FF]/20 text-[#0284c7] text-xs font-bold tracking-wider">
            STEP 1
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 mt-2">
            契約書の作成・選択と暗号化
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            原本データはサーバーに送信されません。ブラウザ内で署名欄融合とAES-256-GCM暗号化が行われます。
          </p>
        </div>

        {error && (
          <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-start space-x-2.5">
            <AlertCircle className="w-4 h-4 text-rose-500 flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Creation Mode Tabs (Upload vs Markdown Editor) */}
        <div className="grid grid-cols-2 gap-2 bg-slate-100 p-1.5 rounded-2xl">
          <button
            type="button"
            onClick={() => setCreationMode("upload")}
            className={`py-2.5 px-4 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${
              creationMode === "upload"
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <UploadCloud className="w-4 h-4 text-blue-500" />
            <span>手元のPDFをアップロード</span>
          </button>
          <button
            type="button"
            onClick={() => setCreationMode("markdown")}
            className={`py-2.5 px-4 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${
              creationMode === "markdown"
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <Edit3 className="w-4 h-4 text-indigo-500" />
            <span>サイト内で作成（エディタ）</span>
          </button>
        </div>

        {creationMode === "markdown" ? (
          <ContractMarkdownEditor initialTitle={documentTitle} onPdfGenerated={handleMarkdownPdfGenerated} />
        ) : (
          <>
            {/* Dropzone */}
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-[2rem] p-8 text-center cursor-pointer transition-all ${
                file
                  ? "border-[#70D6FF] bg-[#70D6FF]/5"
                  : "border-slate-200 hover:border-[#70D6FF]/60 bg-slate-50/50 hover:bg-slate-50"
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    handleFileChange(e.target.files[0]);
                  }
                }}
              />

              {file ? (
                <div className="space-y-3 py-1">
                  <div className="w-12 h-12 rounded-2xl bg-[#70D6FF]/20 text-[#0284c7] flex items-center justify-center mx-auto">
                    <FileText className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="text-slate-900 font-bold text-sm">{file.name}</p>
                    <p className="text-xs text-slate-400 font-mono mt-0.5">
                      {(file.size / 1024).toFixed(1)} KB ・ %PDF- 検証済み
                    </p>
                  </div>
                  <div className="flex items-center justify-center gap-2 pt-1 flex-wrap">
                    <span className="inline-flex items-center space-x-1 px-3 py-1 rounded-full bg-emerald-50 text-emerald-600 text-[11px] font-bold">
                      <CheckCircle className="w-3.5 h-3.5" />
                      <span>準備完了</span>
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (fileBytes) {
                          const blob = new Blob([fileBytes as any], { type: "application/pdf" });
                          const url = URL.createObjectURL(blob);
                          window.open(url, "_blank");
                        }
                      }}
                      className="px-3 py-1 rounded-full bg-blue-50 hover:bg-blue-100 text-[#0284c7] text-[11px] font-bold transition-colors flex items-center space-x-1 border border-blue-200"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>PDFをプレビュー</span>
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        clearSelectedFile();
                      }}
                      className="px-3 py-1 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 text-[11px] font-bold transition-colors flex items-center space-x-1"
                    >
                      <RefreshCw className="w-3 h-3" />
                      <span>選び直す</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3 py-4">
                  <div className="w-12 h-12 rounded-2xl bg-white text-slate-400 border border-slate-200 flex items-center justify-center mx-auto shadow-sm">
                    <UploadCloud className="w-6 h-6 text-[#70D6FF]" />
                  </div>
                  <div>
                    <p className="text-slate-700 font-bold text-sm">手元の契約書PDFをドロップ、または選択</p>
                    <p className="text-xs text-slate-400 mt-0.5">標準PDF形式 (%PDF-) ・ 20MBまで</p>
                  </div>
                </div>
              )}
            </div>

            {/* Document Title / Subject Input */}
            {file && (
              <div className="p-4 rounded-2xl bg-blue-50/50 border border-blue-100 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-800 flex items-center space-x-1.5">
                    <FileText className="w-3.5 h-3.5 text-[#0284c7]" />
                    <span>契約書の件名・タイトル（ダッシュボード表示用）</span>
                  </label>
                  <span className="text-[10px] text-slate-400">ファイル名から自動設定</span>
                </div>
                <input
                  type="text"
                  placeholder="例: 秘密保持契約書_NDA"
                  value={documentTitle}
                  onChange={(e) => setDocumentTitle(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-blue-200 text-slate-900 font-bold text-xs focus:outline-none focus:border-[#70D6FF]"
                />
              </div>
            )}
          </>
        )}

        {/* Smart Signature Sheet Configurator (Party Info, Custom Fields, Placement) */}
        <SignatureSheetConfigurator
          config={fusionConfig}
          onChange={setFusionConfig}
        />

        {/* Creator & Multi-Signers Inputs */}
        <div className="space-y-5">
          {/* Party A (甲: Creator) */}
          <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-800 flex items-center space-x-1.5">
                <Building2 className="w-3.5 h-3.5 text-[#0284c7]" />
                <span>甲（作成者／あなた）のアカウント・通知先</span>
              </label>
              <span className="text-[10px] text-slate-400">次回から自動補完されます</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  氏名／代表者名 <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="例: 山田 太郎"
                  value={creatorName}
                  onChange={(e) => handleCreatorNameChange(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-900 placeholder-slate-400 text-xs focus:outline-none focus:border-[#70D6FF]"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  認証・通知用メールアドレス <span className="text-rose-500">*</span>
                </label>
                <input
                  type="email"
                  placeholder="creator@example.com"
                  value={creatorEmail}
                  onChange={(e) => setCreatorEmail(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-900 placeholder-slate-400 text-xs focus:outline-none focus:border-[#70D6FF]"
                />
              </div>
            </div>
            <p className="text-[11px] text-slate-400">
              ※ 次のステップでのワンタイム認証コード（OTP）や、署名完了通知がこのアドレスに届きます。
            </p>
          </div>

          {/* Party B (乙: Signers) */}
          <div className="space-y-3 pt-1">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-800 flex items-center space-x-1.5">
                <Users className="w-3.5 h-3.5 text-[#0284c7]" />
                <span>乙（署名相手）の送信先・役割設定</span>
              </label>
              <button
                type="button"
                onClick={addSigner}
                className="text-xs font-bold text-[#0284c7] hover:underline flex items-center space-x-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>連名者を追加 (丙, 丁...)</span>
              </button>
            </div>

            {signers.map((s, idx) => {
              const label = idx === 0 ? "乙" : idx === 1 ? "丙" : idx === 2 ? "丁" : `${idx + 1}人目`;
              return (
                <div
                  key={s.id}
                  className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <span className="w-6 h-6 rounded-full bg-[#70D6FF] text-slate-950 font-black text-xs flex items-center justify-center flex-shrink-0">
                        {label}
                      </span>
                      <select
                        value={s.role}
                        onChange={(e) => updateSigner(s.id, "role", e.target.value)}
                        className="px-2.5 py-1.5 rounded-xl bg-white border border-slate-200 text-xs font-bold text-slate-700"
                      >
                        <option value="signer">署名者（当事者）</option>
                        <option value="witness">立会人 (Witness)</option>
                        <option value="approver">承認者 (Approver)</option>
                      </select>
                    </div>

                    {signers.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeSigner(s.id)}
                        className="p-1.5 rounded-xl text-slate-400 hover:text-rose-500 hover:bg-rose-50 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      相手のメールアドレス <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="email"
                      placeholder="signer@partner.org"
                      value={s.email}
                      onChange={(e) => updateSigner(s.id, "email", e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-900 text-xs focus:outline-none focus:border-[#70D6FF]"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                        相手の氏名／法人名（任意）
                      </label>
                      <input
                        type="text"
                        placeholder="空欄の場合、相手が署名時に入力"
                        value={s.name || ""}
                        onChange={(e) => updateSigner(s.id, "name", e.target.value)}
                        className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-900 placeholder-slate-400 text-xs focus:outline-none focus:border-[#70D6FF]"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                        相手の住所（任意）
                      </label>
                      <input
                        type="text"
                        placeholder="空欄の場合、相手が署名時に入力"
                        value={s.address || ""}
                        onChange={(e) => updateSigner(s.id, "address", e.target.value)}
                        className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-900 placeholder-slate-400 text-xs focus:outline-none focus:border-[#70D6FF]"
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Badges */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-slate-500 font-medium">
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/60 flex items-center space-x-2">
            <Lock className="w-4 h-4 text-[#70D6FF]" />
            <span>AES-GCM-256 (ブラウザ内暗号化)</span>
          </div>
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/60 flex items-center space-x-2">
            <Cpu className="w-4 h-4 text-[#FF70A6]" />
            <span>NIST ML-DSA-65 耐量子署名</span>
          </div>
        </div>

        {/* Action Button */}
        <button
          onClick={handleProcessAndUpload}
          disabled={!file || !creatorName.trim() || !creatorEmail.trim() || isProcessing}
          className="w-full riff-btn-primary py-4 rounded-2xl text-slate-950 font-bold text-sm tracking-wide disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
        >
          {isProcessing ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin text-slate-950" />
              <span>{progressStage}</span>
            </>
          ) : (
            <>
              <span>暗号化して次へ</span>
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </div>
    </div>
  );
}

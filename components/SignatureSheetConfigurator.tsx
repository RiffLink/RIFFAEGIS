"use client";

import React, { useState, useEffect } from "react";
import {
  SignerField,
  SignatureFusionConfig,
  SignaturePlacement,
} from "@/lib/crypto/signature-types";
import { fuseSignatureSheet } from "@/lib/crypto/signature-sheet";
import {
  Check,
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  FileCheck,
  LayoutTemplate,
  Calendar,
  Sparkles,
  Eye,
  EyeOff,
  ExternalLink,
  FileText,
  Loader2,
  X,
  FileSearch,
} from "lucide-react";

interface Props {
  config: SignatureFusionConfig;
  onChange: (newConfig: SignatureFusionConfig) => void;
  pdfBytes?: Uint8Array | null;
  docTitle?: string;
  markdownContent?: string;
}

export default function SignatureSheetConfigurator({
  config,
  onChange,
  pdfBytes,
  docTitle,
  markdownContent,
}: Props) {
  const [newCustomLabel, setNewCustomLabel] = useState("");
  const [activePartyIdx, setActivePartyIdx] = useState<number>(0);
  const [showPreview, setShowPreview] = useState<boolean>(true);
  const [isGeneratingRealPreview, setIsGeneratingRealPreview] = useState<boolean>(false);
  const [realPdfUrl, setRealPdfUrl] = useState<string | null>(null);
  const [showRealPdfModal, setShowRealPdfModal] = useState<boolean>(false);
  const [inlinePdfUrl, setInlinePdfUrl] = useState<string | null>(null);
  const [isRenderingInlinePdf, setIsRenderingInlinePdf] = useState<boolean>(false);
  const [previewTab, setPreviewTab] = useState<'real_pdf' | 'sheet_simulator'>('real_pdf');

  // Auto-render real fused PDF when pdfBytes or config changes
  useEffect(() => {
    if (!pdfBytes) {
      setInlinePdfUrl(null);
      return;
    }

    let active = true;
    setIsRenderingInlinePdf(true);

    const timer = setTimeout(async () => {
      try {
        const fusedBytes = await fuseSignatureSheet(pdfBytes, config);
        if (!active) return;
        const blob = new Blob([fusedBytes as unknown as BlobPart], { type: "application/pdf" });
        const url = URL.createObjectURL(blob);
        setInlinePdfUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return url;
        });
      } catch (err) {
        console.error("Auto-render fused PDF error:", err);
      } finally {
        if (active) setIsRenderingInlinePdf(false);
      }
    }, 350);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [pdfBytes, config]);

  const toggleEnabled = () => {
    onChange({ ...config, enabled: !config.enabled });
  };

  const setPlacement = (placement: SignaturePlacement) => {
    onChange({ ...config, placement });
  };

  const setDateType = (agreementDateType: 'auto_on_sign' | 'custom') => {
    onChange({ ...config, agreementDateType });
  };

  const handleDateChange = (isoDate: string) => {
    // Convert YYYY-MM-DD to Japanese format e.g. 2026年9月15日
    if (!isoDate) {
      onChange({ ...config, customAgreementDate: "" });
      return;
    }
    const [y, m, d] = isoDate.split("-");
    const formatted = `${y}年${parseInt(m, 10)}月${parseInt(d, 10)}日`;
    onChange({ ...config, customAgreementDate: formatted });
  };

  // Convert current formatted string back to YYYY-MM-DD for date input
  const getIsoDateString = (): string => {
    if (!config.customAgreementDate) return "";
    const match = config.customAgreementDate.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
    if (!match) return "";
    const y = match[1];
    const m = match[2].padStart(2, "0");
    const d = match[3].padStart(2, "0");
    return `${y}-${m}-${d}`;
  };

  const updatePartyField = (
    partyIdx: number,
    fieldId: string,
    updates: Partial<SignerField>
  ) => {
    const newParties = [...config.parties];
    const party = newParties[partyIdx];
    party.fields = party.fields.map((f) => (f.id === fieldId ? { ...f, ...updates } : f));
    onChange({ ...config, parties: newParties });
  };

  const moveField = (partyIdx: number, fieldIdx: number, direction: 'up' | 'down') => {
    const newParties = [...config.parties];
    const fields = [...newParties[partyIdx].fields];
    const targetIdx = direction === 'up' ? fieldIdx - 1 : fieldIdx + 1;
    if (targetIdx < 0 || targetIdx >= fields.length) return;

    const temp = fields[fieldIdx];
    fields[fieldIdx] = fields[targetIdx];
    fields[targetIdx] = temp;
    newParties[partyIdx].fields = fields;
    onChange({ ...config, parties: newParties });
  };

  const removeField = (partyIdx: number, fieldId: string) => {
    const newParties = [...config.parties];
    newParties[partyIdx].fields = newParties[partyIdx].fields.filter((f) => f.id !== fieldId);
    onChange({ ...config, parties: newParties });
  };

  const addCustomField = (partyIdx: number) => {
    if (!newCustomLabel.trim()) return;
    const newParties = [...config.parties];
    const newField: SignerField = {
      id: `custom-${Date.now()}`,
      key: 'custom',
      label: newCustomLabel.trim(),
      value: '',
      enabled: true,
      isCustom: true,
    };
    newParties[partyIdx].fields.push(newField);
    onChange({ ...config, parties: newParties });
    setNewCustomLabel("");
  };

  const handleOpenRealPdfPreview = async () => {
    if (!pdfBytes) return;
    setIsGeneratingRealPreview(true);
    try {
      const fusedBytes = await fuseSignatureSheet(pdfBytes, config);
      const blob = new Blob([fusedBytes as unknown as BlobPart], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      setRealPdfUrl(url);
      setShowRealPdfModal(true);
    } catch (err) {
      console.error("Failed to generate real PDF preview:", err);
      alert("実寸PDFプレビューの生成に失敗しました: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIsGeneratingRealPreview(false);
    }
  };

  const getEndingMarkdownLines = (md?: string) => {
    if (!md || !md.trim()) return null;
    const lines = md
      .trim()
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith("---") && !l.startsWith(">"));
    if (lines.length === 0) return null;
    return lines.slice(-5);
  };

  const applyPreset = (partyIdx: number, presetType: 'corporate' | 'individual' | 'student') => {
    const newParties = [...config.parties];
    const rolePrefix = partyIdx === 0 ? 'a' : 'b';

    let fields: SignerField[] = [];
    if (presetType === 'corporate') {
      fields = [
        { id: `${rolePrefix}-company`, key: 'company', label: '法人名 / 屋号 / 所属', value: '', enabled: true },
        { id: `${rolePrefix}-title`, key: 'title', label: '役職 / 肩書', value: '', enabled: true },
        { id: `${rolePrefix}-name`, key: 'name', label: '氏名', value: '', enabled: true },
        { id: `${rolePrefix}-address`, key: 'address', label: '所在地 / 住所', value: '', enabled: true },
        { id: `${rolePrefix}-phone`, key: 'phone', label: '電話番号', value: '', enabled: false },
      ];
    } else if (presetType === 'individual') {
      fields = [
        { id: `${rolePrefix}-name`, key: 'name', label: '氏名', value: '', enabled: true },
        { id: `${rolePrefix}-address`, key: 'address', label: '所在地 / 住所', value: '', enabled: true },
        { id: `${rolePrefix}-phone`, key: 'phone', label: '電話番号', value: '', enabled: false },
      ];
    } else if (presetType === 'student') {
      fields = [
        { id: `${rolePrefix}-univ`, key: 'custom', label: '所属大学 / 学部', value: '', enabled: true, isCustom: true },
        { id: `${rolePrefix}-student-id`, key: 'custom', label: '学籍番号', value: '', enabled: true, isCustom: true },
        { id: `${rolePrefix}-name`, key: 'name', label: '氏名', value: '', enabled: true },
        { id: `${rolePrefix}-address`, key: 'address', label: '所在地 / 住所', value: '', enabled: true },
        { id: `${rolePrefix}-phone`, key: 'phone', label: '連絡先電話番号', value: '', enabled: false },
      ];
    }

    newParties[partyIdx].fields = fields;
    onChange({ ...config, parties: newParties });
  };

  const activeParty = config.parties[activePartyIdx] || config.parties[0];

  return (
    <div className="bg-white border border-slate-200 rounded-[2rem] p-6 sm:p-7 shadow-sm space-y-6">
      {/* Enable / Disable Toggle */}
      <div className="flex items-center justify-between border-b border-slate-100 pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-blue-50 border border-blue-100 rounded-2xl text-[#0284c7]">
            <FileCheck className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              当事者署名欄の自動融合（スマート調印）
              <span className="text-[10px] font-bold px-2.5 py-0.5 bg-blue-50 text-[#0284c7] border border-blue-200 rounded-full">
                推奨
              </span>
            </h3>
            <p className="text-xs text-slate-500">
              本文のみのPDFに、甲乙の氏名・会社・学籍番号などの公式署名枠を自動合成します
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={toggleEnabled}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
            config.enabled ? "bg-[#0284c7]" : "bg-slate-300"
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow-sm ${
              config.enabled ? "translate-x-6" : "translate-x-1"
            }`}
          />
        </button>
      </div>

      {config.enabled && (
        <>
          {/* Placement Mode Selector */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <LayoutTemplate className="w-3.5 h-3.5 text-[#0284c7]" />
                署名欄のレイアウト・配置方式
              </label>
              <button
                type="button"
                onClick={() => setShowPreview(!showPreview)}
                className="text-xs font-bold text-[#0284c7] hover:underline flex items-center gap-1"
              >
                {showPreview ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                <span>{showPreview ? "プレビューを隠す" : "署名ブロックの仕上がりをプレビュー"}</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setPlacement('inline_margin')}
                className={`p-4 rounded-2xl border text-left transition-all ${
                  config.placement === 'inline_margin'
                    ? "bg-blue-50/70 border-[#0284c7] ring-2 ring-[#0284c7]/20 shadow-sm"
                    : "bg-slate-50 border-slate-200 hover:border-slate-300"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-slate-900">
                    最終ページの余白に差し込む
                  </span>
                  {config.placement === 'inline_margin' && (
                    <Check className="w-4 h-4 text-[#0284c7]" />
                  )}
                </div>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                  ページが余っている場合に最適。1枚ですっきり収まり、無駄な白紙ページを出しません。
                </p>
              </button>

              <button
                type="button"
                onClick={() => setPlacement('new_page')}
                className={`p-4 rounded-2xl border text-left transition-all ${
                  config.placement === 'new_page'
                    ? "bg-blue-50/70 border-[#0284c7] ring-2 ring-[#0284c7]/20 shadow-sm"
                    : "bg-slate-50 border-slate-200 hover:border-slate-300"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-slate-900">
                    末尾に専用調印ページを追加
                  </span>
                  {config.placement === 'new_page' && (
                    <Check className="w-4 h-4 text-[#0284c7]" />
                  )}
                </div>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                  本文が最終行まで詰まっている場合に最適。綺麗な専用A4調印シートを1枚付加します。
                </p>
              </button>
            </div>
          </div>

          {/* Party Layout Mode (Stacked vs Columns) */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
              <LayoutTemplate className="w-3.5 h-3.5 text-[#0284c7]" />
              当事者（甲・乙）の並び順
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => onChange({ ...config, layoutMode: 'stacked' })}
                className={`p-3 rounded-xl border text-left transition-all flex items-center justify-between ${
                  config.layoutMode !== 'columns'
                    ? "bg-blue-50/70 border-[#0284c7] ring-2 ring-[#0284c7]/20 shadow-sm"
                    : "bg-slate-50 border-slate-200 hover:border-slate-300"
                }`}
              >
                <div>
                  <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                    <span>縦2段（上段：甲 / 下段：乙）</span>
                    <span className="text-[10px] font-bold px-1.5 py-0.2 bg-[#0284c7] text-white rounded">推奨</span>
                  </span>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    長い会社名や住所も切れずに一行で美しく整列します。
                  </p>
                </div>
                {config.layoutMode !== 'columns' && (
                  <Check className="w-4 h-4 text-[#0284c7] shrink-0 ml-2" />
                )}
              </button>

              <button
                type="button"
                onClick={() => onChange({ ...config, layoutMode: 'columns' })}
                className={`p-3 rounded-xl border text-left transition-all flex items-center justify-between ${
                  config.layoutMode === 'columns'
                    ? "bg-blue-50/70 border-[#0284c7] ring-2 ring-[#0284c7]/20 shadow-sm"
                    : "bg-slate-50 border-slate-200 hover:border-slate-300"
                }`}
              >
                <div>
                  <span className="text-xs font-bold text-slate-900">
                    横2列（左：甲 / 右：乙）
                  </span>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    コンパクトに左右並列で配置します。
                  </p>
                </div>
                {config.layoutMode === 'columns' && (
                  <Check className="w-4 h-4 text-[#0284c7] shrink-0 ml-2" />
                )}
              </button>
            </div>
          </div>

          {/* Agreement Date Setting (with Calendar picker) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-200">
            <div>
              <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5 mb-2">
                <Calendar className="w-3.5 h-3.5 text-[#0284c7]" />
                契約締結日の設定
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setDateType('auto_on_sign')}
                  className={`text-xs px-3 py-1.5 rounded-xl border font-bold transition-all ${
                    config.agreementDateType === 'auto_on_sign'
                      ? "bg-[#0284c7] text-white border-[#0284c7] shadow-sm"
                      : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
                  }`}
                >
                  署名完了日に自動設定
                </button>
                <button
                  type="button"
                  onClick={() => setDateType('custom')}
                  className={`text-xs px-3 py-1.5 rounded-xl border font-bold transition-all ${
                    config.agreementDateType === 'custom'
                      ? "bg-[#0284c7] text-white border-[#0284c7] shadow-sm"
                      : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
                  }`}
                >
                  日付を指定（カレンダー）
                </button>
              </div>
            </div>

            {config.agreementDateType === 'custom' && (
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1.5">
                  締結日を選択
                </label>
                <input
                  type="date"
                  value={getIsoDateString()}
                  onChange={(e) => handleDateChange(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2 text-xs font-bold text-slate-900 focus:outline-none focus:border-[#70D6FF] shadow-sm"
                />
                {config.customAgreementDate && (
                  <p className="text-[11px] text-[#0284c7] font-semibold mt-1">
                    印字形式：{config.customAgreementDate}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Party Tabs (Party A, Party B, etc.) */}
          <div className="space-y-4 pt-1">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <div className="flex gap-2">
                {config.parties.map((party, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setActivePartyIdx(idx)}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                      activePartyIdx === idx
                        ? "bg-[#0284c7] text-white shadow-sm"
                        : "bg-slate-100 text-slate-600 hover:text-slate-900 hover:bg-slate-200"
                    }`}
                  >
                    {party.roleName}（{party.roleDescription || (idx === 0 ? "作成者" : "署名者")}）
                  </button>
                ))}
              </div>

              {/* Preset Buttons */}
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-slate-400 hidden sm:inline">プリセット:</span>
                <button
                  type="button"
                  onClick={() => applyPreset(activePartyIdx, 'corporate')}
                  className="text-[11px] px-2.5 py-1 bg-white text-slate-700 rounded-lg border border-slate-200 hover:border-slate-300 font-semibold shadow-xs"
                >
                  法人用
                </button>
                <button
                  type="button"
                  onClick={() => applyPreset(activePartyIdx, 'individual')}
                  className="text-[11px] px-2.5 py-1 bg-white text-slate-700 rounded-lg border border-slate-200 hover:border-slate-300 font-semibold shadow-xs"
                >
                  個人用
                </button>
                <button
                  type="button"
                  onClick={() => applyPreset(activePartyIdx, 'student')}
                  className="text-[11px] px-2.5 py-1 bg-white text-slate-700 rounded-lg border border-slate-200 hover:border-slate-300 font-semibold shadow-xs"
                >
                  学生・学籍番号用
                </button>
              </div>
            </div>

            {/* Active Party Fields List */}
            <div className="space-y-2">
              <p className="text-xs text-slate-500">
                必要な項目にチェックを入れ、内容を入力してください。右の矢印で並び替えできます。
              </p>

              {activeParty.fields.map((field, fIdx) => (
                <div
                  key={field.id}
                  className={`flex items-center gap-2.5 p-3 rounded-2xl border transition-all ${
                    field.enabled
                      ? "bg-white border-slate-200 shadow-xs"
                      : "bg-slate-50/70 border-slate-200/50 opacity-50"
                  }`}
                >
                  {/* Enabled Checkbox */}
                  <input
                    type="checkbox"
                    checked={field.enabled}
                    onChange={(e) =>
                      updatePartyField(activePartyIdx, field.id, { enabled: e.target.checked })
                    }
                    className="w-4 h-4 rounded border-slate-300 text-[#0284c7] focus:ring-[#70D6FF]"
                  />

                  {/* Field Label */}
                  {field.isCustom ? (
                    <input
                      type="text"
                      value={field.label}
                      onChange={(e) =>
                        updatePartyField(activePartyIdx, field.id, { label: e.target.value })
                      }
                      className="w-32 bg-blue-50/50 border border-blue-200 rounded-lg px-2 py-1 text-xs text-[#0284c7] font-bold"
                    />
                  ) : (
                    <span className="w-32 text-xs font-bold text-slate-800 truncate">
                      {field.label}
                    </span>
                  )}

                  {/* Field Value Input */}
                  <input
                    type="text"
                    value={field.value}
                    onChange={(e) =>
                      updatePartyField(activePartyIdx, field.id, { value: e.target.value })
                    }
                    placeholder={
                      activePartyIdx === 0
                        ? "作成者情報を入力"
                        : "署名相手の情報（空欄時は署名者が入力）"
                    }
                    disabled={!field.enabled}
                    className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-1.5 text-xs font-medium text-slate-900 placeholder-slate-400 focus:outline-none focus:border-[#70D6FF] disabled:opacity-50"
                  />

                  {/* Reorder Up / Down */}
                  <div className="flex items-center">
                    <button
                      type="button"
                      onClick={() => moveField(activePartyIdx, fIdx, 'up')}
                      disabled={fIdx === 0}
                      className="p-1 text-slate-400 hover:text-slate-800 disabled:opacity-20"
                    >
                      <ChevronUp className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveField(activePartyIdx, fIdx, 'down')}
                      disabled={fIdx === activeParty.fields.length - 1}
                      className="p-1 text-slate-400 hover:text-slate-800 disabled:opacity-20"
                    >
                      <ChevronDown className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Delete Custom Field */}
                  {field.isCustom && (
                    <button
                      type="button"
                      onClick={() => removeField(activePartyIdx, field.id)}
                      className="p-1 text-rose-500 hover:text-rose-700"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}

              {/* Add Custom Field Form */}
              <div className="flex gap-2 pt-2">
                <input
                  type="text"
                  value={newCustomLabel}
                  onChange={(e) => setNewCustomLabel(e.target.value)}
                  placeholder="追加する項目名（例: 学籍番号、所属部署、担当チーム）"
                  className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-[#70D6FF]"
                />
                <button
                  type="button"
                  onClick={() => addCustomField(activePartyIdx)}
                  disabled={!newCustomLabel.trim()}
                  className="px-4 py-2 bg-blue-50 hover:bg-blue-100 text-[#0284c7] border border-blue-200 rounded-xl text-xs font-bold flex items-center gap-1 disabled:opacity-40 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  項目を追加
                </button>
              </div>
            </div>
          </div>

          {/* Toggleable Preview */}
          {showPreview && (
            <div className="p-5 bg-slate-100 border border-slate-200/80 rounded-2xl space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-amber-500" />
                  <span>A4用紙 最終ページ・仕上がりプレビュー</span>
                </span>
                <div className="flex items-center flex-wrap gap-2">
                  {pdfBytes && inlinePdfUrl && (
                    <div className="flex items-center bg-white p-0.5 rounded-lg border border-slate-200 shadow-xs">
                      <button
                        type="button"
                        onClick={() => setPreviewTab('real_pdf')}
                        className={`px-2.5 py-1 rounded-md text-[11px] font-bold flex items-center gap-1 transition-all ${
                          previewTab === 'real_pdf'
                            ? 'bg-[#0284c7] text-white shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        <FileText className="w-3.5 h-3.5" />
                        <span>実物PDFプレビュー</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setPreviewTab('sheet_simulator')}
                        className={`px-2.5 py-1 rounded-md text-[11px] font-bold flex items-center gap-1 transition-all ${
                          previewTab === 'sheet_simulator'
                            ? 'bg-[#0284c7] text-white shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        <LayoutTemplate className="w-3.5 h-3.5" />
                        <span>用紙シミュレーター</span>
                      </button>
                    </div>
                  )}

                  <span className="text-[11px] font-bold text-[#0284c7] bg-white px-2.5 py-0.5 rounded-full border border-slate-200">
                    {config.placement === 'inline_margin' ? '最終ページ下部に合成（1枚に集約）' : '末尾に新規1ページ付加'}
                  </span>
                  <span className="text-[10px] text-slate-500 bg-slate-200/80 px-2 py-0.5 rounded-md font-mono">
                    {config.layoutMode === 'columns' ? '横2列配置' : '縦2段配置（推奨）'}
                  </span>
                  {pdfBytes && (
                    <button
                      type="button"
                      onClick={handleOpenRealPdfPreview}
                      disabled={isGeneratingRealPreview}
                      className="px-2.5 py-1 bg-white hover:bg-slate-50 text-[#0284c7] font-bold text-[11px] rounded-lg border border-blue-200 shadow-xs flex items-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer"
                    >
                      {isGeneratingRealPreview ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-[#0284c7]" />
                      ) : (
                        <ExternalLink className="w-3.5 h-3.5 text-[#0284c7]" />
                      )}
                      <span>全画面で確認</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Real PDF Direct Viewer (When PDF is loaded and real_pdf tab selected) */}
              {pdfBytes && inlinePdfUrl && previewTab === 'real_pdf' ? (
                <div className="flex flex-col items-center py-2 space-y-2">
                  <div className="w-full max-w-[660px] bg-white rounded-xl shadow-lg border border-slate-300 overflow-hidden relative">
                    <div className="px-4 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-xs text-slate-600">
                      <span className="font-bold flex items-center gap-1.5 text-slate-800">
                        <FileCheck className="w-4 h-4 text-emerald-600" />
                        <span>実際のPDFに署名欄を合成した仕上がり（実寸表示）</span>
                      </span>
                      <span className="text-[10px] font-mono text-slate-400">
                        最終ページの本文と下部余白の配置を完全再現
                      </span>
                    </div>
                    <div className="h-[680px] w-full bg-slate-100 relative">
                      {isRenderingInlinePdf && (
                        <div className="absolute inset-0 bg-white/70 backdrop-blur-2xs flex items-center justify-center z-10">
                          <div className="flex items-center gap-2 text-xs font-bold text-slate-700 bg-white px-4 py-2 rounded-xl shadow-md border border-slate-200">
                            <Loader2 className="w-4 h-4 animate-spin text-[#0284c7]" />
                            <span>PDFへ署名欄を再合成中...</span>
                          </div>
                        </div>
                      )}
                      <iframe
                        src={`${inlinePdfUrl}#toolbar=0&navpanes=0`}
                        className="w-full h-full border-0"
                        title="Actual PDF Preview"
                      />
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-500 flex items-center gap-1">
                    <span>💡 アップロードされた実際のPDFに署名欄が直接印字された状態です。余白や位置をそのまま目視できます。</span>
                  </p>
                </div>
              ) : (
                /* A4 Sheet Simulator (Exact contract ending articles & realistic vertical flow) */
                <div className="flex justify-center py-2">
                  <div
                    className="w-full max-w-[620px] bg-white text-slate-900 rounded-lg p-6 sm:p-10 shadow-lg font-serif text-xs leading-relaxed relative border border-slate-300 flex flex-col justify-between"
                    style={{ minHeight: "680px" }}
                  >
                    {/* Top: Actual Contract Content (No fake hardcoded text) */}
                    <div className="space-y-3 pb-5 select-none border-b border-dashed border-slate-300">
                      <div className="flex items-center justify-between text-[10px] text-slate-400 font-sans">
                        <span className="font-bold text-slate-700 truncate max-w-[280px]">
                          {docTitle || "契約書"}（最終ページ末尾）
                        </span>
                        <span className="font-mono text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                          {markdownContent ? "入力中の本文をリアルタイム反映" : "本文未入力"}
                        </span>
                      </div>

                      <div className="space-y-2 pt-1 text-slate-700 font-serif text-[11px] leading-relaxed">
                        {(() => {
                          const mdLines = getEndingMarkdownLines(markdownContent);
                          if (mdLines && mdLines.length > 0) {
                            return (
                              <>
                                <p className="text-slate-400 text-[10px] font-sans italic">
                                  …（前略：上記条文）…
                                </p>
                                {mdLines.map((line, idx) => {
                                  const isHeading = line.startsWith("#");
                                  const clean = line.replace(/^#+\s*/, "");
                                  return isHeading ? (
                                    <p key={idx} className="font-bold text-slate-900 text-xs mt-2 font-sans">
                                      {clean}
                                    </p>
                                  ) : (
                                    <p key={idx} className="text-slate-700">
                                      {clean}
                                    </p>
                                  );
                                })}
                              </>
                            );
                          }

                          // No fake hardcoded articles: clearly instruct user
                          return (
                            <div className="py-6 px-4 bg-slate-50 border border-slate-200 rounded-xl text-center space-y-1 font-sans">
                              <p className="font-bold text-slate-700 text-xs">
                                契約書の本文またはPDFが指定されていません
                              </p>
                              <p className="text-slate-500 text-[11px]">
                                上のエディタで文章を入力するか、手元のPDFをドロップしてください。
                              </p>
                              <p className="text-[10px] text-[#0284c7]">
                                実際に作成・アップロードした契約書の最終行と、その下部余白に印字される署名欄がここに直接表示されます。
                              </p>
                            </div>
                          );
                        })()}
                      </div>
                    </div>

                    {/* Bottom: Signature Fusion Block (Positioned naturally in bottom margin) */}
                    <div className="pt-6 space-y-3">
                      <div className="flex items-center justify-between text-[10px] font-sans text-slate-500 font-bold pb-1">
                        <span className="flex items-center gap-1 text-[#0284c7]">
                          <span>▼</span>
                          <span>
                            {config.placement === 'inline_margin'
                              ? '最終ページ下部に合成される調印・署名欄'
                              : '末尾に新規追加される専用調印シート'}
                          </span>
                        </span>
                        <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                          {config.placement === 'inline_margin'
                            ? '✅ 下部余白に綺麗に収まります'
                            : '📄 専用ページとして追加'}
                        </span>
                      </div>

                      {/* Agreement Date & Confirmation lead */}
                      <div className="space-y-1 text-slate-700 font-serif">
                        <p className="text-[11px] leading-relaxed">
                          {config.leadText || "本契約の成立を証するため、電磁的記録を作成し電子署名を施す。"}
                        </p>
                        <p className="text-[11px] font-bold text-slate-900 pt-0.5">
                          契約締結日： {config.agreementDateType === 'custom' && config.customAgreementDate
                            ? config.customAgreementDate
                            : '署名完了日に自動設定'}
                        </p>
                      </div>

                      {/* Clean dividing line */}
                      <div className="border-t border-slate-300 my-2" />

                      {/* Parties: Clean typography, tight label-value gap, maximized width */}
                      <div className={config.layoutMode === 'columns' ? "grid grid-cols-1 sm:grid-cols-2 gap-6" : "space-y-4"}>
                        {config.parties.map((party, pIdx) => {
                          const activeFields = party.fields.filter((f) => f.enabled);
                          return (
                            <div key={pIdx} className="space-y-1.5">
                              {/* Simple, authoritative contract header */}
                              <div className="font-bold text-slate-900 text-xs font-sans pb-1 border-b border-slate-200 flex items-baseline gap-1.5">
                                <span>【{party.roleName}】</span>
                                <span className="text-slate-600 font-normal text-[11px]">
                                  {party.roleDescription || (pIdx === 0 ? "作成者" : "署名者")}
                                </span>
                              </div>

                              {/* Field rows: Label directly followed by value */}
                              <div className="space-y-1 pt-0.5">
                                {activeFields.length === 0 ? (
                                  <p className="text-slate-400 italic text-[10px]">項目が選択されていません</p>
                                ) : (
                                  activeFields.map((f) => (
                                    <div key={f.id} className="flex items-baseline text-[11px] leading-snug">
                                      <span className="text-slate-500 font-medium shrink-0">
                                        {f.label}：
                                      </span>
                                      <span className="font-semibold text-slate-900 pl-1.5 break-all flex-1">
                                        {f.value || '（署名時に確認・入力）'}
                                      </span>
                                    </div>
                                  ))
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* Security & Verification watermark note */}
                      <div className="pt-4 border-t border-slate-200 flex items-center justify-between text-[9px] text-slate-400 font-sans">
                        <span>RiffAegis E2EE 電子合意署名ブロック</span>
                        <span>耐量子暗号・NICT原子時計タイムスタンプ保護</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Real PDF Full-Size Preview Modal */}
          {showRealPdfModal && realPdfUrl && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
              <div className="bg-white w-full max-w-4xl h-[90vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-slate-200">
                {/* Modal Header */}
                <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-[#0284c7]" />
                    <span className="font-bold text-sm text-slate-800">
                      実寸PDF仕上がり確認（余白・署名欄合成チェック）
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <a
                      href={realPdfUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-1 bg-white hover:bg-slate-100 text-slate-700 rounded-lg text-xs font-bold border border-slate-200 flex items-center gap-1 transition-colors"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>別タブで開く</span>
                    </a>
                    <button
                      type="button"
                      onClick={() => setShowRealPdfModal(false)}
                      className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200/60 transition-colors cursor-pointer"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                {/* Modal PDF Viewer */}
                <div className="flex-1 bg-slate-200 p-2 overflow-hidden">
                  <iframe
                    src={realPdfUrl}
                    className="w-full h-full rounded-lg bg-white shadow-inner"
                    title="Real PDF Preview"
                  />
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

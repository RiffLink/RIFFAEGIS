"use client";

import React, { useState } from "react";
import {
  SignerField,
  SignatureFusionConfig,
  SignaturePlacement,
} from "@/lib/crypto/signature-types";
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
} from "lucide-react";

interface Props {
  config: SignatureFusionConfig;
  onChange: (newConfig: SignatureFusionConfig) => void;
}

export default function SignatureSheetConfigurator({ config, onChange }: Props) {
  const [newCustomLabel, setNewCustomLabel] = useState("");
  const [activePartyIdx, setActivePartyIdx] = useState<number>(0);
  const [showPreview, setShowPreview] = useState<boolean>(false);

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
            <div className="p-5 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-amber-500" />
                  署名ブロック リアルタイムプレビュー
                </span>
                <span className="text-[11px] font-bold text-[#0284c7] bg-white px-2.5 py-0.5 rounded-full border border-slate-200">
                  {config.placement === 'inline_margin' ? '最終ページ下部に合成' : '末尾に新規1ページ付加'}
                </span>
              </div>

              <div className="border border-slate-200 bg-white text-slate-900 rounded-xl p-4 text-[11px] font-sans shadow-sm">
                <div className="border-b border-slate-200 pb-2 mb-3 flex justify-between items-baseline">
                  <span className="text-slate-500 text-[10px]">
                    本契約の成立を証するため、電磁的記録を作成し電子署名を施す。
                  </span>
                  <span className="font-bold text-slate-800 text-[11px]">
                    {config.agreementDateType === 'custom' && config.customAgreementDate
                      ? config.customAgreementDate
                      : '契約締結日： 署名完了日に自動設定'}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {config.parties.map((party, pIdx) => {
                    const activeFields = party.fields.filter((f) => f.enabled);
                    return (
                      <div
                        key={pIdx}
                        className="border border-slate-200 rounded-xl p-3 bg-slate-50/80 space-y-1"
                      >
                        <div className="font-bold text-slate-900 border-b border-slate-200 pb-1 flex items-center gap-1.5">
                          <span className="px-1.5 py-0.5 bg-[#0284c7] text-white rounded text-[10px] font-bold">
                            {party.roleName}
                          </span>
                          <span className="text-xs text-slate-600">
                            {party.roleDescription || (pIdx === 0 ? "作成者" : "署名者")}
                          </span>
                        </div>
                        {activeFields.length === 0 ? (
                          <p className="text-slate-400 italic text-[10px]">項目が選択されていません</p>
                        ) : (
                          activeFields.map((f) => (
                            <div key={f.id} className="flex justify-between text-[11px] pt-0.5">
                              <span className="text-slate-500">{f.label}：</span>
                              <span className="font-bold text-slate-800 truncate max-w-[150px]">
                                {f.value || '（署名時に確認・入力）'}
                              </span>
                            </div>
                          ))
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

"use client";

import React, { useState, useRef } from "react";
import {
  FileText,
  Eye,
  Edit3,
  ArrowRight,
  Heading1,
  Heading2,
  Bold,
  List,
  ListOrdered,
  Quote,
  Minus,
  Check,
  Copy,
} from "lucide-react";
import { generatePdfFromMarkdown } from "@/lib/markdown/contract-pdf";

interface Props {
  initialTitle?: string;
  onPdfGenerated: (pdfBytes: Uint8Array, title: string) => void;
}

interface ContentBlock {
  type: "h1" | "h2" | "h3" | "ul" | "ol" | "p" | "empty";
  content: string;
  linesCost: number;
}

/**
 * Parses inline markdown: **bold**, *italic*, and strips unneeded syntax cleanly
 */
function renderInline(text: string): React.ReactNode {
  const parts: (string | React.ReactNode)[] = [];
  const regex = /(\*\*.*?\*\*|__.*?__|\*.*?\*|_.*?_)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.substring(lastIndex, match.index));
    }
    const token = match[0];
    if (
      (token.startsWith("**") && token.endsWith("**")) ||
      (token.startsWith("__") && token.endsWith("__"))
    ) {
      parts.push(
        <strong key={match.index} className="font-bold text-slate-950 font-sans">
          {token.slice(2, -2)}
        </strong>
      );
    } else if (
      (token.startsWith("*") && token.endsWith("*")) ||
      (token.startsWith("_") && token.endsWith("_"))
    ) {
      parts.push(
        <em key={match.index} className="italic text-slate-800">
          {token.slice(1, -1)}
        </em>
      );
    }
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex));
  }
  return parts.length > 0 ? parts : text;
}

/**
 * Categorize markdown lines into structured content blocks
 */
function parseBlocks(markdownText: string): ContentBlock[] {
  const lines = markdownText.split("\n");
  const blocks: ContentBlock[] = [];

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed) {
      blocks.push({ type: "empty", content: "", linesCost: 1 });
      continue;
    }
    if (trimmed.startsWith("# ")) {
      blocks.push({ type: "h1", content: trimmed.replace(/^#\s+/, ""), linesCost: 3.5 });
      continue;
    }
    if (trimmed.startsWith("## ")) {
      blocks.push({ type: "h2", content: trimmed.replace(/^##\s+/, ""), linesCost: 2.5 });
      continue;
    }
    if (trimmed.startsWith("### ")) {
      blocks.push({ type: "h3", content: trimmed.replace(/^###\s+/, ""), linesCost: 2 });
      continue;
    }
    if (/^[-*]\s+/.test(trimmed)) {
      const text = trimmed.replace(/^[-*]\s+/, "");
      const linesCost = Math.max(1, Math.ceil(text.length / 36));
      blocks.push({ type: "ul", content: text, linesCost });
      continue;
    }
    if (/^\d+\.\s+/.test(trimmed)) {
      const linesCost = Math.max(1, Math.ceil(trimmed.length / 36));
      blocks.push({ type: "ol", content: trimmed, linesCost });
      continue;
    }
    // Check if it's a bold section or article title like **第1条（...）**
    if (/^\*\*第\d+条.*?\*\*$/.test(trimmed) || /^第\d+条/.test(trimmed)) {
      blocks.push({ type: "h2", content: trimmed.replace(/\*\*/g, ""), linesCost: 2.2 });
      continue;
    }
    // Normal paragraph
    const linesCost = Math.max(1, Math.ceil(trimmed.length / 38));
    blocks.push({ type: "p", content: trimmed, linesCost });
  }

  return blocks;
}

/**
 * Paginate content blocks into standard A4 sheet capacities
 */
function paginateBlocks(blocks: ContentBlock[], docTitle: string): ContentBlock[][] {
  const pages: ContentBlock[][] = [];
  let currentPage: ContentBlock[] = [];
  
  // A4 sheet vertical capacity (in line cost units)
  const FIRST_PAGE_LIMIT = 24;
  const NORMAL_PAGE_LIMIT = 30;

  let currentCapacity = FIRST_PAGE_LIMIT;
  let currentUsed = 0;

  for (const block of blocks) {
    if (currentUsed + block.linesCost > currentCapacity && currentPage.length > 0) {
      pages.push(currentPage);
      currentPage = [];
      currentCapacity = NORMAL_PAGE_LIMIT;
      currentUsed = 0;
    }
    currentPage.push(block);
    currentUsed += block.linesCost;
  }

  if (currentPage.length > 0 || pages.length === 0) {
    pages.push(currentPage);
  }

  return pages;
}

export default function ContractMarkdownEditor({ initialTitle = "", onPdfGenerated }: Props) {
  const [docTitle, setDocTitle] = useState<string>(initialTitle || "契約書");
  const [markdown, setMarkdown] = useState<string>(
    `プロジェクト代表者（以下「甲」という）と、参加者（以下「乙」という）は、以下のとおり合意する。\n\n## 第1条（目的）\n乙は甲が推進するプロジェクトに関して協力し、誠実に業務を遂行する。\n\n## 第2条（秘密保持）\n甲及び乙は、本契約に関して知り得た相手方の機密情報を厳重に管理し、事前の承諾なく第三者に開示してはならない。\n\n## 第3条（合意管轄）\n本契約に関して紛争が生じたときは、甲の所在地を管轄する地方裁判所を専属的合意管轄裁判所とする。`
  );
  const [activeView, setActiveView] = useState<"edit" | "preview">("edit");
  const [isGenerating, setIsGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleGeneratePdf = async () => {
    setIsGenerating(true);
    try {
      const titleToUse = docTitle.trim() || "無題の契約書";
      const pdfBytes = await generatePdfFromMarkdown({
        title: titleToUse,
        markdown,
      });
      onPdfGenerated(pdfBytes, titleToUse);
    } catch (err) {
      console.error("Failed to generate PDF from markdown:", err);
      alert("PDFの生成に失敗しました。");
    } finally {
      setIsGenerating(false);
    }
  };

  // Helper to insert formatting at cursor (Notion-like tool helpers)
  const insertFormatting = (prefix: string, suffix: string = "") => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = markdown.substring(start, end);
    const replacement = `${prefix}${selectedText || "テキスト"}${suffix}`;

    const newMarkdown =
      markdown.substring(0, start) + replacement + markdown.substring(end);
    setMarkdown(newMarkdown);

    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(
        start + prefix.length,
        start + prefix.length + (selectedText.length || "テキスト".length)
      );
    }, 0);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(markdown);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-white border border-slate-200 rounded-[2rem] p-6 sm:p-8 shadow-sm space-y-5">
      {/* Top Header & View Switcher */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
        <div>
          <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <Edit3 className="w-5 h-5 text-[#0284c7]" />
            サイト内契約書エディタ
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            WordやPDF作成ソフトがなくても、ノート感覚で契約書を入力してそのままPDF化できます
          </p>
        </div>

        {/* Edit / Preview Toggle */}
        <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl">
          <button
            type="button"
            onClick={() => setActiveView("edit")}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
              activeView === "edit"
                ? "bg-white text-slate-900 shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <Edit3 className="w-3.5 h-3.5" />
            <span>本文を編集</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveView("preview")}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
              activeView === "preview"
                ? "bg-white text-slate-900 shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <Eye className="w-3.5 h-3.5 text-[#0284c7]" />
            <span>プレビュー表示</span>
          </button>
        </div>
      </div>

      {/* Contract Title Input (Automatically applied as H1 heading if not in markdown) */}
      <div className="space-y-1.5 bg-slate-50 p-4 rounded-2xl border border-slate-200">
        <div className="flex items-center justify-between">
          <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
            <FileText className="w-3.5 h-3.5 text-[#0284c7]" />
            契約書の件名・タイトル
          </label>
          <span className="text-[10px] text-slate-400">
            本文中に大見出し（#）がない場合、自動的に先頭に配置されます
          </span>
        </div>
        <input
          type="text"
          value={docTitle}
          onChange={(e) => setDocTitle(e.target.value)}
          placeholder="例: プロジェクト参加合意書 / 秘密保持契約書"
          className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2 text-sm font-bold text-slate-900 focus:outline-none focus:border-[#70D6FF] shadow-xs"
        />
      </div>

      {/* Main Area: Edit Mode or Preview Mode */}
      {activeView === "edit" ? (
        <div className="space-y-3">
          {/* Notion-like Quick Formatting Toolbar */}
          <div className="flex items-center gap-1 p-1.5 bg-slate-50 border border-slate-200 rounded-xl overflow-x-auto">
            <button
              type="button"
              onClick={() => insertFormatting("## ")}
              className="p-1.5 px-2.5 rounded-lg text-xs font-bold text-slate-700 hover:bg-white hover:shadow-xs flex items-center gap-1"
              title="条項見出し (##)"
            >
              <Heading2 className="w-3.5 h-3.5 text-[#0284c7]" />
              <span>見出し</span>
            </button>
            <button
              type="button"
              onClick={() => insertFormatting("**", "**")}
              className="p-1.5 px-2.5 rounded-lg text-xs font-bold text-slate-700 hover:bg-white hover:shadow-xs flex items-center gap-1"
              title="太字 (**テキスト**)"
            >
              <Bold className="w-3.5 h-3.5" />
              <span>太字</span>
            </button>
            <button
              type="button"
              onClick={() => insertFormatting("- ")}
              className="p-1.5 px-2.5 rounded-lg text-xs font-bold text-slate-700 hover:bg-white hover:shadow-xs flex items-center gap-1"
              title="箇条書き (- )"
            >
              <List className="w-3.5 h-3.5" />
              <span>箇条書き</span>
            </button>
            <button
              type="button"
              onClick={() => insertFormatting("1. ")}
              className="p-1.5 px-2.5 rounded-lg text-xs font-bold text-slate-700 hover:bg-white hover:shadow-xs flex items-center gap-1"
              title="番号リスト (1. )"
            >
              <ListOrdered className="w-3.5 h-3.5" />
              <span>番号</span>
            </button>
            <button
              type="button"
              onClick={() => insertFormatting("> ")}
              className="p-1.5 px-2.5 rounded-lg text-xs font-bold text-slate-700 hover:bg-white hover:shadow-xs flex items-center gap-1"
              title="引用 (> )"
            >
              <Quote className="w-3.5 h-3.5" />
              <span>引用</span>
            </button>
            <button
              type="button"
              onClick={() => insertFormatting("\n---\n")}
              className="p-1.5 px-2.5 rounded-lg text-xs font-bold text-slate-700 hover:bg-white hover:shadow-xs flex items-center gap-1"
              title="区切り線 (---)"
            >
              <Minus className="w-3.5 h-3.5" />
              <span>区切り線</span>
            </button>

            <div className="ml-auto flex items-center pr-1">
              <button
                type="button"
                onClick={handleCopy}
                className="text-[11px] text-slate-500 hover:text-slate-900 flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-white"
              >
                {copied ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                <span>{copied ? "コピー完了" : "全文コピー"}</span>
              </button>
            </div>
          </div>

          {/* Full-width Writing Note Area */}
          <textarea
            ref={textareaRef}
            value={markdown}
            onChange={(e) => setMarkdown(e.target.value)}
            rows={18}
            placeholder="ここに契約書の条文を入力してください..."
            className="w-full bg-white border border-slate-200 rounded-2xl p-5 text-sm text-slate-900 font-sans focus:outline-none focus:border-[#70D6FF] leading-relaxed shadow-inner resize-y"
          />
        </div>
      ) : (
        /* Preview Mode (A4 Multi-Page Simulation) */
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs text-slate-500 px-1">
            <div className="flex items-center space-x-2">
              <span className="font-bold text-slate-700">A4 用紙仕上がりプレビュー</span>
              <span className="px-2 py-0.5 rounded-full bg-slate-200 text-slate-700 font-mono text-[10px]">
                全 {paginateBlocks(parseBlocks(markdown), docTitle).length} ページ
              </span>
            </div>
            <button
              type="button"
              onClick={() => setActiveView("edit")}
              className="font-bold text-[#0284c7] hover:underline flex items-center space-x-1"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>編集に戻る</span>
            </button>
          </div>

          <div className="bg-slate-200/80 border border-slate-300/80 rounded-2xl p-4 sm:p-8 overflow-y-auto max-h-[750px] shadow-inner flex flex-col items-center space-y-6">
            {paginateBlocks(parseBlocks(markdown), docTitle).map((pageBlocks, pageIdx, allPages) => (
              <div
                key={pageIdx}
                className="w-full max-w-[620px] bg-white text-slate-900 rounded-sm p-8 sm:p-14 shadow-lg font-serif text-xs sm:text-sm leading-relaxed relative flex flex-col justify-between border border-slate-200/90"
                style={{ minHeight: "877px" }}
              >
                <div className="space-y-3 flex-1">
                  {/* Title rendered on First Page */}
                  {pageIdx === 0 && (
                    <div className="text-center border-b border-slate-300 pb-4 mb-6">
                      <h1 className="text-xl sm:text-2xl font-bold text-slate-900 font-sans tracking-wide">
                        {docTitle || "契約書"}
                      </h1>
                    </div>
                  )}

                  {pageBlocks.map((b, bIdx) => {
                    if (b.type === "h1") {
                      return (
                        <h1 key={bIdx} className="text-lg sm:text-xl font-bold text-center border-b border-slate-300 pb-2 mb-3 text-slate-900 font-sans">
                          {renderInline(b.content)}
                        </h1>
                      );
                    }
                    if (b.type === "h2") {
                      return (
                        <h2
                          key={bIdx}
                          className="text-sm sm:text-base font-bold mt-5 mb-2 text-slate-950 font-sans border-l-3 border-[#0284c7] pl-2.5"
                        >
                          {renderInline(b.content)}
                        </h2>
                      );
                    }
                    if (b.type === "h3") {
                      return (
                        <h3 key={bIdx} className="text-xs sm:text-sm font-bold mt-3 mb-1 text-slate-800 font-sans">
                          {renderInline(b.content)}
                        </h3>
                      );
                    }
                    if (b.type === "ul") {
                      return (
                        <p key={bIdx} className="pl-4 text-slate-800 leading-relaxed">
                          ・ {renderInline(b.content)}
                        </p>
                      );
                    }
                    if (b.type === "ol") {
                      return (
                        <p key={bIdx} className="pl-4 text-slate-800 leading-relaxed font-sans">
                          {renderInline(b.content)}
                        </p>
                      );
                    }
                    if (b.type === "empty") {
                      return <div key={bIdx} className="h-2" />;
                    }
                    return (
                      <p key={bIdx} className="text-slate-800 leading-relaxed text-justify">
                        {renderInline(b.content)}
                      </p>
                    );
                  })}
                </div>

                {/* A4 Page Footer */}
                <div className="pt-6 mt-6 border-t border-slate-200 flex items-center justify-between text-[10px] text-slate-400 font-sans">
                  <span>{docTitle || "電子契約書"}</span>
                  <span className="font-mono">
                    Page {pageIdx + 1} / {allPages.length}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Action Footer: Generate PDF */}
      <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-slate-100">
        <p className="text-xs text-slate-400">
          ※ 生成後も次の画面で当事者署名欄（甲乙情報）を自由に設定できます
        </p>

        <button
          type="button"
          onClick={handleGeneratePdf}
          disabled={isGenerating || !markdown.trim()}
          className="w-full sm:w-auto px-7 py-3.5 bg-gradient-to-r from-[#0284c7] to-[#70D6FF] hover:opacity-95 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2 shadow-sm transition-all disabled:opacity-50"
        >
          {isGenerating ? (
            <>PDF作成中...</>
          ) : (
            <>
              <span>この内容でPDFを生成する</span>
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </div>
    </div>
  );
}

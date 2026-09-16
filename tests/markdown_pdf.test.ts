import { describe, it, expect } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { generatePdfFromMarkdown } from '../lib/markdown/contract-pdf';
import { fuseSignatureSheet } from '../lib/crypto/signature-sheet';
import { SignatureFusionConfig, getDefaultPartyFields } from '../lib/crypto/signature-types';

describe('Markdown Contract & Full Pipeline Suite', () => {
  it('should generate valid PDF from Markdown and fuse signature sheet', async () => {
    const markdown = `# プロジェクト参加合意書

プロジェクト代表者（以下「甲」という）と、参加者（以下「乙」という）は、以下のとおり合意する。

## 第1条（目的）
乙は本プロジェクトに協力し、成果物の開発を行う。

## 第2条（秘密保持）
乙は業務上知り得た機密情報を第三者に開示しない。`;

    // 1. Generate PDF from Markdown
    const pdfBytes = await generatePdfFromMarkdown({
      title: 'プロジェクト参加合意書',
      markdown,
    });
    expect(pdfBytes).toBeDefined();
    expect(pdfBytes.length).toBeGreaterThan(0);

    const doc = await PDFDocument.load(pdfBytes);
    expect(doc.getPageCount()).toBe(1);

    // 2. Fuse signature block with custom fields (like 学籍番号) into the bottom margin
    const config: SignatureFusionConfig = {
      enabled: true,
      placement: 'inline_margin',
      inlineMarginOffset: 40,
      agreementDateType: 'auto_on_sign',
      parties: [
        {
          roleName: '甲',
          roleDescription: '作成者',
          fields: getDefaultPartyFields('partyA'),
        },
        {
          roleName: '乙',
          roleDescription: '署名者',
          fields: [
            { id: 'b-custom-1', key: 'custom', label: '学籍番号', value: '2026-ENG-4892', enabled: true, isCustom: true },
            { id: 'b-name', key: 'name', label: '氏名', value: '山田 太郎', enabled: true },
          ],
        },
      ],
    };

    const finalBytes = await fuseSignatureSheet(pdfBytes, config);
    const finalDoc = await PDFDocument.load(finalBytes);

    // Should stay 1 page because it was fused inline in the bottom margin!
    expect(finalDoc.getPageCount()).toBe(1);
  });

  it('should generate multi-page PDF cleanly when text exceeds single page', async () => {
    // Generate long NDA contract markdown with **bold** article headings
    const longMarkdown = Array.from({ length: 15 }, (_, i) => `
**第${i + 1}条（秘密情報および遵守事項その${i + 1}）**

1. 本条において定める秘密情報とは、甲及び乙が本合意に関連して相手方に開示するすべての営業上、技術上、開発上、財務上の情報（ソースコード、アルゴリズム、データベース構造、仕様書、画面遷移図、API仕様、顧客情報を含む）をいう。
2. 受領者は、開示者の事前の書面による承諾なく、秘密情報を本目的以外のいかなる用途にも利用してはならず、また役員及び従業員以外の第三者に開示又は漏洩してはならない。
`).join('\n');

    const pdfBytes = await generatePdfFromMarkdown({
      title: '秘密保持契約書（長文テスト）',
      markdown: longMarkdown,
    });

    const doc = await PDFDocument.load(pdfBytes);
    // Should span multiple pages due to content volume
    expect(doc.getPageCount()).toBeGreaterThan(1);
  });

  it('should handle horizontal rules (---) and blockquotes (>) cleanly in PDF', async () => {
    const markdown = `# 区切り線テスト契約書

前文テキストです。

---

## 第1条（区切り後の条文）
本文テキストです。

> ※注意事項：本合意は守秘義務を含みます。

---

以上。`;

    const pdfBytes = await generatePdfFromMarkdown({
      title: '区切り線テスト契約書',
      markdown,
    });

    const doc = await PDFDocument.load(pdfBytes);
    expect(doc.getPageCount()).toBe(1);
  });
});

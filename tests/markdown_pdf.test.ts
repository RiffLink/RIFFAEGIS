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

  it('should render standard multi-article NDA cleanly with relaxed typography and no trailing blank page', async () => {
    // Structure matching user's NDA with full length clauses
    const ndaMarkdown = `# 秘密保持契約書

株式会社サンプル（以下「甲」という）と、参加者（以下「乙」という）は、以下のとおり合意する。

## 第1条（目的）
乙は、甲の新規サービス開発プロジェクトに参画し、技術的検証及び実装業務を行うにあたり知り得た情報を適切に保護・管理することを目的とする。

## 第2条（秘密情報の定義）
1. 本契約において「秘密情報」とは、甲が開示する技術情報、ノウハウ、ソースコード、アルゴリズム、財務情報その他一切の情報をいう。
2. 開示の形態が口頭、書面、電磁的記録を問わず秘密情報として取り扱うものとする。
3. 受領者は、開示者の事前の書面による承諾なく、秘密情報を第三者（受領者の業務委託先、関連会社等を含む）に開示、提供、漏洩、又は公開してはならない。
4. 受領者は、本目的のために秘密情報を知る合理的必要性のある自己の役員及び従業員（受領者が個人の場合は履行補助者。以下「役職員等」という）、並びに法令上守秘義務を負う外部の専門家（弁護士、公認会計士、税理士等）に対してのみ、必要な範囲内に限り秘密情報を開示することができる。ただし、受領者は、当該役職員等に対し、退職後も含め本契約と同等以上の秘密保持義務を課すものとし、当該役職員等の義務違反について、受領者が自ら違反した場合と同様の一切の責任を開示者に対して負うものとする。
5. 受領者は、開示者の事前の書面による承諾を得ることなく、秘密情報を第三者が提供する外部の生成系AIサービス、機械学習モデル、その他自動処理ツール等に入力、送信、又は学習させてはならない。

## 第3条（複製の制限及び解析の禁止）
1. 受領者は、本目的のために真に必要な最小限の範囲を超えて、開示者の秘密情報を複製（印刷、ダウンロード、スクリーンショットの取得、外部記憶媒体への保存等を含む）してはならない。なお、当該複製物はすべて原本と同様に秘密情報として取り扱うものとする。
2. 受領者は、開示者の秘密情報（ソフトウェア、ソースコード等を含む）について、リバースエンジニアリング、逆コンパイル、逆アセンブル、改変、翻案、その他これらに類する解析行為を行ってはならない。

## 第4条（知的財産権の帰属及び非許諾）
1. 開示者が受領者に開示した秘密情報に関する特許権、実用新案権、意匠権、商標権、著作権（著作権法第27条及び第28条に定める権利を含む）その他一切の知的財産権（それらを受ける権利を含む）及びノウハウ等は、すべて開示者に留保され、本契約による開示によって受領者に何らの権利も譲渡、移転、又は実施許諾（ライセンス）されるものではない。
2. 受領者は、開示者の事前の書面による承諾なく、開示者の秘密情報に基づいて特許出願、実用新案登録出願、意匠登録出願、商標登録出願等のいかなる知的財産権の権利化手続も行ってはならない。

## 第5条（法令等に基づく開示）
受領者は、法令又は裁判所その他の公的機関の命令により秘密情報の開示を求められた場合、必要最小限の範囲で開示できる。`;

    const pdfBytes = await generatePdfFromMarkdown({
      title: '秘密保持契約書',
      markdown: ndaMarkdown,
    });

    const doc = await PDFDocument.load(pdfBytes);
    const pageCount = doc.getPageCount();
    // Multi-page document without blank trailing page
    expect(pageCount).toBe(2);
  });
});


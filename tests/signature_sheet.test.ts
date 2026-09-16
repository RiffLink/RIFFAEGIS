import { describe, it, expect } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { fuseSignatureSheet } from '../lib/crypto/signature-sheet';
import { SignatureFusionConfig, getDefaultPartyFields } from '../lib/crypto/signature-types';
import fs from 'fs';

describe('Signature Sheet Fusion Engine', () => {
  it('should fuse signature block inline onto the last page without adding a page', async () => {
    // Create a 1-page sample PDF
    const pdfDoc = await PDFDocument.create();
    pdfDoc.addPage([595.28, 841.89]);
    const originalBytes = await pdfDoc.save();

    const config: SignatureFusionConfig = {
      enabled: true,
      placement: 'inline_margin',
      inlineMarginOffset: 40,
      agreementDateType: 'custom',
      customAgreementDate: '2026年9月15日',
      parties: [
        {
          roleName: '甲',
          roleDescription: '作成者',
          fields: [
            { id: 'a-company', key: 'company', label: '法人名 / 屋号', value: 'IRUMINation', enabled: true },
            { id: 'a-name', key: 'name', label: '氏名', value: '吉田 悠人', enabled: true },
            { id: 'a-custom-1', key: 'custom', label: '学籍番号', value: '2026CS001', enabled: true, isCustom: true },
          ],
        },
        {
          roleName: '乙',
          roleDescription: '署名者',
          fields: [
            { id: 'b-name', key: 'name', label: '氏名', value: 'テスト署名者', enabled: true },
            { id: 'b-address', key: 'address', label: '所在地 / 住所', value: '東京都渋谷区', enabled: true },
          ],
        },
      ],
    };

    const fusedBytes = await fuseSignatureSheet(originalBytes, config);
    expect(fusedBytes).toBeDefined();
    expect(fusedBytes.length).toBeGreaterThan(originalBytes.length);

    // Verify page count is still 1 (inline fusion)
    const resultDoc = await PDFDocument.load(fusedBytes);
    expect(resultDoc.getPageCount()).toBe(1);
  });

  it('should add a dedicated page when placement is new_page', async () => {
    const pdfDoc = await PDFDocument.create();
    pdfDoc.addPage([595.28, 841.89]);
    const originalBytes = await pdfDoc.save();

    const config: SignatureFusionConfig = {
      enabled: true,
      placement: 'new_page',
      inlineMarginOffset: 0,
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
          fields: getDefaultPartyFields('partyB'),
        },
      ],
    };

    const fusedBytes = await fuseSignatureSheet(originalBytes, config);
    const resultDoc = await PDFDocument.load(fusedBytes);

    // Should have 2 pages now
    expect(resultDoc.getPageCount()).toBe(2);
  });

  it('should return original PDF untouched if disabled', async () => {
    const pdfDoc = await PDFDocument.create();
    pdfDoc.addPage([595.28, 841.89]);
    const originalBytes = await pdfDoc.save();

    const config: SignatureFusionConfig = {
      enabled: false,
      placement: 'new_page',
      inlineMarginOffset: 0,
      agreementDateType: 'auto_on_sign',
      parties: [],
    };

    const result = await fuseSignatureSheet(originalBytes, config);
    expect(result).toBe(originalBytes);
  });
});

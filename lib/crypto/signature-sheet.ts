import { PDFDocument, rgb, StandardFonts, PDFFont } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { SignatureFusionConfig } from './signature-types';

/**
 * Loads Japanese TrueType font bytes from local cache or API/filesystem
 */
export async function loadJapaneseFont(): Promise<Uint8Array> {
  // If in browser, fetch from API
  if (typeof window !== 'undefined') {
    const res = await fetch('/api/fonts/japanese');
    if (!res.ok) {
      throw new Error(`Failed to load Japanese font: ${res.statusText}`);
    }
    const buf = await res.arrayBuffer();
    return new Uint8Array(buf);
  }

  // If in Node.js environment
  const fs = await import('fs');
  const path = await import('path');
  const fontCandidates = [
    path.join(process.cwd(), 'public/fonts/NotoSansJP-Regular.ttf'),
    '/System/Library/Fonts/Supplemental/AppleGothic.ttf',
    '/System/Library/Fonts/Supplemental/Arial Unicode.ttf',
    '/Library/Fonts/NotoSansJP-Regular.ttf',
    '/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc',
  ];
  for (const fPath of fontCandidates) {
    if (fs.existsSync(fPath)) {
      return fs.readFileSync(fPath);
    }
  }
  throw new Error('No Japanese font found on server');
}

/**
 * Calculate the total height required for the signature block
 */
export function calculateSignatureBlockHeight(config: SignatureFusionConfig): number {
  let height = 60; // header / date
  for (const party of config.parties) {
    const activeFields = party.fields.filter((f) => f.enabled);
    height += 28 + activeFields.length * 16 + 10;
  }
  return height;
}

/**
 * Fuse signature block into the PDF (either inline at the bottom of the last page or on a new page)
 */
export async function fuseSignatureSheet(
  originalPdfBytes: Uint8Array,
  config: SignatureFusionConfig,
  customFontBytes?: Uint8Array
): Promise<Uint8Array> {
  if (!config.enabled) {
    return originalPdfBytes;
  }

  const pdfDoc = await PDFDocument.load(originalPdfBytes);
  pdfDoc.registerFontkit(fontkit);

  const fontBytes = customFontBytes || (await loadJapaneseFont());
  const fontJp = await pdfDoc.embedFont(fontBytes, { subset: true });
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const primaryColor = rgb(0.08, 0.12, 0.22);
  const textDark = rgb(0.15, 0.15, 0.18);
  const textMuted = rgb(0.45, 0.45, 0.5);
  const borderGrey = rgb(0.82, 0.85, 0.9);
  const bgLight = rgb(0.97, 0.98, 1.0);

  const agreementDateStr =
    config.agreementDateType === 'custom' && config.customAgreementDate
      ? config.customAgreementDate
      : new Date().toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' });

  const leadText =
    config.leadText ||
    '本契約（合意）の成立を証するため、本書の電磁的記録を作成し、甲及び乙がそれぞれ電子署名を施す。';

  if (config.placement === 'inline_margin') {
    // ------------------------------------------------------------------
    // Option A: Render inline at the bottom margin of the last page
    // ------------------------------------------------------------------
    const pages = pdfDoc.getPages();
    const lastPage = pages[pages.length - 1];
    const { width } = lastPage.getSize();
    const margin = 45;
    const contentWidth = width - margin * 2;

    const blockHeight = calculateSignatureBlockHeight(config);
    // Y position from bottom
    const startY = Math.max(30, config.inlineMarginOffset || 40) + blockHeight;

    // Divider line
    lastPage.drawLine({
      start: { x: margin, y: startY },
      end: { x: width - margin, y: startY },
      thickness: 1,
      color: borderGrey,
    });

    let currentY = startY - 18;

    // Lead text & date
    lastPage.drawText(leadText, {
      x: margin,
      y: currentY,
      size: 8.5,
      font: fontJp,
      color: textMuted,
    });
    currentY -= 14;

    lastPage.drawText(`締結日： ${agreementDateStr}`, {
      x: margin,
      y: currentY,
      size: 9,
      font: fontJp,
      color: textDark,
    });
    currentY -= 20;

    // Parties side-by-side or stacked
    // If 2 parties and contentWidth > 450, render side-by-side columns
    const isTwoColumns = config.parties.length === 2 && contentWidth >= 440;
    const colWidth = isTwoColumns ? (contentWidth - 20) / 2 : contentWidth;

    for (let i = 0; i < config.parties.length; i++) {
      const party = config.parties[i];
      const activeFields = party.fields.filter((f) => f.enabled);
      const colX = isTwoColumns && i === 1 ? margin + colWidth + 20 : margin;
      const partyStartY = isTwoColumns ? currentY : currentY;

      // Party header tag
      lastPage.drawRectangle({
        x: colX,
        y: partyStartY - 16,
        width: 32,
        height: 16,
        color: primaryColor,
        borderWidth: 0,
      });
      lastPage.drawText(party.roleName, {
        x: colX + 9,
        y: partyStartY - 12,
        size: 9.5,
        font: fontJp,
        color: rgb(1, 1, 1),
      });

      if (party.roleDescription) {
        lastPage.drawText(`（${party.roleDescription}）`, {
          x: colX + 38,
          y: partyStartY - 12,
          size: 8.5,
          font: fontJp,
          color: textMuted,
        });
      }

      let fieldY = partyStartY - 30;
      for (const field of activeFields) {
        const val = field.value.trim() || '（署名時に確認・入力）';
        lastPage.drawText(`${field.label}：`, {
          x: colX + 6,
          y: fieldY,
          size: 8.5,
          font: fontJp,
          color: textMuted,
        });
        lastPage.drawText(val, {
          x: colX + 85,
          y: fieldY,
          size: 8.5,
          font: fontJp,
          color: textDark,
        });
        fieldY -= 14;
      }

      if (!isTwoColumns) {
        currentY = fieldY - 10;
      }
    }
  } else {
    // ------------------------------------------------------------------
    // Option B: Append a brand new formal Signature & Accord Sheet page
    // ------------------------------------------------------------------
    const newPage = pdfDoc.addPage([595.28, 841.89]); // A4
    const { width, height } = newPage.getSize();
    const margin = 45;
    const contentWidth = width - margin * 2;

    // Top Header Banner
    newPage.drawRectangle({
      x: margin,
      y: height - 90,
      width: contentWidth,
      height: 48,
      color: bgLight,
      borderColor: borderGrey,
      borderWidth: 1,
    });

    newPage.drawText('当事者署名・合意確認書', {
      x: margin + 18,
      y: height - 64,
      size: 14,
      font: fontJp,
      color: primaryColor,
    });

    newPage.drawText('SIGNATURE & ACCORD RECORD', {
      x: margin + 18,
      y: height - 78,
      size: 7.5,
      font: fontBold,
      color: textMuted,
    });

    let currentY = height - 120;

    // Preamble lead text
    newPage.drawText(leadText, {
      x: margin,
      y: currentY,
      size: 9.5,
      font: fontJp,
      color: textDark,
    });
    currentY -= 18;

    newPage.drawText(`契約締結日： ${agreementDateStr}`, {
      x: margin,
      y: currentY,
      size: 10,
      font: fontJp,
      color: primaryColor,
    });
    currentY -= 25;

    // Parties boxes
    for (const party of config.parties) {
      const activeFields = party.fields.filter((f) => f.enabled);
      const boxHeight = 40 + activeFields.length * 20;

      // Card background
      newPage.drawRectangle({
        x: margin,
        y: currentY - boxHeight,
        width: contentWidth,
        height: boxHeight,
        color: rgb(1, 1, 1),
        borderColor: borderGrey,
        borderWidth: 1,
      });

      // Role badge
      newPage.drawRectangle({
        x: margin + 14,
        y: currentY - 26,
        width: 34,
        height: 18,
        color: primaryColor,
      });
      newPage.drawText(party.roleName, {
        x: margin + 23,
        y: currentY - 22,
        size: 10,
        font: fontJp,
        color: rgb(1, 1, 1),
      });

      newPage.drawText(party.roleDescription ? `【${party.roleDescription}】` : '', {
        x: margin + 55,
        y: currentY - 22,
        size: 9.5,
        font: fontJp,
        color: textMuted,
      });

      let rowY = currentY - 48;
      for (const field of activeFields) {
        const val = field.value.trim() || '（署名時に確認・入力）';

        newPage.drawText(field.label, {
          x: margin + 20,
          y: rowY,
          size: 9,
          font: fontJp,
          color: textMuted,
        });

        newPage.drawText(val, {
          x: margin + 120,
          y: rowY,
          size: 9.5,
          font: fontJp,
          color: textDark,
        });

        rowY -= 19;
      }

      currentY -= boxHeight + 16;
    }

    // Security & Verification Footer
    const footerY = 55;
    newPage.drawLine({
      start: { x: margin, y: footerY + 22 },
      end: { x: width - margin, y: footerY + 22 },
      thickness: 1,
      color: borderGrey,
    });

    newPage.drawText(
      '※ 本書面はRiffAegis暗号化プロトコルに基づき原本末尾に結合され、耐量子署名およびNICT時刻記録により保護されています。',
      {
        x: margin,
        y: footerY + 8,
        size: 7.5,
        font: fontJp,
        color: textMuted,
      }
    );
    newPage.drawText('SECURED WITH ML-DSA-65 / WEBAUTHN / ZERO-KNOWLEDGE PROTOCOL', {
      x: margin,
      y: footerY - 4,
      size: 7,
      font: fontRegular,
      color: rgb(0.6, 0.65, 0.7),
    });
  }

  return await pdfDoc.save();
}

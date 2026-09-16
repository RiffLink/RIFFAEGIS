import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { loadJapaneseFont } from '../crypto/signature-sheet';

export interface MarkdownContractOptions {
  title?: string;
  markdown: string;
}

/**
 * Strips inline markdown tokens (**bold**, *italic*, `code`) for clean PDF typesetting
 */
function stripMarkdownSyntax(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/__(.*?)__/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/_(.*?)_/g, '$1')
    .replace(/`([^`]+)`/g, '$1');
}

/**
 * Generate clean A4 PDF bytes directly from Markdown contract text in the browser
 */
export async function generatePdfFromMarkdown(options: MarkdownContractOptions): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);

  const fontBytes = await loadJapaneseFont();
  const fontJp = await pdfDoc.embedFont(fontBytes, { subset: true });
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  let contentMarkdown = options.markdown.trim();
  const hasH1 = contentMarkdown.split('\n').some((line) => line.trim().startsWith('# '));
  if (!hasH1 && options.title && options.title.trim()) {
    contentMarkdown = `# ${options.title.trim()}\n\n` + contentMarkdown;
  }

  const lines = contentMarkdown.split('\n');
  // Trim trailing empty lines
  while (lines.length > 0 && !lines[lines.length - 1].trim()) {
    lines.pop();
  }

  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const margin = 48;
  const contentWidth = pageWidth - margin * 2;

  let currentPage = pdfDoc.addPage([pageWidth, pageHeight]);
  let currentY = pageHeight - margin;

  const ensureSpace = (neededHeight: number) => {
    if (currentY - neededHeight < margin) {
      currentPage = pdfDoc.addPage([pageWidth, pageHeight]);
      currentY = pageHeight - margin;
    }
  };

  // Helper to wrap and draw multi-line text cleanly across page boundaries
  const wrapAndDraw = (
    text: string,
    x: number,
    maxWidth: number,
    fontSize: number,
    color = rgb(0.15, 0.15, 0.18)
  ) => {
    const charsPerLine = Math.max(1, Math.floor(maxWidth / (fontSize * 0.95)));
    for (let idx = 0; idx < text.length; idx += charsPerLine) {
      ensureSpace(fontSize + 6);
      const chunk = text.slice(idx, idx + charsPerLine);
      currentPage.drawText(chunk, {
        x,
        y: currentY,
        size: fontSize,
        font: fontJp,
        color,
      });
      currentY -= fontSize + 5;
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i].trimEnd();

    // Empty line
    if (!rawLine.trim()) {
      currentY -= 10;
      continue;
    }

    // H1 Heading (# Heading)
    if (rawLine.startsWith('# ')) {
      ensureSpace(55);
      const text = rawLine.replace(/^#\s+/, '').trim();
      currentY -= 14;
      const titleSize = 18;
      const textWidth = fontJp.widthOfTextAtSize(text, titleSize);
      const centerX = Math.max(margin, (pageWidth - textWidth) / 2);

      // Centered Title (matching editor preview)
      currentPage.drawText(text, {
        x: centerX,
        y: currentY,
        size: titleSize,
        font: fontJp,
        color: rgb(0.08, 0.12, 0.22),
      });

      currentY -= 12;
      // Bottom divider line (matching editor preview border-b border-slate-300)
      currentPage.drawLine({
        start: { x: margin, y: currentY },
        end: { x: pageWidth - margin, y: currentY },
        thickness: 0.75,
        color: rgb(0.8, 0.82, 0.86),
      });

      currentY -= 20;
      continue;
    }

    // H2 Heading (## Heading or Article title like **第1条...** or 第1条...)
    if (
      rawLine.startsWith('## ') ||
      /^\*\*第\d+条.*?\*\*$/.test(rawLine.trim()) ||
      (/^第\d+条/.test(rawLine.trim()) && rawLine.length < 35)
    ) {
      ensureSpace(34);
      currentY -= 10;
      let text = rawLine.replace(/^##\s+/, '').trim();
      text = stripMarkdownSyntax(text);

      const headingSize = 12;

      // Draw blue vertical accent line (matching editor preview: border-l-3 border-[#0284c7])
      currentPage.drawRectangle({
        x: margin,
        y: currentY - 2,
        width: 3,
        height: headingSize + 2,
        color: rgb(0.01, 0.52, 0.78),
      });

      currentPage.drawText(text, {
        x: margin + 8,
        y: currentY,
        size: headingSize,
        font: fontJp,
        color: rgb(0.08, 0.12, 0.22),
      });
      currentY -= 16;
      continue;
    }

    // H3 Heading (### Heading)
    if (rawLine.startsWith('### ')) {
      ensureSpace(24);
      const text = stripMarkdownSyntax(rawLine.replace(/^###\s+/, ''));
      currentY -= 4;
      currentPage.drawText(text, {
        x: margin,
        y: currentY,
        size: 10.5,
        font: fontJp,
        color: rgb(0.15, 0.25, 0.4),
      });
      currentY -= 16;
      continue;
    }

    // Horizontal Rule (--- or *** or ___)
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(rawLine.trim())) {
      ensureSpace(24);
      currentY -= 8;
      currentPage.drawLine({
        start: { x: margin, y: currentY },
        end: { x: margin + contentWidth, y: currentY },
        thickness: 0.75,
        color: rgb(0.8, 0.82, 0.86),
      });
      currentY -= 14;
      continue;
    }

    // Blockquote (> text)
    if (rawLine.trim().startsWith('>')) {
      const quoteText = stripMarkdownSyntax(rawLine.trim().replace(/^>\s*/, ''));
      const startY = currentY;
      wrapAndDraw(quoteText, margin + 14, contentWidth - 16, 8.5, rgb(0.3, 0.35, 0.4));
      // Accent line on the left
      currentPage.drawLine({
        start: { x: margin + 4, y: startY + 2 },
        end: { x: margin + 4, y: currentY + 4 },
        thickness: 2,
        color: rgb(0.01, 0.52, 0.78),
      });
      currentY -= 6;
      continue;
    }

    // Ordered / Numbered list item (e.g. 1. item, (1) item)
    if (/^(\d+\.|\(\d+\))\s+/.test(rawLine.trim())) {
      const text = stripMarkdownSyntax(rawLine.trim());
      wrapAndDraw(text, margin + 12, contentWidth - 12, 9.5);
      continue;
    }

    // List item (- item or * item)
    if (/^[-*]\s+/.test(rawLine)) {
      const text = stripMarkdownSyntax(rawLine.replace(/^[-*]\s+/, ''));
      wrapAndDraw(`・ ${text}`, margin + 12, contentWidth - 12, 9.5);
      continue;
    }

    // Standard paragraph
    wrapAndDraw(stripMarkdownSyntax(rawLine), margin, contentWidth, 9.5);
  }

  // If the last page ended up completely blank, remove it
  const pageCount = pdfDoc.getPageCount();
  if (pageCount > 1 && currentY === pageHeight - margin) {
    pdfDoc.removePage(pageCount - 1);
  }

  return await pdfDoc.save();
}

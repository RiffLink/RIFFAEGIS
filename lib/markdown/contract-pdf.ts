import { PDFDocument, StandardFonts, rgb, PDFFont } from 'pdf-lib';
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
      ensureSpace(20);
      currentY -= 4;
      const startY = currentY;
      wrapAndDrawText(currentPage, quoteText, margin + 14, contentWidth - 16, 8.5, fontJp, ensureSpace, (newY) => {
        // Draw vertical accent border for quote
        currentPage.drawLine({
          start: { x: margin + 4, y: startY + 6 },
          end: { x: margin + 4, y: newY - 2 },
          thickness: 2,
          color: rgb(0.01, 0.52, 0.78),
        });
        currentY = newY - 6;
      }, currentY);
      continue;
    }

    // Ordered / Numbered list item (e.g. 1. item, (1) item)
    if (/^(\d+\.|\(\d+\))\s+/.test(rawLine.trim())) {
      const text = stripMarkdownSyntax(rawLine.trim());
      wrapAndDrawText(currentPage, text, margin + 12, contentWidth - 12, 9.5, fontJp, ensureSpace, (newY) => {
        currentY = newY;
      }, currentY);
      continue;
    }

    // List item (- item or * item)
    if (/^[-*]\s+/.test(rawLine)) {
      const text = stripMarkdownSyntax(rawLine.replace(/^[-*]\s+/, ''));
      wrapAndDrawText(currentPage, `・ ${text}`, margin + 12, contentWidth - 12, 9.5, fontJp, ensureSpace, (newY) => {
        currentY = newY;
      }, currentY);
      continue;
    }

    // Standard paragraph
    wrapAndDrawText(currentPage, stripMarkdownSyntax(rawLine), margin, contentWidth, 9.5, fontJp, ensureSpace, (newY) => {
      currentY = newY;
    }, currentY);
  }

  return await pdfDoc.save();
}

/**
 * Helper to wrap text according to line width
 */
function wrapAndDrawText(
  page: any,
  text: string,
  x: number,
  maxWidth: number,
  fontSize: number,
  font: PDFFont,
  ensureSpace: (h: number) => void,
  setY: (y: number) => void,
  initialY: number
) {
  let y = initialY;
  // Estimate character width for Japanese full-width vs ASCII
  const charsPerLine = Math.floor(maxWidth / (fontSize * 0.95));

  for (let idx = 0; idx < text.length; idx += charsPerLine) {
    ensureSpace(fontSize + 5);
    const chunk = text.slice(idx, idx + charsPerLine);
    page.drawText(chunk, {
      x,
      y,
      size: fontSize,
      font,
      color: rgb(0.15, 0.15, 0.18),
    });
    y -= fontSize + 4;
  }
  setY(y);
}

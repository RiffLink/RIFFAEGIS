import { PDFDocument, StandardFonts, rgb, PDFFont } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { loadJapaneseFont } from '../crypto/signature-sheet';

export interface MarkdownContractOptions {
  title?: string;
  markdown: string;
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
      ensureSpace(40);
      const text = rawLine.replace(/^#\s+/, '');
      currentY -= 8;
      currentPage.drawText(text, {
        x: margin,
        y: currentY,
        size: 16,
        font: fontJp,
        color: rgb(0.08, 0.12, 0.22),
      });
      currentY -= 24;
      continue;
    }

    // H2 Heading (## Heading)
    if (rawLine.startsWith('## ')) {
      ensureSpace(30);
      const text = rawLine.replace(/^##\s+/, '');
      currentY -= 6;
      currentPage.drawText(text, {
        x: margin,
        y: currentY,
        size: 12,
        font: fontJp,
        color: rgb(0.12, 0.2, 0.35),
      });
      currentY -= 18;
      continue;
    }

    // H3 Heading (### Heading)
    if (rawLine.startsWith('### ')) {
      ensureSpace(24);
      const text = rawLine.replace(/^###\s+/, '');
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

    // List item (- item or * item)
    if (/^[-*]\s+/.test(rawLine)) {
      const text = rawLine.replace(/^[-*]\s+/, '');
      wrapAndDrawText(currentPage, `・ ${text}`, margin + 10, contentWidth - 10, 9, fontJp, ensureSpace, (newY) => {
        currentY = newY;
      }, currentY);
      continue;
    }

    // Standard paragraph
    wrapAndDrawText(currentPage, rawLine, margin, contentWidth, 9.5, fontJp, ensureSpace, (newY) => {
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

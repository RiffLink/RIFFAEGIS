import { NextResponse } from 'next/server';
import fs from 'fs';

import path from 'path';

export const dynamic = 'force-static';

export async function GET() {
  const fontCandidates = [
    path.join(process.cwd(), 'public/fonts/NotoSansJP-Regular.ttf'),
    '/System/Library/Fonts/Supplemental/AppleGothic.ttf',
    '/System/Library/Fonts/Supplemental/Arial Unicode.ttf',
    '/Library/Fonts/NotoSansJP-Regular.ttf',
    '/System/Library/Fonts/Hiragino Sans GB.ttc',
    '/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc',
    '/usr/share/fonts/truetype/fonts-japanese-gothic.ttf',
  ];

  for (const fPath of fontCandidates) {
    try {
      if (fs.existsSync(/*turbopackIgnore: true*/ fPath)) {
        const fontBuffer = fs.readFileSync(/*turbopackIgnore: true*/ fPath);
        return new NextResponse(fontBuffer, {
          status: 200,
          headers: {
            'Content-Type': 'font/ttf',
            'Cache-Control': 'public, max-age=31536000, immutable',
          },
        });
      }
    } catch {
      // try next
    }
  }

  return new NextResponse('Font not found', { status: 404 });
}

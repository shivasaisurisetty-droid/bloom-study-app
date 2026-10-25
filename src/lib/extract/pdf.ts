/**
 * Low-level PDF reading with mupdf (WASM). Produces per-character geometry plus the
 * yellow "highlight" rectangles the solution PDFs use to mark answers.
 * This module only reads; it never interprets or guesses.
 */

export interface Char {
  ch: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** [r,g,b] 0..1 */
  color: number[];
  font: string;
  hl: boolean;
}

export interface Line {
  page: number;
  chars: Char[];
  /** Top of the line (y-down page space). */
  y: number;
  x: number;
}

export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  color: number[];
}

export interface PageData {
  page: number;
  lines: Line[];
  highlights: Rect[];
  otherFills: number;
  charCount: number;
}

export interface PdfData {
  pages: PageData[];
  pageCount: number;
  textChars: number;
}

const ZERO_WIDTH = new RegExp("[\\u200b-\\u200d\\u2060\\ufeff]");

function isYellow(c: number[]): boolean {
  return c.length >= 3 && c[0] >= 0.9 && c[1] >= 0.9 && c[2] <= 0.5;
}

function isNearWhite(c: number[]): boolean {
  return c.length >= 3 && c[0] >= 0.97 && c[1] >= 0.97 && c[2] >= 0.97;
}

export async function readPdf(data: Uint8Array): Promise<PdfData> {
  const mupdf = await import("mupdf");
  const doc = mupdf.Document.openDocument(data, "application/pdf");
  const pageCount = doc.countPages();
  const pages: PageData[] = [];
  let textChars = 0;

  const stroke = new mupdf.StrokeState({
    lineCap: "Butt",
    lineJoin: "Miter",
    lineWidth: 0,
    miterLimit: 10,
  });

  for (let p = 0; p < pageCount; p++) {
    const page = doc.loadPage(p);
    const highlights: Rect[] = [];
    let otherFills = 0;

    const device = new mupdf.Device({
      fillPath(path, _evenOdd, ctm, _cs, color) {
        const b = path.getBounds(stroke, ctm);
        const rect: Rect = { x0: b[0], y0: b[1], x1: b[2], y1: b[3], color };
        if (isYellow(color)) highlights.push(rect);
        else if (!isNearWhite(color) && b[2] - b[0] > 2 && b[3] - b[1] > 2) otherFills++;
      },
    });
    page.run(device, mupdf.Matrix.identity);

    const lines: Line[] = [];
    let current: Char[] = [];
    let lineBox: number[] = [0, 0, 0, 0];
    const st = page.toStructuredText("preserve-whitespace");
    st.walk({
      beginLine(bbox) {
        current = [];
        lineBox = bbox as unknown as number[];
      },
      onChar(c, _origin, font, _size, quad, color) {
        const xs = [quad[0], quad[2], quad[4], quad[6]];
        const ys = [quad[1], quad[3], quad[5], quad[7]];
        current.push({
          ch: c,
          x0: Math.min(...xs),
          x1: Math.max(...xs),
          y0: Math.min(...ys),
          y1: Math.max(...ys),
          color: color as unknown as number[],
          font: font.getName(),
          hl: false,
        });
      },
      endLine() {
        const chars = current.filter((c) => !ZERO_WIDTH.test(c.ch));
        if (chars.length) lines.push({ page: p + 1, chars, y: lineBox[1], x: lineBox[0] });
      },
    });

    // Content streams can draw header/footer text late: restore visual reading order.
    lines.sort((a, b) => (Math.abs(a.y - b.y) < 2 ? a.x - b.x : a.y - b.y));

    // Mark characters whose centre lies under a highlight rectangle.
    let charCount = 0;
    for (const line of lines) {
      for (const ch of line.chars) {
        const cx = (ch.x0 + ch.x1) / 2;
        const cy = (ch.y0 + ch.y1) / 2;
        ch.hl = highlights.some((r) => cx >= r.x0 - 0.5 && cx <= r.x1 + 0.5 && cy >= r.y0 && cy <= r.y1);
        if (ch.ch.trim()) charCount++;
      }
    }
    textChars += charCount;
    pages.push({ page: p + 1, lines, highlights, otherFills, charCount });
  }
  return { pages, pageCount, textChars };
}

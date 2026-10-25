import fs from "node:fs";
import { readPdf } from "../src/lib/extract/pdf";

async function main() {
  const f = process.argv[2];
  const d = await readPdf(new Uint8Array(fs.readFileSync(f)));
  for (const p of d.pages) {
    console.log(`--- page ${p.page} chars=${p.charCount} hl=${p.highlights.length} otherFills=${p.otherFills}`);
    for (const l of p.lines) {
      const t = l.chars.map((c) => (c.hl ? `«${c.ch}»` : c.ch)).join("").replace(/»«/g, "");
      console.log(`y=${l.y.toFixed(0).padStart(3)} | ${t}`);
    }
  }
}
main();

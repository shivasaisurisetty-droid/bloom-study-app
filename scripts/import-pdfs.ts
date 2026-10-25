/**
 * Import the solution PDFs → data/questions.json (+ copies PDFs to public/sources).
 *
 *   npm run import:pdfs -- /path/to/folder/with/pdfs
 *
 * Files are assigned to a week from their filename ("WEEK_4_…"), and the printed
 * heading inside the PDF is cross-checked.
 */
import fs from "node:fs";
import path from "node:path";
import { displayFilename, extractPdf, inferWeekFromFilename } from "../src/lib/extract";
import type { Dataset, Question, WeekMeta } from "../src/lib/types";

async function main() {
  const dir = process.argv[2];
  if (!dir || !fs.existsSync(dir)) {
    console.error("Usage: npm run import:pdfs -- <folder with the 12 PDFs>");
    process.exit(1);
  }
  const root = path.resolve(__dirname, "..");
  const outSources = path.join(root, "public", "sources");
  fs.mkdirSync(outSources, { recursive: true });

  const files = fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith(".pdf"));
  const byWeek = new Map<number, string>();
  for (const f of files) {
    const w = inferWeekFromFilename(f);
    if (!w || w < 1 || w > 12) {
      console.warn(`! Skipping ${f}: cannot tell which week (1-12) it belongs to.`);
      continue;
    }
    if (byWeek.has(w)) console.warn(`! Week ${w} has more than one PDF; using ${f}.`);
    byWeek.set(w, f);
  }

  const weeks: WeekMeta[] = [];
  const questions: Question[] = [];
  for (let w = 1; w <= 12; w++) {
    const f = byWeek.get(w);
    if (!f) {
      weeks.push({ week: w, file: null, heading: null, pages: 0, textChars: 0, needsOcr: false, issues: ["No PDF supplied for this week."] });
      console.log(`Week ${String(w).padStart(2)}: MISSING`);
      continue;
    }
    const display = displayFilename(f);
    const buf = fs.readFileSync(path.join(dir, f));
    const res = await extractPdf(new Uint8Array(buf), { week: w, file: display });
    fs.copyFileSync(path.join(dir, f), path.join(outSources, display));
    weeks.push(res.meta);
    questions.push(...res.questions);
    const v = res.questions.filter((q) => q.verification.status === "verified").length;
    console.log(`Week ${String(w).padStart(2)}: ${display} → ${res.questions.length} questions, ${v} verified, ${res.questions.length - v} flagged${res.meta.issues.length ? " | " + res.meta.issues.join(" / ") : ""}`);
  }
  const dataset: Dataset = { generatedAt: new Date().toISOString(), weeks, questions };
  fs.writeFileSync(path.join(root, "data", "questions.json"), JSON.stringify(dataset, null, 2) + "\n");
  console.log(`\nWrote data/questions.json (${questions.length} questions).`);
}

main();

# Bloom — Your Study Buddy 🌱

A friendly, motivating quiz study app for NPTEL *Public Speaking* (Weeks 1–12). Practice any combination of weeks in shuffled order, study at your own pace, and track real progress. Every question, answer and
source reference comes **only** from the 12 solution PDFs. Nothing is invented or guessed.

- Next.js (App Router) · TypeScript · Tailwind CSS v4 · Lucide icons · mupdf (WASM) for PDF reading · Vitest · Playwright
- Student features: Home, Weeks, Practice (any weeks, shuffled, balanced), Study, Bookmarks/Review, Progress
- Admin: `/admin` import & verification dashboard (upload PDFs, inspect, correct, export dataset)
- No database and no login: progress is saved in the browser (`localStorage`) **on that device only**.
  There is **no cross-device sync**.

## What was extracted from the PDFs

| | |
|---|---|
| PDFs | 12 (Weeks 1–12), all selectable-text, 2 pages each — no OCR needed |
| Questions | 120 (10 per week): MCQ, fill-in-the-blank (bracketed options), True/False |
| Verified | 120 / 120 |
| Explanations | None of the PDFs contain any, so the app shows *"No explanation provided in the source PDF."* |
| Numeric / multi-select | None appear in these PDFs (the engine supports multi-select with exact-set scoring; numeric is not implemented because no source needs it) |

### How answers are found (and why they are trustworthy)
The PDFs mark answers in four ways; the importer reads each one and refuses to guess:

1. **Yellow highlight** on the correct option (Weeks 1, 3, 4, 5\*, 6, 7, 8, 9, 10, 12)
2. **"Accepted Answers:"** line (Week 2)
3. **"Answer: (X)"** line **plus a ✓ marker** that must agree (Week 11)
4. **Printed T/F** after a statement (Weeks 5–8, 10, 12) — cross-checked against a highlight where one exists

\* Week 5 fill-in/MCQ answers are highlighted; its True/False answers are printed letters.

A question is **verified** only if exactly one answer is marked, all signals agree, the structural audit
(`src/lib/extract/verify.ts`) passes, and the answer maps to a real option. Otherwise it becomes
*needs verification* / *failed extraction* and is **excluded from scored practice and study**.
Special case: Week 3 Q5 says "[Both options are correct]" → either option is accepted.

Independent check: `python3 scripts/crosscheck.py` re-reads every PDF with a *different* library
(pdfplumber) and confirms each stored correct option really is highlighted/printed (121/121 match).

Each question stores its source file and PDF page, shown as e.g. `Source: WEEK_4_ASSIGNMENT_4.pdf · PDF page 2`,
with an "Open page" link (the PDFs are served from `/sources/`) and the raw extracted text.

> The PDFs contain no topic titles (just "Assignment N"), so weeks are shown as "Week N".
> The PDFs are copied into `public/sources/` and are therefore publicly reachable at your deployed URL.
> Remove them (and the "Open page" links will stop working) if you don't want that.

## Run locally
```bash
cd bloom
npm install
cp .env.example .env.local     # optional: set ADMIN_TOKEN to enable the /admin importer
npm run dev                    # http://localhost:3000
```

## Checks
```bash
npm run typecheck && npm run lint && npm test && npm run build
# Browser smoke test (needs Playwright Chromium; server must be running):
npx next start -p 3100 &  node scripts/e2e-smoke.cjs
```
`npm test` covers extraction (never-guess rules, ambiguity, duplicates, hyphen wraps), the committed
dataset (all 12 weeks, source refs, re-extraction reproduces it byte-for-byte), shuffle, balanced
selection, no repeats, option-shuffle vs answer key, single/multi/either scoring, session scoring,
week status, streak, and persistence across a simulated refresh.

## Re-importing / changing the data
```bash
npm run import:pdfs -- /path/to/folder/with/pdfs   # files must contain "WEEK_<n>" in the name
```
This rewrites `data/questions.json` and copies PDFs to `public/sources/`.
Or use **/admin** (needs `ADMIN_TOKEN`): upload per week, inspect counts, correct questionable items
(“I checked the PDF — mark verified”), then **Download questions.json**, replace `data/questions.json`,
put the PDFs in `public/sources/`, commit and push. Corrections made in the browser are local until exported.

## Deploy to Vercel
This app lives in the `bloom/` folder of the repo.
1. Push the branch to GitHub.
2. Vercel → **Add New → Project** → import the repo.
3. **Root Directory: `bloom`**. Framework: Next.js (auto-detected). Build/Install commands: defaults.
4. *(Optional, for /admin uploads)* add env var `ADMIN_TOKEN` = a long random string.
5. Deploy and share the URL. The student app works without any env vars.

Notes: uploads are limited to 4 MB/PDF (Vercel request limit). No secrets are exposed to the browser;
`ADMIN_TOKEN` is only read in the API route. No Supabase/database is used in this version.

## Scoring rules
One point per question; skipped ≠ correct; multi-select needs the exact set; "both correct" accepts either;
unverified questions are never scored. Week status: *Not started* → *In progress* → *Practiced*
(all answered, some latest answers wrong) → *Completed* (all answered, latest answer to each is right).
Streak is only a gentle note and never shown as pressure.

## Not done / limitations
- OCR for scanned PDFs is **not implemented** (the importer detects pages without text and reports them).
  None of the 12 PDFs need it.
- No accounts or cross-device sync (would need Supabase/auth — not built).
- Actual deployment to Vercel was **not performed** from this environment; the production build and a local
  production server were tested.

## Before making the repo public
The 12 solution PDFs are committed in `bloom/public/sources/` and are publicly downloadable once deployed.
If they are course material you don't have the right to redistribute, remove them (and set the app's
"Open page" links aside) before pushing to a public GitHub repo — `data/questions.json` alone is enough for the app to run.

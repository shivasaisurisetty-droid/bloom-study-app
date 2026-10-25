"use client";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Download, FileUp, HelpCircle, Loader2, ShieldCheck } from "lucide-react";
import { Badge, Button, Card, cx, PageHeader } from "@/components/ui";
import { dataset, getOverrides, saveOverrides, useQuestions, WEEKS } from "@/lib/data";
import { auditQuestion } from "@/lib/extract/verify";
import type { Dataset, Question, QuestionType, VerificationStatus, WeekMeta } from "@/lib/types";

interface Imported {
  meta: WeekMeta;
  questions: Question[];
}

const STATUS_TONE: Record<VerificationStatus, "sage" | "rose" | "gray"> = {
  verified: "sage",
  needs_verification: "rose",
  failed_extraction: "gray",
};
const STATUS_LABEL: Record<VerificationStatus, string> = {
  verified: "Verified",
  needs_verification: "Needs verification",
  failed_extraction: "Failed extraction",
};

export default function AdminPage() {
  const withOverrides = useQuestions();
  const [imported, setImported] = useState<Record<number, Imported>>({});
  const [token, setToken] = useState("");
  const [files, setFiles] = useState<Record<number, File | undefined>>({});
  const [busy, setBusy] = useState<Record<number, boolean>>({});
  const [errors, setErrors] = useState<Record<number, string>>({});
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [filterWeek, setFilterWeek] = useState<number | "all">("all");
  const [filterStatus, setFilterStatus] = useState<VerificationStatus | "all">("needs_verification");

  useEffect(() => {
    let live = true;
    fetch("/api/admin/extract")
      .then((r) => r.json())
      .then((j: { enabled: boolean }) => live && setEnabled(j.enabled))
      .catch(() => live && setEnabled(false));
    return () => {
      live = false;
    };
  }, []);

  // Imported weeks replace the bundled week; local corrections are applied on top by id.
  const working = useMemo(() => {
    const ov = getOverrides();
    const byWeek = new Map<number, Question[]>();
    for (const q of dataset.questions) {
      if (imported[q.week]) continue;
      byWeek.set(q.week, [...(byWeek.get(q.week) ?? []), q]);
    }
    for (const [w, r] of Object.entries(imported)) byWeek.set(Number(w), r.questions);
    return [...byWeek.entries()]
      .sort((a, b) => a[0] - b[0])
      .flatMap(([, qs]) => qs)
      .map((q) => (ov[q.id] ? ({ ...q, ...ov[q.id] } as Question) : q));
    // withOverrides is a dependency so edits re-render the list
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imported, withOverrides]);

  const metaFor = (w: number): WeekMeta | undefined => imported[w]?.meta ?? dataset.weeks.find((m) => m.week === w);

  async function process(w: number) {
    const file = files[w];
    if (!file) return;
    setBusy((b) => ({ ...b, [w]: true }));
    setErrors((e) => ({ ...e, [w]: "" }));
    try {
      const fd = new FormData();
      fd.set("file", file);
      fd.set("week", String(w));
      const res = await fetch("/api/admin/extract", { method: "POST", headers: { "x-admin-token": token }, body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Something went wrong.");
      setImported((i) => ({ ...i, [w]: json as Imported }));
    } catch (e) {
      setErrors((er) => ({ ...er, [w]: e instanceof Error ? e.message : "Something went wrong." }));
    } finally {
      setBusy((b) => ({ ...b, [w]: false }));
    }
  }

  function updateQuestion(id: string, patch: Partial<Question>) {
    const ov = getOverrides();
    saveOverrides({ ...ov, [id]: { ...(ov[id] ?? {}), ...patch } });
  }

  function download() {
    const weeks: WeekMeta[] = WEEKS.map((w) => metaFor(w) ?? { week: w, file: null, heading: null, pages: 0, textChars: 0, needsOcr: false, issues: ["No PDF supplied for this week."] });
    const out: Dataset = { generatedAt: new Date().toISOString(), weeks, questions: working };
    const blob = new Blob([JSON.stringify(out, null, 2) + "\n"], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "questions.json";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const counts = WEEKS.map((w) => {
    const qs = working.filter((q) => q.week === w);
    return {
      w,
      total: qs.length,
      verified: qs.filter((q) => q.verification.status === "verified").length,
      needs: qs.filter((q) => q.verification.status === "needs_verification").length,
      failed: qs.filter((q) => q.verification.status === "failed_extraction").length,
    };
  });
  const totals = counts.reduce((a, c) => ({ total: a.total + c.total, verified: a.verified + c.verified, needs: a.needs + c.needs, failed: a.failed + c.failed }), { total: 0, verified: 0, needs: 0, failed: 0 });

  const shown = working.filter((q) => (filterWeek === "all" || q.week === filterWeek) && (filterStatus === "all" || q.verification.status === filterStatus));
  const hasOverrides = Object.keys(getOverrides()).length > 0;

  return (
    <>
      <PageHeader title="Import & verification" subtitle="For the person who set this app up. Upload solution PDFs, see exactly what was extracted, and review anything uncertain before it reaches practice." />

      <Card className="mb-5">
        <h2 className="text-xl font-semibold text-rose-800">Extraction status</h2>
        <p className="mt-1 text-sm text-muted">
          {totals.total} questions · <strong className="text-sage-700">{totals.verified} verified</strong> · {totals.needs} need verification · {totals.failed} failed extraction. Only verified questions appear in practice and study.
        </p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[34rem] text-left text-sm">
            <caption className="sr-only">Per-week extraction results</caption>
            <thead className="text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="py-2 pr-3">Week</th>
                <th className="pr-3">Source PDF</th>
                <th className="pr-3 text-right">Pages</th>
                <th className="pr-3 text-right">Extracted</th>
                <th className="pr-3 text-right">Verified</th>
                <th className="pr-3 text-right">Unverified</th>
                <th className="text-right">Failed</th>
              </tr>
            </thead>
            <tbody>
              {counts.map((c) => {
                const m = metaFor(c.w);
                return (
                  <tr key={c.w} className="border-t border-blush-100 align-top">
                    <td className="py-2 pr-3 font-semibold text-rose-800">{c.w}</td>
                    <td className="pr-3">
                      {m?.file ?? <span className="text-rose-700">missing</span>}
                      {m && m.issues.length > 0 && (
                        <span className="mt-0.5 block text-xs text-muted">
                          {m.issues.map((i) => (
                            <span key={i} className="block">⚠ {i}</span>
                          ))}
                        </span>
                      )}
                    </td>
                    <td className="pr-3 text-right">{m?.pages ?? 0}</td>
                    <td className="pr-3 text-right">{c.total}</td>
                    <td className="pr-3 text-right text-sage-700">{c.verified}</td>
                    <td className="pr-3 text-right">{c.needs}</td>
                    <td className="text-right">{c.failed}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="mb-5">
        <h2 className="flex items-center gap-2 text-xl font-semibold text-rose-800">
          <FileUp size={20} aria-hidden="true" /> Import PDFs
        </h2>
        {enabled === false && (
          <p className="mt-2 flex items-start gap-2 rounded-2xl bg-blush-100 p-3 text-sm text-rose-800" role="status">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
            The importer is switched off on this deployment. Set <code>ADMIN_TOKEN</code> (see <code>.env.example</code>) to enable uploads. Reviewing the bundled data below still works.
          </p>
        )}
        <label className="mt-3 block text-sm font-semibold">
          Admin token
          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            autoComplete="off"
            className="mt-1 block w-full max-w-sm rounded-xl border border-blush-200 px-3 py-2 font-normal"
          />
        </label>
        <ul className="mt-4 grid gap-2">
          {WEEKS.map((w) => (
            <li key={w} className="flex flex-wrap items-center gap-3 rounded-2xl bg-blush-50 px-3 py-2">
              <span className="w-16 font-semibold text-rose-800">Week {w}</span>
              <input
                type="file"
                accept="application/pdf"
                aria-label={`PDF for week ${w}`}
                onChange={(e) => setFiles((f) => ({ ...f, [w]: e.target.files?.[0] }))}
                className="min-w-0 flex-1 text-sm"
              />
              <Button variant="soft" className="!min-h-10 !py-1.5" disabled={!files[w] || !token || busy[w]} onClick={() => process(w)}>
                {busy[w] ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : null}
                Process
              </Button>
              {imported[w] && <Badge tone="sage">{imported[w].questions.length} extracted</Badge>}
              {errors[w] && <span className="w-full text-sm text-rose-700" role="alert">{errors[w]}</span>}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-muted">
          Each week is matched to the number you choose here, and the heading printed inside the PDF is cross-checked — a mismatch is reported above. Scanned PDFs without selectable text are reported as needing OCR; this importer does not guess their contents.
        </p>
      </Card>

      <Card className="mb-5">
        <h2 className="flex items-center gap-2 text-xl font-semibold text-rose-800">
          <ShieldCheck size={20} aria-hidden="true" /> Review &amp; correct
        </h2>
        <div className="mt-3 flex flex-wrap gap-3">
          <label className="text-sm font-semibold">
            Week
            <select value={filterWeek} onChange={(e) => setFilterWeek(e.target.value === "all" ? "all" : Number(e.target.value))} className="ml-2 rounded-xl border border-blush-200 px-2 py-1.5 font-normal">
              <option value="all">All</option>
              {WEEKS.map((w) => (
                <option key={w} value={w}>
                  {w}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-semibold">
            Status
            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as VerificationStatus | "all")} className="ml-2 rounded-xl border border-blush-200 px-2 py-1.5 font-normal">
              <option value="all">All</option>
              <option value="needs_verification">Needs verification</option>
              <option value="failed_extraction">Failed extraction</option>
              <option value="verified">Verified</option>
            </select>
          </label>
          <span className="self-center text-sm text-muted">{shown.length} shown</span>
        </div>
        {shown.length === 0 ? (
          <p className="mt-4 flex items-center gap-2 text-sage-700">
            <CheckCircle2 size={18} aria-hidden="true" /> Nothing needs attention with these filters.
          </p>
        ) : (
          <ul className="mt-4 grid gap-3">
            {shown.slice(0, 60).map((q) => (
              <ReviewItem key={q.id} q={q} onChange={(patch) => updateQuestion(q.id, patch)} />
            ))}
          </ul>
        )}
        {shown.length > 60 && <p className="mt-2 text-sm text-muted">Showing the first 60 — narrow the filters to see others.</p>}
      </Card>

      <Card className="mb-5">
        <h2 className="text-xl font-semibold text-rose-800">Publish to the deployed app</h2>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-ink">
          <li>
            Download the dataset below and replace <code>data/questions.json</code> in the project.
          </li>
          <li>
            Put each solution PDF in <code>public/sources/</code> using the same filename shown in the table (so “Open page” links work).
          </li>
          <li>Commit and push — Vercel redeploys and the new questions appear for everyone.</li>
        </ol>
        <div className="mt-4 flex flex-wrap gap-3">
          <Button onClick={download}>
            <Download size={16} aria-hidden="true" /> Download questions.json
          </Button>
          <Button variant="ghost" disabled={!hasOverrides} onClick={() => saveOverrides({})}>
            Clear my local corrections
          </Button>
        </div>
        <p className="mt-3 flex items-start gap-2 text-xs text-muted">
          <HelpCircle size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
          Corrections made here are saved in this browser only until you download and commit the file. They are never silently shared with other devices.
        </p>
      </Card>
    </>
  );
}

function ReviewItem({ q, onChange }: { q: Question; onChange: (patch: Partial<Question>) => void }) {
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<string[]>(q.correctOptionIds);
  const [text, setText] = useState(q.text);
  const [opts, setOpts] = useState(q.options.map((o) => o.text));
  const [type, setType] = useState<QuestionType>(q.type);
  const [msg, setMsg] = useState("");

  function confirm() {
    const candidate: Question = {
      ...q,
      text,
      type,
      options: q.options.map((o, i) => ({ ...o, text: opts[i] })),
      correctOptionIds: picked,
      verification: {
        status: "verified",
        method: "manual",
        notes: [...q.verification.notes, "Manually confirmed against the source PDF in the review dashboard."],
      },
    };
    const problems = auditQuestion(candidate);
    if (problems.length) {
      setMsg(problems.join(" "));
      return;
    }
    onChange({ text: candidate.text, type: candidate.type, options: candidate.options, correctOptionIds: picked, verification: candidate.verification });
    setMsg("Saved — confirmed against the PDF.");
  }

  function unverify() {
    onChange({ correctOptionIds: [], verification: { ...q.verification, status: "needs_verification", method: null, notes: [...q.verification.notes, "Manually marked as needing verification."] } });
  }

  return (
    <li className="rounded-2xl border border-blush-200 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={STATUS_TONE[q.verification.status]}>{STATUS_LABEL[q.verification.status]}</Badge>
        <span className="text-xs text-muted">
          {q.id} · {q.source.file} · PDF page {q.source.page}
        </span>
        <a href={`/sources/${encodeURIComponent(q.source.file)}#page=${q.source.page}`} target="_blank" rel="noreferrer" className="text-xs font-semibold text-lav-600 underline">
          open page
        </a>
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="ml-auto text-sm font-semibold text-rose-700 underline underline-offset-2">
          {open ? "Close" : "Inspect / edit"}
        </button>
      </div>
      <p className="mt-2 font-medium">{q.text}</p>
      {q.verification.notes.length > 0 && (
        <ul className="mt-1 list-disc pl-5 text-xs text-muted">
          {q.verification.notes.map((n, i) => (
            <li key={i}>{n}</li>
          ))}
        </ul>
      )}
      {open && (
        <div className="mt-3 grid gap-3 border-t border-blush-100 pt-3">
          <label className="text-sm font-semibold">
            Question text
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} className="mt-1 block w-full rounded-xl border border-blush-200 p-2 font-normal" />
          </label>
          <label className="text-sm font-semibold">
            Type
            <select value={type} onChange={(e) => setType(e.target.value as QuestionType)} className="ml-2 rounded-xl border border-blush-200 px-2 py-1.5 font-normal">
              <option value="single">Single choice</option>
              <option value="multi">Multi-select</option>
              <option value="true_false">True / False</option>
              <option value="fill_blank">Fill in the blank</option>
            </select>
          </label>
          <fieldset>
            <legend className="text-sm font-semibold">Options — tick the correct one(s) exactly as the PDF shows</legend>
            <ul className="mt-1 grid gap-1.5">
              {q.options.map((o, i) => (
                <li key={o.id} className="flex items-center gap-2">
                  <input
                    type={type === "multi" ? "checkbox" : "radio"}
                    name={`ans-${q.id}`}
                    checked={picked.includes(o.id)}
                    aria-label={`Option ${o.id} is correct`}
                    onChange={() => setPicked((p) => (type === "multi" ? (p.includes(o.id) ? p.filter((x) => x !== o.id) : [...p, o.id]) : [o.id]))}
                    className="h-5 w-5 accent-rose-600"
                  />
                  <span className="w-5 text-sm font-semibold">{o.id}</span>
                  <input value={opts[i]} onChange={(e) => setOpts((arr) => arr.map((v, j) => (j === i ? e.target.value : v)))} className="min-w-0 flex-1 rounded-lg border border-blush-200 px-2 py-1 text-sm" aria-label={`Option ${o.id} text`} />
                </li>
              ))}
            </ul>
          </fieldset>
          <details>
            <summary className="cursor-pointer text-sm font-semibold text-lav-600">Original extracted text</summary>
            <pre className="mt-1 whitespace-pre-wrap rounded-xl bg-lav-50 p-3 text-xs">{q.context}</pre>
          </details>
          <div className="flex flex-wrap items-center gap-2">
            <Button className={cx("!min-h-10")} disabled={picked.length === 0} onClick={confirm}>
              I checked the PDF — mark verified
            </Button>
            {q.verification.status === "verified" && (
              <Button variant="ghost" className="!min-h-10" onClick={unverify}>
                Send back to “needs verification”
              </Button>
            )}
            {msg && <span className="text-sm text-muted" role="status">{msg}</span>}
          </div>
        </div>
      )}
    </li>
  );
}

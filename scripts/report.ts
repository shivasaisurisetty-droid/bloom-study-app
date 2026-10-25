import fs from "node:fs";
const d = JSON.parse(fs.readFileSync("data/questions.json", "utf8"));
const only = process.argv[2] ? process.argv[2].split(",").map(Number) : null;
for (const q of d.questions) {
  if (only && !only.includes(q.week)) continue;
  const ans = q.options.filter((o: any) => q.correctOptionIds.includes(o.id)).map((o: any) => `${o.id}:${o.text}`).join(" | ");
  console.log(`[${q.id}] p${q.source.page} ${q.type}${q.acceptAny ? "(any)" : ""} ${q.verification.status}/${q.verification.method}`);
  console.log(`   Q: ${q.text}`);
  console.log(`   opts: ${q.options.map((o: any) => o.id + "=" + o.text).join(" ; ")}`);
  console.log(`   ANS: ${ans || "-"}`);
  if (q.verification.status !== "verified") console.log(`   NOTES: ${q.verification.notes.join(" // ")}`);
}

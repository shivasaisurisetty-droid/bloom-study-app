import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { displayFilename, extractPdf } from "@/lib/extract";

export const runtime = "nodejs";
export const maxDuration = 30;
export const dynamic = "force-dynamic";

const MAX_BYTES = 4 * 1024 * 1024; // Vercel serverless request bodies are capped at ~4.5 MB

function tokenOk(given: string | null, expected: string): boolean {
  if (!given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Lets the admin page know whether importing is configured, without revealing anything else. */
export async function GET() {
  return NextResponse.json({ enabled: Boolean(process.env.ADMIN_TOKEN) });
}

export async function POST(req: Request) {
  const expected = process.env.ADMIN_TOKEN;
  if (!expected) {
    return NextResponse.json(
      { error: "The importer is disabled. Set the ADMIN_TOKEN environment variable (see .env.example) and redeploy." },
      { status: 503 },
    );
  }
  if (!tokenOk(req.headers.get("x-admin-token"), expected)) {
    return NextResponse.json({ error: "That admin token isn't right." }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Expected a multipart form with a PDF file." }, { status: 400 });
  }
  const file = form.get("file");
  const week = Number(form.get("week"));
  if (!(file instanceof File)) return NextResponse.json({ error: "No PDF file was attached." }, { status: 400 });
  if (!Number.isInteger(week) || week < 1 || week > 12) {
    return NextResponse.json({ error: "Week must be a whole number from 1 to 12." }, { status: 400 });
  }
  if (file.size === 0 || file.size > MAX_BYTES) {
    return NextResponse.json({ error: "The PDF must be between 1 byte and 4 MB." }, { status: 413 });
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (String.fromCharCode(...bytes.slice(0, 5)) !== "%PDF-") {
    return NextResponse.json({ error: "That file doesn't look like a PDF." }, { status: 415 });
  }

  try {
    const result = await extractPdf(bytes, { week, file: displayFilename(file.name) });
    return NextResponse.json(result);
  } catch (err) {
    console.error("PDF extraction failed", err);
    return NextResponse.json({ error: "This PDF couldn't be read. It may be encrypted or damaged." }, { status: 422 });
  }
}

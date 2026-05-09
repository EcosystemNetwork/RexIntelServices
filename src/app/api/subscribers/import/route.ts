import { NextRequest, NextResponse } from "next/server";
import Papa from "papaparse";
import ExcelJS from "exceljs";
import { db, subscribers, suppressions } from "@/lib/db";
import { inArray } from "drizzle-orm";

interface Row {
  email: string;
  firstName?: string;
  lastName?: string;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const EMAIL_HEADERS = ["email"];
const FIRST_NAME_HEADERS = ["first_name", "firstname", "first name", "fname", "given name"];
const LAST_NAME_HEADERS = ["last_name", "lastname", "last name", "lname", "surname", "family name"];

const norm = (s: string) => s.trim().toLowerCase();

function pickHeader(headers: string[], candidates: string[]): number {
  for (let i = 0; i < headers.length; i++) {
    if (candidates.includes(norm(headers[i] ?? ""))) return i;
  }
  return -1;
}

async function parseCsv(text: string): Promise<{ rows: Row[]; parseError?: string }> {
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });

  if (parsed.errors.length > 0 && parsed.data.length === 0) {
    return { rows: [], parseError: "could not parse CSV" };
  }

  // Build a header map from the first row's keys
  const sampleKeys = parsed.data[0] ? Object.keys(parsed.data[0]) : [];
  const lookup = (row: Record<string, string>, candidates: string[]): string | undefined => {
    for (const k of sampleKeys) {
      if (candidates.includes(norm(k))) return row[k];
    }
    return undefined;
  };

  const rows: Row[] = parsed.data.map((row) => ({
    email: (lookup(row, EMAIL_HEADERS) ?? "").trim(),
    firstName: lookup(row, FIRST_NAME_HEADERS)?.trim(),
    lastName: lookup(row, LAST_NAME_HEADERS)?.trim(),
  }));

  return { rows };
}

async function parseXlsx(buffer: ArrayBuffer): Promise<{ rows: Row[]; parseError?: string }> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buffer);
  } catch {
    return { rows: [], parseError: "could not parse Excel file" };
  }

  const sheet = wb.worksheets[0];
  if (!sheet) return { rows: [], parseError: "Excel file has no sheets" };

  // Read header row (first row with content)
  const headerRow = sheet.getRow(1);
  const headers: string[] = [];
  headerRow.eachCell({ includeEmpty: true }, (cell, col) => {
    headers[col - 1] = String(cell.value ?? "").trim();
  });

  const emailIdx = pickHeader(headers, EMAIL_HEADERS);
  if (emailIdx < 0) {
    return { rows: [], parseError: `Excel file is missing an "email" column` };
  }
  const firstNameIdx = pickHeader(headers, FIRST_NAME_HEADERS);
  const lastNameIdx = pickHeader(headers, LAST_NAME_HEADERS);

  const rows: Row[] = [];
  sheet.eachRow({ includeEmpty: false }, (row, rowNum) => {
    if (rowNum === 1) return; // skip header
    const cell = (idx: number): string => {
      if (idx < 0) return "";
      const v = row.getCell(idx + 1).value;
      if (v == null) return "";
      // ExcelJS may return objects for hyperlinks (-> { text, hyperlink }) or formula results
      if (typeof v === "object") {
        if ("text" in v && typeof v.text === "string") return v.text;
        if ("result" in v && v.result != null) return String(v.result);
        return "";
      }
      return String(v);
    };
    rows.push({
      email: cell(emailIdx).trim(),
      firstName: cell(firstNameIdx).trim() || undefined,
      lastName: cell(lastNameIdx).trim() || undefined,
    });
  });

  return { rows };
}

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get("file");
  const source = (formData.get("source") as string) || "import";

  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "file required" }, { status: 400 });
  }

  const filename = file.name.toLowerCase();
  const isXlsx = filename.endsWith(".xlsx") || filename.endsWith(".xlsm");
  const isXls = filename.endsWith(".xls"); // legacy binary format — exceljs doesn't read it

  if (isXls) {
    return NextResponse.json(
      { error: "Legacy .xls is not supported. Save the file as .xlsx or .csv first." },
      { status: 400 },
    );
  }

  let parsed: { rows: Row[]; parseError?: string };
  if (isXlsx) {
    parsed = await parseXlsx(await file.arrayBuffer());
  } else {
    parsed = await parseCsv(await file.text());
  }

  if (parsed.parseError) {
    return NextResponse.json({ error: parsed.parseError }, { status: 400 });
  }

  // Validate, dedupe within the file
  const seen = new Set<string>();
  const clean: Row[] = [];
  let skippedInvalid = 0;
  let skippedDuplicate = 0;

  for (const row of parsed.rows) {
    const email = row.email.toLowerCase();
    if (!email || !EMAIL_REGEX.test(email)) {
      skippedInvalid++;
      continue;
    }
    if (seen.has(email)) {
      skippedDuplicate++;
      continue;
    }
    seen.add(email);
    clean.push({ email, firstName: row.firstName, lastName: row.lastName });
  }

  if (clean.length === 0) {
    return NextResponse.json({
      ok: true,
      totalRows: parsed.rows.length,
      inserted: 0,
      skipped: { invalid: skippedInvalid, duplicateInFile: skippedDuplicate },
    });
  }

  // Filter out anything on the suppression list
  const suppressed = await db
    .select({ email: suppressions.email })
    .from(suppressions)
    .where(
      inArray(
        suppressions.email,
        clean.map((r) => r.email),
      ),
    );
  const suppressedSet = new Set(suppressed.map((r) => r.email));
  const filtered = clean.filter((r) => !suppressedSet.has(r.email));
  const skippedSuppressed = clean.length - filtered.length;

  // Insert in chunks (Postgres has a per-statement parameter limit ~32k)
  let inserted = 0;
  const CHUNK = 500;
  for (let i = 0; i < filtered.length; i += CHUNK) {
    const chunk = filtered.slice(i, i + CHUNK);
    const result = await db
      .insert(subscribers)
      .values(
        chunk.map((r) => ({
          email: r.email,
          firstName: r.firstName ?? null,
          lastName: r.lastName ?? null,
          source,
          status: "active" as const,
        })),
      )
      .onConflictDoNothing()
      .returning({ id: subscribers.id });
    inserted += result.length;
  }

  return NextResponse.json({
    ok: true,
    totalRows: parsed.rows.length,
    inserted,
    skipped: {
      invalid: skippedInvalid,
      duplicateInFile: skippedDuplicate,
      suppressed: skippedSuppressed,
      alreadyInDb: filtered.length - inserted,
    },
  });
}

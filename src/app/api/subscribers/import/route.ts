import { NextRequest, NextResponse } from "next/server";
import Papa from "papaparse";
import { db, subscribers, suppressions } from "@/lib/db";
import { inArray } from "drizzle-orm";

interface CsvRow {
  email?: string;
  Email?: string;
  EMAIL?: string;
  first_name?: string;
  firstName?: string;
  "First Name"?: string;
  last_name?: string;
  lastName?: string;
  "Last Name"?: string;
  [key: string]: string | undefined;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get("file");
  const source = (formData.get("source") as string) || "csv_import";

  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "file required" }, { status: 400 });
  }

  const text = await file.text();
  const parsed = Papa.parse<CsvRow>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });

  if (parsed.errors.length > 0 && parsed.data.length === 0) {
    return NextResponse.json(
      { error: "could not parse CSV", details: parsed.errors.slice(0, 3) },
      { status: 400 },
    );
  }

  const seen = new Set<string>();
  const rows: { email: string; firstName?: string; lastName?: string }[] = [];
  let skippedInvalid = 0;
  let skippedDuplicate = 0;

  for (const row of parsed.data) {
    const rawEmail = row.email ?? row.Email ?? row.EMAIL ?? "";
    const email = rawEmail.toLowerCase().trim();
    if (!email || !EMAIL_REGEX.test(email)) {
      skippedInvalid++;
      continue;
    }
    if (seen.has(email)) {
      skippedDuplicate++;
      continue;
    }
    seen.add(email);

    rows.push({
      email,
      firstName:
        row.first_name?.trim() ??
        row.firstName?.trim() ??
        row["First Name"]?.trim(),
      lastName:
        row.last_name?.trim() ??
        row.lastName?.trim() ??
        row["Last Name"]?.trim(),
    });
  }

  // Filter out anything on the suppression list
  if (rows.length > 0) {
    const suppressed = await db
      .select({ email: suppressions.email })
      .from(suppressions)
      .where(
        inArray(
          suppressions.email,
          rows.map((r) => r.email),
        ),
      );
    const suppressedSet = new Set(suppressed.map((r) => r.email));
    const before = rows.length;
    const filtered = rows.filter((r) => !suppressedSet.has(r.email));
    const skippedSuppressed = before - filtered.length;

    // Insert in chunks (Postgres has a parameter limit)
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
      totalRows: parsed.data.length,
      inserted,
      skipped: {
        invalid: skippedInvalid,
        duplicateInFile: skippedDuplicate,
        suppressed: skippedSuppressed,
        alreadyInDb:
          filtered.length - inserted,
      },
    });
  }

  return NextResponse.json({
    ok: true,
    totalRows: parsed.data.length,
    inserted: 0,
    skipped: { invalid: skippedInvalid, duplicateInFile: skippedDuplicate },
  });
}

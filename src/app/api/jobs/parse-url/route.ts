import { NextRequest, NextResponse } from "next/server";
import { parseJobUrl, isTrustedJobUrl } from "@/lib/event-parser";
import { rateLimit, clientIp } from "@/lib/rate-limit";

/**
 * Mirror of /api/events/parse-url but targets schema.org JobPosting
 * metadata. Useful for pasting a Greenhouse/Lever/Ashby job URL on the
 * Job tab and getting the form auto-filled.
 *
 * POST /api/jobs/parse-url
 * Body: { url: string }
 */
export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  const limit = await rateLimit(`parse-url:${ip}`, 20, 10 * 60 * 1000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      {
        status: 429,
        headers: { "Retry-After": String(limit.retryAfterSec) },
      },
    );
  }

  let body: { url?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const url = body.url?.trim();
  if (!url) {
    return NextResponse.json({ error: "url is required" }, { status: 400 });
  }
  if (url.length > 2000) {
    return NextResponse.json({ error: "url is too long" }, { status: 400 });
  }

  const result = await parseJobUrl(url);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error.message, code: result.error.code },
      { status: result.error.code === "fetch_failed" ? 502 : 400 },
    );
  }

  return NextResponse.json({
    ok: true,
    payload: result.data.payload,
    canonicalUrl: result.data.canonicalUrl,
    source: result.data.source,
    trusted: isTrustedJobUrl(result.data.canonicalUrl),
  });
}

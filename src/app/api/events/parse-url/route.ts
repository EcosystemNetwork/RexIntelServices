import { NextRequest, NextResponse } from "next/server";
import { parseEventUrl, isTrustedEventUrl } from "@/lib/event-parser";
import { rateLimit, clientIp } from "@/lib/rate-limit";

/**
 * Public endpoint that takes an event URL (lu.ma, eventbrite, ethglobal,
 * etc.) and returns its parsed metadata so the submission form can prefill.
 *
 * POST /api/events/parse-url
 * Body: { url: string }
 *
 * Tight rate limit: this issues an outbound HTTP request on the caller's
 * behalf, so we don't want an unbounded knock-knock proxy.
 */
export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  const limit = rateLimit(`parse-url:${ip}`, 20, 10 * 60 * 1000);
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

  const result = await parseEventUrl(url);
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
    trusted: isTrustedEventUrl(result.data.canonicalUrl),
  });
}

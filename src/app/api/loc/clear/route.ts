import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { LOC_COOKIE_NAME } from "@/lib/loc-context";

// Clears the persistent location cookie set by middleware. Form-posted from
// the header pill so the action works without any client JS.
export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null);
  const back = (form?.get("back") as string) || "/";
  // Only allow same-origin redirects.
  const safeBack = back.startsWith("/") && !back.startsWith("//") ? back : "/";
  const res = NextResponse.redirect(new URL(safeBack, req.url), { status: 303 });
  res.cookies.delete(LOC_COOKIE_NAME);
  return res;
}

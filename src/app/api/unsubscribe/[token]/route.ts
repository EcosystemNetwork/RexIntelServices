import { processUnsubscribe } from "@/lib/email/unsubscribe";

// RFC 8058 one-click POST endpoint. Gmail/Yahoo POST here when users click
// "Unsubscribe" in the mail UI; the URL is set in the List-Unsubscribe header.
export async function POST(
  _req: Request,
  { params }: { params: { token: string } },
) {
  await processUnsubscribe(params.token);
  return new Response(null, { status: 200 });
}

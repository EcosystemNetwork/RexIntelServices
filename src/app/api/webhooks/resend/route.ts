import { NextRequest, NextResponse } from "next/server";
import { Webhook } from "svix";
import { eq, sql } from "drizzle-orm";
import {
  db,
  sends,
  subscribers,
  campaigns,
  suppressions,
} from "@/lib/db";

/**
 * Resend webhook handler. Resend signs webhooks with Svix.
 *
 * Set this URL in Resend dashboard -> Webhooks:
 *   https://your-domain.com/api/webhooks/resend
 *
 * Subscribe to events:
 *   email.delivered, email.bounced, email.complained, email.opened, email.clicked
 *
 * Then put the signing secret in env: RESEND_WEBHOOK_SECRET=whsec_...
 */
export async function POST(req: NextRequest) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "RESEND_WEBHOOK_SECRET not configured" },
      { status: 500 },
    );
  }

  const payload = await req.text();
  const headers = {
    "svix-id": req.headers.get("svix-id") ?? "",
    "svix-timestamp": req.headers.get("svix-timestamp") ?? "",
    "svix-signature": req.headers.get("svix-signature") ?? "",
  };

  let event: ResendEvent;
  try {
    const wh = new Webhook(secret);
    event = wh.verify(payload, headers) as ResendEvent;
  } catch (err) {
    console.warn("[webhook] signature verification failed", err);
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  const messageId = event.data?.email_id;
  if (!messageId) {
    return NextResponse.json({ ok: true });
  }

  // Find the matching send by provider_message_id
  const [send] = await db
    .select()
    .from(sends)
    .where(eq(sends.providerMessageId, messageId))
    .limit(1);

  if (!send) {
    console.warn(`[webhook] no send for message ${messageId}, ignoring`);
    return NextResponse.json({ ok: true });
  }

  switch (event.type) {
    case "email.delivered":
      await db
        .update(sends)
        .set({ status: "delivered", deliveredAt: new Date() })
        .where(eq(sends.id, send.id));
      await db
        .update(campaigns)
        .set({ deliveredCount: sql`${campaigns.deliveredCount} + 1` })
        .where(eq(campaigns.id, send.campaignId));
      break;

    case "email.bounced": {
      const bounceType = event.data?.bounce?.type;
      const isHardBounce =
        bounceType === "Permanent" || bounceType === "hard";

      await db
        .update(sends)
        .set({ status: "bounced", bouncedAt: new Date() })
        .where(eq(sends.id, send.id));

      await db
        .update(campaigns)
        .set({ bouncedCount: sql`${campaigns.bouncedCount} + 1` })
        .where(eq(campaigns.id, send.campaignId));

      // Hard bounce -> mark subscriber dead AND add to suppression list
      if (isHardBounce) {
        const [sub] = await db
          .select()
          .from(subscribers)
          .where(eq(subscribers.id, send.subscriberId))
          .limit(1);

        if (sub) {
          await db
            .update(subscribers)
            .set({ status: "bounced" })
            .where(eq(subscribers.id, sub.id));

          await db
            .insert(suppressions)
            .values({
              email: sub.email.toLowerCase(),
              reason: "hard_bounce",
              notes: `Bounced on ${new Date().toISOString()}`,
            })
            .onConflictDoNothing();
        }
      }
      break;
    }

    case "email.complained": {
      // Spam complaint - this is the worst kind of negative signal.
      // Suppress immediately and forever.
      await db
        .update(sends)
        .set({ status: "complained", complainedAt: new Date() })
        .where(eq(sends.id, send.id));

      await db
        .update(campaigns)
        .set({ complainedCount: sql`${campaigns.complainedCount} + 1` })
        .where(eq(campaigns.id, send.campaignId));

      const [sub] = await db
        .select()
        .from(subscribers)
        .where(eq(subscribers.id, send.subscriberId))
        .limit(1);

      if (sub) {
        await db
          .update(subscribers)
          .set({ status: "complained" })
          .where(eq(subscribers.id, sub.id));

        await db
          .insert(suppressions)
          .values({
            email: sub.email.toLowerCase(),
            reason: "complaint",
            notes: `Complained on ${new Date().toISOString()}`,
          })
          .onConflictDoNothing();
      }
      break;
    }

    // We get opens & clicks from our own pixel/redirect, but Resend reports
    // them too. We could double-count if not careful, so we leave these
    // for now and rely on our own tracking endpoints.
    case "email.opened":
    case "email.clicked":
    case "email.sent":
    case "email.delivery_delayed":
      break;

    default:
      console.log(`[webhook] unhandled event: ${event.type}`);
  }

  return NextResponse.json({ ok: true });
}

// =====================================================================
// Resend event payload shape (subset we care about).
// =====================================================================
interface ResendEvent {
  type:
    | "email.sent"
    | "email.delivered"
    | "email.delivery_delayed"
    | "email.bounced"
    | "email.complained"
    | "email.opened"
    | "email.clicked";
  data: {
    email_id?: string;
    bounce?: { type?: "Permanent" | "Transient" | "hard" | "soft" };
    [key: string]: unknown;
  };
}

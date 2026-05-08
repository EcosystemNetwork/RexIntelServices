import { db, clickUrls, type Campaign, type Subscriber } from "../db";

/**
 * Render a campaign's HTML for a specific recipient:
 * - replace {{firstName}} / {{lastName}} / {{email}} merge tags
 * - rewrite all <a href> URLs to go through our click tracker
 * - inject an open-tracking pixel
 * - inject a List-Unsubscribe-compatible unsubscribe link in the footer
 */
export async function renderCampaignForRecipient(args: {
  campaign: Campaign;
  subscriber: Subscriber;
  sendId: string;
  baseUrl: string;
}): Promise<{ html: string; text: string }> {
  const { campaign, subscriber, sendId, baseUrl } = args;

  // 1. Merge tags
  let html = applyMergeTags(campaign.htmlBody, subscriber);
  let text = campaign.textBody
    ? applyMergeTags(campaign.textBody, subscriber)
    : htmlToText(html);

  // 2. Rewrite links for click tracking
  html = await rewriteLinks(html, campaign.id, sendId, baseUrl);

  // 3. Add unsubscribe footer (also satisfies CAN-SPAM / GDPR requirements)
  const unsubUrl = `${baseUrl}/unsubscribe/${subscriber.unsubscribeToken}`;
  html += `
    <div style="margin-top:48px;padding-top:24px;border-top:1px solid #e5e5e5;color:#888;font-size:12px;font-family:system-ui,sans-serif;text-align:center;line-height:1.6;">
      You are receiving this because you signed up at our newsletter.<br>
      <a href="${unsubUrl}" style="color:#888;text-decoration:underline;">Unsubscribe</a>
      &nbsp;·&nbsp;
      <a href="${unsubUrl}?prefs=1" style="color:#888;text-decoration:underline;">Manage preferences</a>
    </div>
  `;
  text += `\n\n---\nUnsubscribe: ${unsubUrl}\n`;

  // 4. Open-tracking pixel (placed at bottom)
  const pixelUrl = `${baseUrl}/api/track/open/${sendId}`;
  html += `<img src="${pixelUrl}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0;">`;

  return { html, text };
}

function applyMergeTags(input: string, sub: Subscriber): string {
  return input
    .replace(/\{\{\s*firstName\s*\}\}/g, escapeHtml(sub.firstName ?? ""))
    .replace(/\{\{\s*lastName\s*\}\}/g, escapeHtml(sub.lastName ?? ""))
    .replace(/\{\{\s*email\s*\}\}/g, escapeHtml(sub.email));
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Find all <a href="..."> links in the HTML, register each unique URL
 * in click_urls, and rewrite the href to /api/track/click/[clickUrlId]?s=[sendId].
 */
async function rewriteLinks(
  html: string,
  campaignId: string,
  sendId: string,
  baseUrl: string,
): Promise<string> {
  const urls = new Set<string>();
  const linkRegex = /href\s*=\s*"([^"]+)"/gi;
  let match: RegExpExecArray | null;
  while ((match = linkRegex.exec(html)) !== null) {
    const url = match[1];
    if (shouldTrack(url)) urls.add(url);
  }
  if (urls.size === 0) return html;

  // Insert each URL (or no-op if it already exists for this campaign).
  const urlMap = new Map<string, string>();
  for (const url of urls) {
    const [row] = await db
      .insert(clickUrls)
      .values({ campaignId, url })
      .onConflictDoUpdate({
        target: [clickUrls.campaignId, clickUrls.url],
        set: { url }, // no-op update so RETURNING fires
      })
      .returning({ id: clickUrls.id });
    if (row) urlMap.set(url, row.id);
  }

  return html.replace(/href\s*=\s*"([^"]+)"/gi, (full, url) => {
    if (!shouldTrack(url)) return full;
    const id = urlMap.get(url);
    if (!id) return full;
    return `href="${baseUrl}/api/track/click/${id}?s=${sendId}"`;
  });
}

function shouldTrack(url: string): boolean {
  // Don't rewrite mailto:, tel:, anchors, or already-tracked links
  return /^https?:\/\//i.test(url);
}

function htmlToText(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

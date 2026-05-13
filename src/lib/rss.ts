/**
 * Minimal RSS 2.0 feed builder. We hand-roll the XML because the few
 * fields we need (title, link, description, pubDate, guid) are simple
 * enough that pulling in a 50KB feed library doesn't pay for itself.
 *
 * All string fields are XML-escaped, so callers can pass whatever
 * payload text exists without worrying about & < > etc breaking parsing.
 */

export type RssItem = {
  title: string;
  link: string; // absolute URL
  description: string; // plain text; we wrap in CDATA
  pubDate?: Date | null;
  guid?: string; // defaults to link
  category?: string;
};

export type RssChannel = {
  title: string;
  link: string; // canonical site URL
  description: string;
  language?: string;
  selfLink: string; // absolute URL of the feed itself
  items: RssItem[];
};

export function buildRssFeed(channel: RssChannel): string {
  const lastBuildDate =
    channel.items.reduce<Date | null>((acc, it) => {
      if (!it.pubDate) return acc;
      if (!acc || it.pubDate > acc) return it.pubDate;
      return acc;
    }, null) ?? new Date();

  const itemsXml = channel.items
    .map((it) => {
      const guid = it.guid ?? it.link;
      return [
        "    <item>",
        `      <title>${esc(it.title)}</title>`,
        `      <link>${esc(it.link)}</link>`,
        `      <guid isPermaLink="true">${esc(guid)}</guid>`,
        it.pubDate
          ? `      <pubDate>${it.pubDate.toUTCString()}</pubDate>`
          : "",
        it.category ? `      <category>${esc(it.category)}</category>` : "",
        `      <description><![CDATA[${stripCdataClose(it.description)}]]></description>`,
        "    </item>",
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n");

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">`,
    `  <channel>`,
    `    <title>${esc(channel.title)}</title>`,
    `    <link>${esc(channel.link)}</link>`,
    `    <description>${esc(channel.description)}</description>`,
    `    <language>${esc(channel.language ?? "en")}</language>`,
    `    <lastBuildDate>${lastBuildDate.toUTCString()}</lastBuildDate>`,
    `    <atom:link href="${esc(channel.selfLink)}" rel="self" type="application/rss+xml" />`,
    itemsXml,
    `  </channel>`,
    `</rss>`,
  ].join("\n");
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// CDATA blocks end at the first `]]>`, so neutralize any in caller-supplied
// description text. Rare in practice but cheap to defend.
function stripCdataClose(s: string): string {
  return s.replace(/\]\]>/g, "]]&gt;");
}

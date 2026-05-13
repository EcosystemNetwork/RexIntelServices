/**
 * Inline JSON-LD emitter. Pass any schema.org-shaped object and it renders
 * a single <script type="application/ld+json"> tag with the JSON body.
 *
 * dangerouslySetInnerHTML is the canonical approach — React refuses to
 * render JSON inside a <script> tag otherwise. We JSON.stringify our own
 * input, so injection risk is bounded to what the caller passes in.
 * Strings still go through JSON escaping; do NOT pass raw HTML strings.
 */
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}

import { NextRequest } from "next/server";

/**
 * GET /embed.js
 *
 * Serves the RexIntel signup-form embed script. Operators paste:
 *
 *   <div id="rex-signup" data-source="embed-mysite" data-tags="t1,t2"></div>
 *   <script src="https://rexintelservices.com/embed.js" async></script>
 *
 * On load, the script finds the host div, injects a styled form, and POSTs
 * submissions to /api/subscribe with the configured source + tags. CORS is
 * already enabled on /api/subscribe.
 *
 * Cached aggressively — the embed payload is operator-curated, not
 * per-visitor. Bust by updating the URL (?v=2 etc.) when changing styles.
 */
const SCRIPT = (origin: string) => `(function(){
  if (window.__rexSignupLoaded) return;
  window.__rexSignupLoaded = true;
  var origin = ${JSON.stringify(origin)};
  function init() {
    var nodes = document.querySelectorAll('[id^=rex-signup]');
    nodes.forEach(function(host) {
      if (host.__rexInit) return;
      host.__rexInit = true;
      var source = host.getAttribute('data-source') || 'embed-default';
      var tagAttr = host.getAttribute('data-tags') || '';
      var tagIds = tagAttr.split(',').map(function(s){return s.trim();}).filter(Boolean);
      var heading = host.getAttribute('data-heading') || 'Subscribe to Rex Intel';
      var subhead = host.getAttribute('data-subhead') || 'Intel briefings, incident alerts, investigation drops. No spam.';
      var ctaText = host.getAttribute('data-cta') || 'Subscribe';

      host.innerHTML = (
        '<div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;max-width:480px;margin:0 auto;padding:24px;background:#0a0a0f;border:1px solid #2a2a35;border-radius:8px;color:#e8e8ef;">' +
          '<div style="font-family:Courier New,monospace;font-size:11px;letter-spacing:0.22em;color:#5fb91f;text-transform:uppercase;margin-bottom:10px;">Rex Intel Services</div>' +
          '<h3 style="margin:0 0 8px;font-size:22px;font-weight:600;color:#e8e8ef;line-height:1.2;">' + escapeHtml(heading) + '</h3>' +
          '<p style="margin:0 0 18px;font-size:14px;color:#8888a0;line-height:1.5;">' + escapeHtml(subhead) + '</p>' +
          '<form data-rex-form style="display:flex;flex-direction:column;gap:10px;">' +
            '<input type="email" name="email" required placeholder="you@yourdomain.com" autocomplete="email" style="padding:10px 12px;background:#111118;border:1px solid #2a2a35;color:#e8e8ef;border-radius:4px;font-size:14px;font-family:inherit;outline:none;" />' +
            '<input type="text" name="firstName" placeholder="First name (optional)" style="padding:10px 12px;background:#111118;border:1px solid #2a2a35;color:#e8e8ef;border-radius:4px;font-size:14px;font-family:inherit;outline:none;" />' +
            '<input type="text" name="website" tabindex="-1" autocomplete="off" style="position:absolute;left:-9999px;width:1px;height:1px;opacity:0;" aria-hidden="true" />' +
            '<button type="submit" style="padding:11px 18px;background:#5fb91f;color:#0a0a0f;border:0;border-radius:4px;font-size:13px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;cursor:pointer;font-family:Courier New,monospace;">' + escapeHtml(ctaText) + '</button>' +
            '<div data-rex-status style="font-size:13px;line-height:1.5;display:none;"></div>' +
          '</form>' +
        '</div>'
      );
      var form = host.querySelector('[data-rex-form]');
      var status = host.querySelector('[data-rex-status]');
      form.addEventListener('submit', function(e) {
        e.preventDefault();
        status.style.display = 'none';
        var payload = {
          email: form.email.value,
          firstName: form.firstName.value,
          website: form.website.value,
          source: source,
          tagIds: tagIds,
        };
        var btn = form.querySelector('button[type=submit]');
        var orig = btn.textContent;
        btn.textContent = 'Subscribing…';
        btn.disabled = true;
        fetch(origin + '/api/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }).then(function(r){ return r.json(); }).then(function(data){
          btn.disabled = false;
          btn.textContent = orig;
          status.style.display = 'block';
          if (data.ok) {
            status.style.color = '#5fb91f';
            status.textContent = data.message || "You're in.";
            form.reset();
          } else {
            status.style.color = '#f87171';
            status.textContent = data.error || 'Something went wrong.';
          }
        }).catch(function(){
          btn.disabled = false;
          btn.textContent = orig;
          status.style.display = 'block';
          status.style.color = '#f87171';
          status.textContent = 'Network error — please try again.';
        });
      });
    });
  }
  function escapeHtml(s){return String(s).replace(/[&<>"']/g,function(c){return({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c];});}
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();`;

export async function GET(req: NextRequest) {
  const origin =
    process.env.NEXT_PUBLIC_SITE_URL ??
    process.env.APP_URL ??
    `${req.nextUrl.protocol}//${req.nextUrl.host}`;
  return new Response(SCRIPT(origin), {
    status: 200,
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=86400",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

import type { NewsletterTemplate } from "./index";

// Inaugural "we're live" broadcast. Two jobs:
//   1. Announce that Rex Intel's newsletter is now publishing.
//   2. Promote ETHConf (June 8-10 2026 NYC) with the NYC26 discount code.
// Hero image is the Rex-Intel × ETHConf social card pinned in /public.
export const newsletterLaunch: NewsletterTemplate = {
  id: "newsletter-launch",
  name: "Newsletter launch · ETHConf",
  description:
    "Inaugural broadcast announcing the Rex Intel newsletter + promoting ETHConf NYC (June 8-10) with discount code NYC26.",
  category: "newsletter",
  subject: "We're live — and we'll see you at ETHConf, {{firstName}}",
  previewText:
    "Rex Intel is officially broadcasting. First stop: ETHConf NYC (Jun 8-10). Code NYC26 inside.",
  htmlBody: `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f4f4f7;padding:32px 12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <tr>
    <td align="center">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;width:100%;background:#ffffff;border-radius:8px;overflow:hidden;">

        <tr>
          <td style="background:#0a0a0f;padding:24px 32px;" align="center">
            <div style="font-family:'Courier New',monospace;font-size:13px;letter-spacing:0.28em;color:#5fb91f;text-transform:uppercase;font-weight:700;">
              ✦ Rex Intel Services · Issue 001
            </div>
          </td>
        </tr>

        <tr>
          <td style="padding:0;" align="center">
            <a href="https://ethconf.com/?ref=rexintel&utm_source=newsletter&utm_medium=email&utm_campaign=launch" style="display:block;line-height:0;">
              <img
                src="https://rexintelservices.com/Rex-Intel-ETHConf-Social-Card.png"
                width="600"
                alt="Rex Intel attending ETHConf — June 8-10 2026, New York City. Use code NYC26 for a discount."
                style="display:block;width:100%;max-width:600px;height:auto;border:0;outline:0;text-decoration:none;"
              />
            </a>
          </td>
        </tr>

        <tr>
          <td style="padding:36px 36px 18px;">
            <p style="margin:0 0 8px;font-family:'Courier New',monospace;font-size:11px;letter-spacing:0.24em;color:#5fb91f;text-transform:uppercase;font-weight:700;">
              Day one
            </p>
            <h1 style="margin:0 0 14px;font-size:30px;line-height:1.18;color:#111;font-weight:700;">
              We're live, {{firstName}}.
            </h1>
            <p style="margin:0 0 18px;font-size:16px;line-height:1.65;color:#333;">
              You're reading the inaugural Rex Intel briefing. From here on out
              you'll get the signals nobody else is putting together:
              attribution graphs on the wallets behind the biggest hacks,
              incident alerts the day something lands, and long-form
              investigations on operators the rest of the space won't touch.
            </p>
            <p style="margin:0 0 8px;font-size:16px;line-height:1.65;color:#333;">
              No fluff, no recycled headlines, no Substack pivots. Just intel.
            </p>
          </td>
        </tr>

        <tr>
          <td style="padding:8px 36px 22px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
              <tr>
                <td align="center" style="padding:16px;background:#5fb91f;border-radius:6px;">
                  <a href="https://rexintelservices.com/graph" style="font-family:'Courier New',monospace;font-size:13px;letter-spacing:0.12em;text-transform:uppercase;color:#0a0a0f;font-weight:700;text-decoration:none;">
                    Open the attribution graph →
                  </a>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <tr>
          <td style="padding:6px 36px 8px;">
            <div style="border-top:1px solid #e5e5e5;height:1px;line-height:1px;font-size:1px;">&nbsp;</div>
          </td>
        </tr>

        <tr>
          <td style="padding:24px 36px 4px;">
            <p style="margin:0 0 6px;font-family:'Courier New',monospace;font-size:11px;letter-spacing:0.24em;color:#5fb91f;text-transform:uppercase;font-weight:700;">
              From the desk · Investigations
            </p>
            <h2 style="margin:0 0 6px;font-size:22px;line-height:1.22;color:#111;font-weight:700;">
              Four pieces nobody else is running
            </h2>
            <p style="margin:0 0 18px;font-size:14px;line-height:1.6;color:#555;">
              On-chain receipts, named infrastructure, active operators. These are out now — pull the threads.
            </p>
          </td>
        </tr>

        <tr>
          <td style="padding:0 36px 14px;">
            <a href="https://rexintelservices.com/intel/84f809254722bed2?utm_source=newsletter&utm_medium=email&utm_campaign=launch" style="display:block;text-decoration:none;color:inherit;border-left:3px solid #5fb91f;padding:6px 0 6px 14px;margin-bottom:14px;">
              <div style="font-family:'Courier New',monospace;font-size:10px;letter-spacing:0.18em;color:#b91f1f;text-transform:uppercase;font-weight:700;margin-bottom:4px;">Active · 196 victims</div>
              <div style="font-size:15px;line-height:1.35;color:#0a0a0f;font-weight:600;margin-bottom:4px;">GitHub-leaked key sweeper: 10 days, 196 wallets, one vanity contract</div>
              <div style="font-size:13px;line-height:1.55;color:#555;">A founder's leaked private key became a 24/7 paycheck for a Scam-Sniffer-unattributed drainer crew. 47 ERC-20s parked, 1.4 tx/min fan-out at publish.</div>
            </a>
            <a href="https://rexintelservices.com/intel/c424f21fb6aa7a70?utm_source=newsletter&utm_medium=email&utm_campaign=launch" style="display:block;text-decoration:none;color:inherit;border-left:3px solid #5fb91f;padding:6px 0 6px 14px;margin-bottom:14px;">
              <div style="font-family:'Courier New',monospace;font-size:10px;letter-spacing:0.18em;color:#b91f1f;text-transform:uppercase;font-weight:700;margin-bottom:4px;">99 victims · NFT drainer</div>
              <div style="font-size:15px;line-height:1.35;color:#0a0a0f;font-weight:600;margin-bottom:4px;">A 12-second Blur.io signature stole 2.4 ETH — and hit 99 others through the same vanity contract</div>
              <div style="font-size:13px;line-height:1.55;color:#555;">Inside the NiftyDegen phishing aggregator Scam Sniffer flagged but never named. We mapped the wallet graph.</div>
            </a>
            <a href="https://rexintelservices.com/intel/bc308f6f3c8d130b?utm_source=newsletter&utm_medium=email&utm_campaign=launch" style="display:block;text-decoration:none;color:inherit;border-left:3px solid #5fb91f;padding:6px 0 6px 14px;margin-bottom:14px;">
              <div style="font-family:'Courier New',monospace;font-size:10px;letter-spacing:0.18em;color:#b91f1f;text-transform:uppercase;font-weight:700;margin-bottom:4px;">ETH Denver · 5+ founders</div>
              <div style="font-size:15px;line-height:1.35;color:#0a0a0f;font-weight:600;margin-bottom:4px;">A fake Italian VC on Telegram drained five founders' Bitcoin with a single "open in app" message</div>
              <div style="font-size:13px;line-height:1.55;color:#555;">One ETH Denver group lurker, one impersonation, 24 hours to a multi-chain drain. The operator is still active.</div>
            </a>
            <a href="https://rexintelservices.com/intel/8d6ffea02188c65b?utm_source=newsletter&utm_medium=email&utm_campaign=launch" style="display:block;text-decoration:none;color:inherit;border-left:3px solid #5fb91f;padding:6px 0 6px 14px;">
              <div style="font-family:'Courier New',monospace;font-size:10px;letter-spacing:0.18em;color:#b91f1f;text-transform:uppercase;font-weight:700;margin-bottom:4px;">Active · Research-call vector</div>
              <div style="font-size:15px;line-height:1.35;color:#0a0a0f;font-weight:600;margin-bottom:4px;">A $54 "user research" Zoom call preceded a fully automated multi-chain drain</div>
              <div style="font-size:13px;line-height:1.55;color:#555;">A Consensys-funded interview surface used by an active drainer ring. We mapped the operator. They're still booking calls.</div>
            </a>
          </td>
        </tr>

        <tr>
          <td style="padding:0 36px 22px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
              <tr>
                <td align="center" style="padding:12px;background:#0a0a0f;border-radius:6px;">
                  <a href="https://rexintelservices.com/intel?utm_source=newsletter&utm_medium=email&utm_campaign=launch" style="font-family:'Courier New',monospace;font-size:12px;letter-spacing:0.14em;text-transform:uppercase;color:#5fb91f;font-weight:700;text-decoration:none;">
                    See every investigation →
                  </a>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <tr>
          <td style="padding:4px 36px 8px;">
            <div style="border-top:1px solid #e5e5e5;height:1px;line-height:1px;font-size:1px;">&nbsp;</div>
          </td>
        </tr>

        <tr>
          <td style="padding:22px 36px 6px;">
            <p style="margin:0 0 6px;font-family:'Courier New',monospace;font-size:11px;letter-spacing:0.24em;color:#5fb91f;text-transform:uppercase;font-weight:700;">
              First stop · June 8–10, NYC · 3 days
            </p>
            <h2 style="margin:0 0 12px;font-size:26px;line-height:1.18;color:#111;font-weight:700;">
              ETHConf is the room. We'll see you there.
            </h2>
            <p style="margin:0 0 14px;font-size:15px;line-height:1.65;color:#333;">
              Three days. One city. The biggest Ethereum gathering in the U.S.
              this year — the people writing the protocols, the funds
              underwriting them, the operators chasing exploits, all in the
              same room.
            </p>
            <p style="margin:0 0 18px;font-size:15px;line-height:1.65;color:#333;">
              Rex Intel will be there working the floor: pulling threads on
              live investigations, taking tips in person, and meeting
              subscribers face-to-face. <strong style="color:#0a0a0f;">If you're
              coming, hit reply — drinks are on us.</strong>
            </p>
          </td>
        </tr>

        <tr>
          <td style="padding:0 36px 18px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
              <tr>
                <td width="33%" valign="top" style="padding:0 6px 0 0;">
                  <div style="background:#f4f4f7;border-radius:6px;padding:14px 12px;text-align:center;">
                    <div style="font-family:'Courier New',monospace;font-size:18px;font-weight:700;color:#5fb91f;letter-spacing:0.04em;">3,000+</div>
                    <div style="font-size:11px;color:#555;line-height:1.4;margin-top:4px;">builders, funds, security teams</div>
                  </div>
                </td>
                <td width="33%" valign="top" style="padding:0 3px;">
                  <div style="background:#f4f4f7;border-radius:6px;padding:14px 12px;text-align:center;">
                    <div style="font-family:'Courier New',monospace;font-size:18px;font-weight:700;color:#5fb91f;letter-spacing:0.04em;">120+</div>
                    <div style="font-size:11px;color:#555;line-height:1.4;margin-top:4px;">talks, panels, workshops</div>
                  </div>
                </td>
                <td width="33%" valign="top" style="padding:0 0 0 6px;">
                  <div style="background:#f4f4f7;border-radius:6px;padding:14px 12px;text-align:center;">
                    <div style="font-family:'Courier New',monospace;font-size:18px;font-weight:700;color:#5fb91f;letter-spacing:0.04em;">40+</div>
                    <div style="font-size:11px;color:#555;line-height:1.4;margin-top:4px;">official side events</div>
                  </div>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <tr>
          <td style="padding:0 36px 18px;">
            <div style="background:#fffbe6;border:1px solid #fde047;border-radius:6px;padding:14px 16px;">
              <div style="font-family:'Courier New',monospace;font-size:10px;letter-spacing:0.18em;color:#92400e;text-transform:uppercase;font-weight:700;margin-bottom:6px;">
                Why this one
              </div>
              <div style="font-size:13px;line-height:1.6;color:#333;">
                Protocol cores, the funds underwriting them, security teams chasing live incidents, and operators tipping off the next one — all reachable in the same building for three days. If you can only make one Ethereum event in 2026, make this one.
              </div>
            </div>
          </td>
        </tr>

        <tr>
          <td style="padding:0 36px 24px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#0a0a0f;border-radius:8px;">
              <tr>
                <td style="padding:24px 24px 22px;" align="center">
                  <div style="font-family:'Courier New',monospace;font-size:11px;letter-spacing:0.22em;color:#9ca3af;text-transform:uppercase;font-weight:700;margin-bottom:6px;">
                    Subscriber discount · Rex's code at checkout
                  </div>
                  <div style="font-family:'Courier New',monospace;font-size:38px;letter-spacing:0.30em;color:#fde047;font-weight:700;margin-bottom:6px;line-height:1.1;">
                    NYC26
                  </div>
                  <div style="font-family:-apple-system,sans-serif;font-size:12px;color:#fde047;margin-bottom:14px;letter-spacing:0.04em;">
                    Stacks with any tier · expires June 1
                  </div>
                  <a href="https://ethconf.com/?ref=rexintel&utm_source=newsletter&utm_medium=email&utm_campaign=launch&promo=NYC26" style="display:inline-block;padding:14px 28px;background:#fde047;border-radius:6px;font-family:'Courier New',monospace;font-size:13px;letter-spacing:0.14em;color:#0a0a0f;font-weight:700;text-decoration:none;text-transform:uppercase;">
                    Grab your ETHConf ticket →
                  </a>
                  <div style="font-family:-apple-system,sans-serif;font-size:12px;color:#9ca3af;margin-top:14px;line-height:1.5;">
                    June 8–10, 2026 · Javits Center, NYC · ethconf.com
                  </div>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <tr>
          <td style="padding:0 36px 22px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#0a0a0f;border-radius:8px;">
              <tr>
                <td style="padding:20px 22px;">
                  <div style="font-family:'Courier New',monospace;font-size:10px;letter-spacing:0.22em;color:#5fb91f;text-transform:uppercase;font-weight:700;margin-bottom:8px;">
                    While you're in town · ETHGlobal NY 2026
                  </div>
                  <div style="font-size:19px;line-height:1.25;color:#ffffff;font-weight:700;margin-bottom:8px;">
                    Hack the same weekend you network.
                  </div>
                  <div style="font-size:13px;line-height:1.55;color:#cfcfd6;margin-bottom:14px;">
                    ETHGlobal lands in NYC right alongside ETHConf — 36-hour build, six-figure prize pool, the whole Ethereum dev stack on-site as judges and mentors. If you're already coming for the conference, this is the obvious second ticket.
                  </div>
                  <a href="https://ethglobal.com/events/newyork2026" style="display:inline-block;padding:11px 22px;background:#5fb91f;border-radius:6px;font-family:'Courier New',monospace;font-size:12px;letter-spacing:0.14em;color:#0a0a0f;font-weight:700;text-decoration:none;text-transform:uppercase;">
                    Register for ETHGlobal NY →
                  </a>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <tr>
          <td style="padding:0 36px 22px;">
            <h3 style="margin:0 0 14px;font-size:13px;letter-spacing:0.16em;text-transform:uppercase;color:#0a0a0f;font-family:-apple-system,sans-serif;font-weight:700;">
              What lands in your inbox from here
            </h3>

            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:10px;">
              <tr>
                <td width="40" valign="top" style="font-family:'Courier New',monospace;font-size:14px;color:#5fb91f;font-weight:700;padding-top:2px;">01</td>
                <td valign="top">
                  <div style="font-size:15px;color:#111;font-weight:600;margin-bottom:2px;">Monthly intel briefings</div>
                  <div style="font-size:14px;color:#555;line-height:1.5;">The signals worth knowing, with on-chain addresses wherever we can attribute.</div>
                </td>
              </tr>
            </table>

            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:10px;">
              <tr>
                <td width="40" valign="top" style="font-family:'Courier New',monospace;font-size:14px;color:#5fb91f;font-weight:700;padding-top:2px;">02</td>
                <td valign="top">
                  <div style="font-size:15px;color:#111;font-weight:600;margin-bottom:2px;">Incident alerts</div>
                  <div style="font-size:14px;color:#555;line-height:1.5;">Same-day notes the moment a meaningful hack, drain, or operator move lands.</div>
                </td>
              </tr>
            </table>

            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:22px;">
              <tr>
                <td width="40" valign="top" style="font-family:'Courier New',monospace;font-size:14px;color:#5fb91f;font-weight:700;padding-top:2px;">03</td>
                <td valign="top">
                  <div style="font-size:15px;color:#111;font-weight:600;margin-bottom:2px;">Investigation drops</div>
                  <div style="font-size:14px;color:#555;line-height:1.5;">Long-form pieces when we have something the rest of the space doesn't.</div>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <tr>
          <td style="padding:4px 36px 8px;">
            <div style="border-top:1px solid #e5e5e5;height:1px;line-height:1px;font-size:1px;">&nbsp;</div>
          </td>
        </tr>

        <tr>
          <td style="padding:22px 36px 4px;">
            <p style="margin:0 0 6px;font-family:'Courier New',monospace;font-size:11px;letter-spacing:0.24em;color:#5fb91f;text-transform:uppercase;font-weight:700;">
              Now open · May 2026
            </p>
            <h2 style="margin:0 0 6px;font-size:22px;line-height:1.22;color:#111;font-weight:700;">
              Capital + programs we'd actually apply to
            </h2>
            <p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#555;">
              Curated, deadlines verified, links go to our writeup so you can see check size, terms, and who else got in.
            </p>
          </td>
        </tr>

        <tr>
          <td style="padding:0 36px 8px;">
            <div style="background:#fffbe6;border-left:3px solid #f59e0b;padding:10px 14px;border-radius:0 6px 6px 0;margin-bottom:14px;">
              <div style="font-family:'Courier New',monospace;font-size:10px;letter-spacing:0.18em;color:#92400e;text-transform:uppercase;font-weight:700;margin-bottom:4px;">⏱ Deadline · June 1</div>
              <a href="https://rexintelservices.com/fellowships/ff6e93183544988e?utm_source=newsletter&utm_medium=email&utm_campaign=launch" style="text-decoration:none;color:inherit;">
                <div style="font-size:15px;line-height:1.35;color:#0a0a0f;font-weight:600;margin-bottom:3px;">Flow Fellowship — points-only contribution path</div>
                <div style="font-size:13px;line-height:1.55;color:#555;">Flow Research's research fellowship closes June 1. No stipend, no equity — pure signal play if you're trying to break into a protocol team.</div>
              </a>
            </div>

            <a href="https://rexintelservices.com/accelerators/9fd4220c37991124?utm_source=newsletter&utm_medium=email&utm_campaign=launch" style="display:block;text-decoration:none;color:inherit;padding:10px 0;border-bottom:1px solid #f0f0f0;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr>
                <td valign="top">
                  <div style="font-family:'Courier New',monospace;font-size:10px;letter-spacing:0.18em;color:#5fb91f;text-transform:uppercase;font-weight:700;margin-bottom:3px;">Accelerator · Rolling</div>
                  <div style="font-size:15px;line-height:1.35;color:#0a0a0f;font-weight:600;margin-bottom:3px;">Alliance DAO — $500k + token side letter</div>
                  <div style="font-size:13px;line-height:1.55;color:#555;">Crypto-native accelerator that signs both equity and tokens up front, with another $500k earmarked at seed close.</div>
                </td>
                <td valign="top" width="80" style="text-align:right;padding-top:18px;">
                  <span style="font-family:'Courier New',monospace;font-size:14px;color:#5fb91f;font-weight:700;">$500k</span>
                </td>
              </tr></table>
            </a>

            <a href="https://rexintelservices.com/accelerators/2d6b1c9f31dce71e?utm_source=newsletter&utm_medium=email&utm_campaign=launch" style="display:block;text-decoration:none;color:inherit;padding:10px 0;border-bottom:1px solid #f0f0f0;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr>
                <td valign="top">
                  <div style="font-family:'Courier New',monospace;font-size:10px;letter-spacing:0.18em;color:#5fb91f;text-transform:uppercase;font-weight:700;margin-bottom:3px;">Accelerator · Rolling</div>
                  <div style="font-size:15px;line-height:1.35;color:#0a0a0f;font-weight:600;margin-bottom:3px;">Y Combinator — $500k standard deal</div>
                  <div style="font-size:13px;line-height:1.55;color:#555;">$125k for 7% on a post-money SAFE + $375k uncapped MFN SAFE. Still the highest-leverage three months a founder can spend.</div>
                </td>
                <td valign="top" width="80" style="text-align:right;padding-top:18px;">
                  <span style="font-family:'Courier New',monospace;font-size:14px;color:#5fb91f;font-weight:700;">$500k</span>
                </td>
              </tr></table>
            </a>

            <a href="https://rexintelservices.com/accelerators/b65dd8e503f9588d?utm_source=newsletter&utm_medium=email&utm_campaign=launch" style="display:block;text-decoration:none;color:inherit;padding:10px 0;border-bottom:1px solid #f0f0f0;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr>
                <td valign="top">
                  <div style="font-family:'Courier New',monospace;font-size:10px;letter-spacing:0.18em;color:#5fb91f;text-transform:uppercase;font-weight:700;margin-bottom:3px;">Accelerator · Rolling · AI</div>
                  <div style="font-size:15px;line-height:1.35;color:#0a0a0f;font-weight:600;margin-bottom:3px;">AI Grant (Batch 4) — $250k SAFE + ~$600k credits</div>
                  <div style="font-size:13px;line-height:1.55;color:#555;">Nat Friedman / Daniel Gross's no-equity-loss program for AI startups. Cloud + API credits are the actual prize.</div>
                </td>
                <td valign="top" width="80" style="text-align:right;padding-top:18px;">
                  <span style="font-family:'Courier New',monospace;font-size:14px;color:#5fb91f;font-weight:700;">$850k</span>
                </td>
              </tr></table>
            </a>

            <a href="https://rexintelservices.com/grants/e5446fbcbc09277e?utm_source=newsletter&utm_medium=email&utm_campaign=launch" style="display:block;text-decoration:none;color:inherit;padding:10px 0;border-bottom:1px solid #f0f0f0;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr>
                <td valign="top">
                  <div style="font-family:'Courier New',monospace;font-size:10px;letter-spacing:0.18em;color:#5fb91f;text-transform:uppercase;font-weight:700;margin-bottom:3px;">Grant · Rolling</div>
                  <div style="font-size:15px;line-height:1.35;color:#0a0a0f;font-weight:600;margin-bottom:3px;">Base Builder Grants — Coinbase</div>
                  <div style="font-size:13px;line-height:1.55;color:#555;">Non-dilutive ETH paid to builders shipping useful things on Base. Lightweight application, fast turnaround.</div>
                </td>
                <td valign="top" width="80" style="text-align:right;padding-top:18px;">
                  <span style="font-family:'Courier New',monospace;font-size:11px;color:#5fb91f;font-weight:700;letter-spacing:0.04em;">non-dilutive</span>
                </td>
              </tr></table>
            </a>

            <a href="https://rexintelservices.com/grants/36f22e02ac65b2b6?utm_source=newsletter&utm_medium=email&utm_campaign=launch" style="display:block;text-decoration:none;color:inherit;padding:10px 0;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr>
                <td valign="top">
                  <div style="font-family:'Courier New',monospace;font-size:10px;letter-spacing:0.18em;color:#5fb91f;text-transform:uppercase;font-weight:700;margin-bottom:3px;">Grant · Rolling · Interop</div>
                  <div style="font-size:15px;line-height:1.35;color:#0a0a0f;font-weight:600;margin-bottom:3px;">Wormhole Sigma Startup Program</div>
                  <div style="font-size:13px;line-height:1.55;color:#555;">Cross-chain dev grants with founder support from Wormhole Foundation — pairs well with anything multi-chain native.</div>
                </td>
                <td valign="top" width="80" style="text-align:right;padding-top:18px;">
                  <span style="font-family:'Courier New',monospace;font-size:11px;color:#5fb91f;font-weight:700;letter-spacing:0.04em;">non-dilutive</span>
                </td>
              </tr></table>
            </a>
          </td>
        </tr>

        <tr>
          <td style="padding:6px 36px 26px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
              <tr>
                <td align="center" style="padding:12px;background:#0a0a0f;border-radius:6px;">
                  <a href="https://rexintelservices.com/accelerators?utm_source=newsletter&utm_medium=email&utm_campaign=launch" style="font-family:'Courier New',monospace;font-size:12px;letter-spacing:0.14em;text-transform:uppercase;color:#5fb91f;font-weight:700;text-decoration:none;">
                    Browse every open program →
                  </a>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <tr>
          <td style="padding:0 36px 28px;">
            <div style="font-size:13px;color:#666;line-height:1.65;padding:14px 16px;background:#f4f4f7;border-radius:6px;">
              <strong style="color:#111;">Sitting on a tip?</strong> The secure inbox is
              <a href="mailto:rexintelservices@proton.me" style="color:#0a0a0f;font-weight:600;">rexintelservices@proton.me</a>.
              Sources are anonymous by default.
            </div>
          </td>
        </tr>

        <tr>
          <td style="padding:20px 36px 28px;border-top:1px solid #e5e5e5;font-family:-apple-system,sans-serif;font-size:12px;color:#888;line-height:1.7;text-align:center;">
            <div style="margin-bottom:6px;">— The Rex Intel Services team</div>
            <div>
              <a href="https://x.com/rexintelservice" style="color:#888;text-decoration:underline;">@rexintelservice</a>
              &nbsp;·&nbsp;
              <a href="https://rexintelservices.com" style="color:#888;text-decoration:underline;">rexintelservices.com</a>
            </div>
          </td>
        </tr>

      </table>
    </td>
  </tr>
</table>`,
};

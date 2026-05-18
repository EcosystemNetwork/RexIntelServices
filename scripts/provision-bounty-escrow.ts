/**
 * scripts/provision-bounty-escrow.ts
 *
 * One-shot provisioning script for the bounty payout rail. The runtime
 * provisions one Circle DCW wallet PER bounty (see provisionBountyWallet in
 * src/lib/bounty-payout.ts) inside a shared wallet *set*. This script's job
 * is therefore to produce a wallet *set id*, not a single wallet — that
 * mismatch was the C1 audit finding pre-launch.
 *
 * Steps:
 *   1. Reads CIRCLE_API_KEY from env (or prompts for it).
 *   2. Auto-detects sandbox vs production from the key prefix (TEST_API_KEY
 *      vs LIVE_API_KEY) and picks the right base URL + chain.
 *   3. Generates a 32-byte entity secret unless CIRCLE_ENTITY_SECRET is
 *      already set.
 *   4. Fetches Circle's RSA public key, encrypts the entity secret with
 *      RSA-OAEP-SHA256 (matches the runtime in src/lib/bounty-payout.ts).
 *   5. Registers the encrypted secret with Circle and writes the
 *      RECOVERY FILE to ./circle-entity-secret-recovery.dat (restricted perms).
 *   6. Creates a wallet set named "RexIntel Bounty Escrow".
 *   7. Prints the exact env-var block to paste into Vercel — including the
 *      operator action required for CIRCLE_WEBHOOK_PUBLIC_KEY (must be
 *      copied out of Circle Console manually).
 *
 * Run:
 *   npx tsx scripts/provision-bounty-escrow.ts
 *
 * Safety:
 *   - Entity secret is shown ONCE at the end. Save it then.
 *   - Recovery file is written with 0o600 perms. Move it offline.
 *   - Script is rerunnable: if CIRCLE_ENTITY_SECRET is already in env, it
 *     skips secret generation and registration and just creates the wallet set.
 *   - Dry-run mode: pass --dry-run to print the steps without hitting Circle.
 */
import "dotenv/config";
import { publicEncrypt, randomBytes, randomUUID } from "node:crypto";
import { writeFileSync, chmodSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import * as readline from "node:readline/promises";
import { stdin, stdout } from "node:process";

type Environment = "sandbox" | "production";

interface CircleConfig {
  apiKey: string;
  baseUrl: string;
  environment: Environment;
  blockchain: "BASE" | "BASE-SEPOLIA";
  usdcTokenAddress: string;
}

const USDC_BASE_MAINNET = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const USDC_BASE_SEPOLIA = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";

const DRY_RUN = process.argv.includes("--dry-run");

async function main() {
  console.log("");
  console.log("=== RexIntel · Bounty Escrow Provisioning ===");
  console.log("");

  const cfg = await loadConfig();
  console.log(`Environment      : ${cfg.environment.toUpperCase()}`);
  console.log(`Base URL         : ${cfg.baseUrl}`);
  console.log(`Blockchain       : ${cfg.blockchain}`);
  console.log(`USDC address     : ${cfg.usdcTokenAddress}`);
  console.log(`Dry run          : ${DRY_RUN ? "YES" : "no"}`);
  console.log("");

  // --- Entity secret (generate or reuse) -----------------------------------
  let entitySecretHex = process.env.CIRCLE_ENTITY_SECRET ?? "";
  let entitySecretSource: "env" | "generated" = "env";
  if (!entitySecretHex) {
    entitySecretHex = randomBytes(32).toString("hex");
    entitySecretSource = "generated";

    // Crash-safety: write the plaintext secret to disk IMMEDIATELY, before
    // any network call that could fail and lose it from memory. The file
    // is chmod 600 and lives next to the recovery file; move it offline
    // along with the recovery file once provisioning succeeds.
    const seedPath = resolve(
      process.cwd(),
      "circle-entity-secret.plaintext.txt",
    );
    if (existsSync(seedPath)) {
      die(
        `An entity-secret plaintext file already exists at ${seedPath}. Move it aside before generating a new one.`,
      );
    }
    writeFileSync(seedPath, entitySecretHex + "\n", { mode: 0o600 });
    chmodSync(seedPath, 0o600);
    console.log(
      `✓ Generated a new 32-byte entity secret and saved plaintext to ${seedPath} (chmod 600).`,
    );
    console.log(
      `  → MOVE THIS OFFLINE along with the recovery file. Required for every subsequent Circle DCW call.`,
    );
  } else {
    if (!/^[0-9a-f]{64}$/i.test(entitySecretHex)) {
      die("CIRCLE_ENTITY_SECRET is set but is not a 64-char hex string.");
    }
    console.log("✓ Reusing CIRCLE_ENTITY_SECRET from env.");
  }

  // --- Register the entity secret with Circle ------------------------------
  // Registration is one-time per environment. If you already registered it
  // (recovery file in hand), pass --skip-register to jump straight to wallet
  // creation. Re-registering is allowed but produces a new recovery file.
  const skipRegister = process.argv.includes("--skip-register");
  if (skipRegister) {
    console.log(
      "↷ Skipping entity-secret registration (--skip-register).",
    );
  } else {
    const ciphertext = await encryptEntitySecret(entitySecretHex, cfg);
    if (DRY_RUN) {
      console.log(
        "↷ Dry run — would POST /v1/w3s/config/entity/entitySecret with the ciphertext + recover the response.",
      );
    } else {
      const reg = await circlePost<{ recoveryFile: string }>(
        cfg,
        "/v1/w3s/config/entity/entitySecret",
        { entitySecretCiphertext: ciphertext },
      );
      const recoveryPath = resolve(
        process.cwd(),
        "circle-entity-secret-recovery.dat",
      );
      if (existsSync(recoveryPath)) {
        die(
          `Recovery file already exists at ${recoveryPath}. Move it aside before re-registering.`,
        );
      }
      writeFileSync(recoveryPath, reg.recoveryFile, { mode: 0o600 });
      chmodSync(recoveryPath, 0o600);
      console.log(`✓ Registered entity secret.`);
      console.log(`  Recovery file: ${recoveryPath} (chmod 600)`);
      console.log(
        `  → MOVE THIS OFFLINE. It's the only way to recover the secret if you lose CIRCLE_ENTITY_SECRET.`,
      );
    }
  }

  // --- Wallet set ----------------------------------------------------------
  let walletSetId: string;
  let walletSetCiphertext: string;
  if (DRY_RUN) {
    console.log(
      "↷ Dry run — would POST /v1/w3s/developer/walletSets with name 'RexIntel Bounty Escrow'.",
    );
    walletSetId = "<wallet-set-id-on-success>";
    walletSetCiphertext = "";
  } else {
    walletSetCiphertext = await encryptEntitySecret(entitySecretHex, cfg);
    const ws = await circlePost<{ walletSet: { id: string } }>(
      cfg,
      "/v1/w3s/developer/walletSets",
      {
        idempotencyKey: randomUUID(),
        entitySecretCiphertext: walletSetCiphertext,
        name: "RexIntel Bounty Escrow",
      },
    );
    walletSetId = ws.walletSet.id;
    console.log(`✓ Created wallet set: ${walletSetId}`);
  }

  // --- Print env block -----------------------------------------------------
  // The runtime creates one wallet per bounty inside this wallet set at
  // bounty-create time (provisionBountyWallet). No singleton wallet here.
  console.log("");
  console.log("─────────────────────────────────────────────────────────────");
  console.log("PASTE THESE INTO VERCEL (Production env, same key set):");
  console.log("─────────────────────────────────────────────────────────────");
  console.log(`CIRCLE_BASE_URL=${cfg.baseUrl}`);
  console.log(`CIRCLE_BOUNTY_BLOCKCHAIN=${cfg.blockchain}`);
  console.log(`CIRCLE_BOUNTY_USDC_TOKEN_ADDRESS=${cfg.usdcTokenAddress}`);
  console.log(`CIRCLE_BOUNTY_WALLET_SET_ID=${walletSetId}`);
  if (entitySecretSource === "generated") {
    console.log(`CIRCLE_ENTITY_SECRET=${entitySecretHex}`);
  } else {
    console.log(
      `CIRCLE_ENTITY_SECRET=<already set in your env; reuse the same value in Vercel>`,
    );
  }
  console.log("");
  console.log("# Required for inbound deposit detection. Copy from Circle");
  console.log("# Console → Webhooks → (create endpoint) → Public Key.");
  console.log("# Set as a single env-var with the PEM literally newline-");
  console.log("# delimited (Vercel UI handles multi-line values fine).");
  console.log("CIRCLE_WEBHOOK_PUBLIC_KEY=<paste PEM from Circle Console>");
  if (entitySecretSource === "generated") {
    console.log("");
    console.log(
      "⚠ The entity secret above is shown ONCE. Save it to your password manager NOW.",
    );
  }
  console.log("─────────────────────────────────────────────────────────────");
  console.log("");
  console.log("Next steps:");
  console.log("  1. Set the env vars above in Vercel.");
  console.log(
    "  2. In Circle Console → Webhooks, create a subscription pointing at",
  );
  console.log(
    `     https://<your-prod-host>/api/webhooks/circle for the events`,
  );
  console.log(
    `     'transactions.created' and 'transactions.updated'. Copy the`,
  );
  console.log(
    `     subscription's Public Key (PEM) into CIRCLE_WEBHOOK_PUBLIC_KEY.`,
  );
  console.log(
    "  3. Redeploy. Bounty creates now provision one escrow wallet per",
  );
  console.log(
    `     bounty inside wallet set ${walletSetId}; the deposit address`,
  );
  console.log(
    "     for each is rendered on the bounty's funding page. The inbound",
  );
  console.log(
    "     webhook flips draft → funded → open. The /api/cron/process-",
  );
  console.log(
    "     bounty-payouts cron drains pending payouts via Circle every 5min.",
  );
  if (cfg.environment === "sandbox") {
    console.log(
      "  4. Sandbox testing: drop testnet USDC via Circle Console → Faucet",
    );
    console.log(
      "     into the per-bounty wallet address shown on the funding page.",
    );
  }
  console.log("");
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function loadConfig(): Promise<CircleConfig> {
  let apiKey = process.env.CIRCLE_API_KEY ?? "";
  if (!apiKey) {
    const rl = readline.createInterface({ input: stdin, output: stdout });
    apiKey = (
      await rl.question(
        "CIRCLE_API_KEY not in env. Paste it now (TEST_API_KEY:... or LIVE_API_KEY:...): ",
      )
    ).trim();
    rl.close();
  }
  if (!apiKey.startsWith("TEST_API_KEY:") && !apiKey.startsWith("LIVE_API_KEY:")) {
    die(
      `CIRCLE_API_KEY has unexpected prefix. Expected TEST_API_KEY:... or LIVE_API_KEY:...`,
    );
  }

  const environment: Environment = apiKey.startsWith("TEST_API_KEY:")
    ? "sandbox"
    : "production";

  // Circle's W3S (Programmable Wallets) uses a SINGLE base URL for both
  // testnet and mainnet — the TEST_API_KEY / LIVE_API_KEY prefix is what
  // toggles environments, not the URL. (Their `api-sandbox.circle.com`
  // hostname is for the legacy Circle Mint / Payments products and 401s
  // every W3S request.) Override via CIRCLE_BASE_URL only if Circle ships
  // a new region endpoint.
  const baseUrl = process.env.CIRCLE_BASE_URL ?? "https://api.circle.com";

  const blockchain: "BASE" | "BASE-SEPOLIA" =
    environment === "sandbox" ? "BASE-SEPOLIA" : "BASE";
  const usdcTokenAddress =
    environment === "sandbox" ? USDC_BASE_SEPOLIA : USDC_BASE_MAINNET;

  return { apiKey, baseUrl, environment, blockchain, usdcTokenAddress };
}

let cachedPublicKey: string | null = null;
async function fetchPublicKey(cfg: CircleConfig): Promise<string> {
  if (cachedPublicKey) return cachedPublicKey;
  const data = await circleGet<{ publicKey: string }>(
    cfg,
    "/v1/w3s/config/entity/publicKey",
  );
  if (!data.publicKey?.includes("BEGIN PUBLIC KEY")) {
    die("Circle returned malformed public key.");
  }
  cachedPublicKey = data.publicKey;
  return data.publicKey;
}

async function encryptEntitySecret(
  entitySecretHex: string,
  cfg: CircleConfig,
): Promise<string> {
  const pem = await fetchPublicKey(cfg);
  const buf = publicEncrypt(
    { key: pem, oaepHash: "sha256" },
    Buffer.from(entitySecretHex, "hex"),
  );
  return buf.toString("base64");
}

async function circleGet<T>(cfg: CircleConfig, path: string): Promise<T> {
  const res = await fetch(`${cfg.baseUrl}${path}`, {
    headers: {
      Authorization: `Bearer ${cfg.apiKey}`,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });
  return parseResponse<T>(res, "GET", path);
}

async function circlePost<T>(
  cfg: CircleConfig,
  path: string,
  body: Record<string, unknown>,
): Promise<T> {
  const res = await fetch(`${cfg.baseUrl}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfg.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  return parseResponse<T>(res, "POST", path);
}

async function parseResponse<T>(
  res: Response,
  method: string,
  path: string,
): Promise<T> {
  if (!res.ok) {
    let detail = "";
    try {
      const body = (await res.json()) as { code?: number; message?: string };
      detail = ` — code=${body.code ?? "?"} message=${body.message ?? "?"}`;
    } catch {
      detail = ` — ${await res.text().catch(() => "")}`;
    }
    die(`Circle ${method} ${path} → ${res.status}${detail}`);
  }
  const json = (await res.json()) as { data: T };
  return json.data;
}

function die(msg: string): never {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

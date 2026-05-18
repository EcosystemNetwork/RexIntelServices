# IntelPrizePool

USDC prize pool with monthly top-5 waterfall distribution, settled by an
off-chain cron and pulled by winners on-chain.

## One-time setup

```bash
# Install Foundry (~/.foundry/bin)
curl -L https://foundry.paradigm.xyz | bash && foundryup

# Install forge-std into contracts/lib
cd contracts && forge install foundry-rs/forge-std --no-commit && cd ..

# Sanity check the contract + tests pass before touching mainnet
cd contracts && forge test -vv && cd ..
```

## Pre-deploy checklist (MUST tick before forge script)

- [ ] `forge test -vv` is green on a fresh clone
- [ ] **Settler key generated fresh, offline**, via `cast wallet new`,
      not your existing deployer / hot wallet. Settler controls every
      monthly distribute() forever — keep it small-blast-radius.
- [ ] Settler address recorded in 1Password under "RexIntel — Prize Pool
      Settler EOA" with private key + creation date
- [ ] `SETTLER` and `USDC_ADDRESS` env vars are set explicitly — the
      deploy script no longer falls back to `msg.sender` for SETTLER
- [ ] Deploy to **Base Sepolia first**, send $5 test USDC, trigger the
      cron, confirm a `Distributed` event lands and a test wallet can
      `claim()` successfully
- [ ] `ADMIN_ALERT_EMAIL` set in Vercel prod (default recipient for
      `sendOpsAlert` from the cron). Fire `/api/admin/onchain/preflight`
      to confirm the alert path lands in inbox before deploying mainnet
- [ ] Settler EOA pre-funded with **≥ 0.05 ETH on Base mainnet** —
      monthly distribute() consumes < 200k gas, but the buffer covers
      retries and gas-spike days

## Deploy to Base mainnet

```bash
cd contracts

# Fresh deployer key. This can be the same as the settler if you must,
# but the recommended path is deploy-key (one-shot) ≠ settler-key
# (used forever).
export PRIVATE_KEY=0x...                              # deployer EOA
export BASE_RPC_URL=https://mainnet.base.org
export BASESCAN_API_KEY=...                           # for source verification

# REQUIRED — the deploy script reverts if either is unset.
export USDC_ADDRESS=0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913  # Base USDC
export SETTLER=0xYourSettlerEoaOrSafe                          # see below

forge script script/DeployIntelPrizePool.s.sol \
  --rpc-url "$BASE_RPC_URL" \
  --private-key "$PRIVATE_KEY" \
  --broadcast \
  --verify \
  --etherscan-api-key "$BASESCAN_API_KEY" \
  -vvv
```

Grep the printed `IntelPrizePool deployed at: 0x...` line for the address.
The script asserts `pool.USDC() == USDC_ADDRESS` and
`pool.settler() == SETTLER` post-deploy — if either mismatches, the run
reverts and nothing pastes to Basescan.

## Rotate settler → Safe multisig (do this BEFORE first distribute())

A single-EOA settler is acceptable for v1, but the recommended posture
is to rotate to a Safe multisig as soon as deploy lands. One key
distributing $X/month forever is a juicy compromise target.

```bash
# 1. Create a Safe at https://app.safe.global on Base mainnet.
#    Suggested: 2-of-3 with Rex hardware key + Rex hot wallet + a
#    recovery key on a separate device.

# 2. From the current (EOA) settler, propose rotation:
cast send $PRIZE_POOL_ADDRESS \
  "proposeSettler(address)" \
  $SAFE_MULTISIG_ADDRESS \
  --rpc-url $BASE_RPC_URL --private-key $SETTLER_PRIVATE_KEY

# 3. From the Safe, send the acceptSettler() tx (via Safe UI tx builder).
#    Once this lands, settler() returns the Safe and the original EOA
#    can no longer call distribute() / rescue() / proposeSettler().

# 4. The cron still signs from SETTLER_PRIVATE_KEY in Vercel — that key
#    is now one of the Safe's signers, not the unilateral settler. The
#    cron's submitDistribute() call needs to be replaced with a Safe
#    proposal flow OR you keep the EOA as a settler-rotator (it can
#    propose another rotation back if the Safe needs replacing).
#
#    OPTION A — simpler: keep the EOA as settler-of-record AND fund
#    distribute() from it; treat the Safe as a backup that can be
#    rotated in via proposeSettler/acceptSettler if the EOA leaks.
#
#    OPTION B — safer: settler IS the Safe; the cron drops its signing
#    duty entirely and a human (Rex) co-signs each monthly distribute
#    via Safe UI. Higher friction but kills the cron-side key custody
#    risk.
```

## Wire the address into the app

```bash
# Production envs (Vercel)
vercel env add PRIZE_POOL_ADDRESS production       # the deployed 0x… address
vercel env add PRIZE_POOL_CHAIN production         # base
vercel env add PRIZE_POOL_ASSET production         # USDC
vercel env add PRIZE_POOL_RPC_URL production       # https://mainnet.base.org
vercel env add SETTLER_PRIVATE_KEY production      # settler EOA key
vercel env add ADMIN_ALERT_EMAIL production        # for sendOpsAlert

# Important: remove or empty PRIZE_POOL_MOCK_BALANCE — in production it's
# ignored anyway, but clearing it avoids confusion in staging.
vercel env rm PRIZE_POOL_MOCK_BALANCE production   # if it exists

# Redeploy so the new envs land
vercel --prod
```

## Verify end-to-end

1. Hit `/api/admin/onchain/preflight` (operator-auth'd) — confirms the
   settler key parses, the contract address is reachable, settler() on
   chain matches the derived EOA, and reports the settler gas balance.
2. Visit `/intel/leaderboard` — pool balance reads $0.00 USDC live from
   the new contract.
3. Send a small USDC amount (e.g. $5) to the contract from any wallet.
   Refresh the leaderboard — the balance updates within ~60s (RPC cache).
4. Manually trigger the settlement cron for testing:
   `curl -H "Authorization: Bearer $CRON_SECRET" \
     https://rexintelservices.com/api/cron/settle-monthly-prizes`
   The first run picks up the current backlog (April 2026 onwards, all
   empty months get rows). Pool balance hasn't been split yet because we
   only settle *prior* months.
5. On the 1st of the next month at 01:00 UTC: the same cron fires
   automatically, computes top-5, calls `distribute()`, and emits the
   `Distributed` event. The monthly_prizes row gets each winner's txHash
   written into the JSONB payouts.
6. Winners visit `/intel/prizes`, sign in via Magic, click "Claim USDC".
   Their Magic-held key signs `claim(202605)`, the contract transfers USDC
   to their wallet, and the row flips to "Claimed".

## How a month plays out

1. Throughout the month: donors send USDC to the contract address. Balance
   accumulates on-chain, viewable on Basescan, and rendered on
   `/intel/leaderboard` via the existing balance fetcher.
2. On the 1st: the `settle-monthly-prizes` cron runs. It:
   - Snapshots the contract's USDC balance via RPC.
   - Computes the 50/25/15/7/3-of-80% waterfall via `computePayouts5()`.
   - Reads the top-5 cooled, self-vote-excluded leaderboard for the prior
     month via `getMonthlyTopIntel({ yearMonth, limit: 5 })`.
   - Filters out zero-amount slots (when the pool is too small to fill
     all 5 places, lower slots round to $0.00 and would otherwise create
     phantom "paid" rows in the DB without an on-chain counterpart).
   - Calls `distribute(YYYYMM, winners[5], amounts[5])` from the settler
     EOA. The contract records the per-winner `owed` mapping and emits a
     `Distributed` event.
   - Writes a `monthly_prizes` row marking the month settled.
3. Winners receive a magic-link email telling them their bounty is ready.
   Clicking through opens a "claim" UI that wallet-connects them and calls
   `claim(YYYYMM)`. USDC lands in their wallet, contract emits `Claimed`.
4. The 20% rollover stays in the contract for the following month's
   distribution.
5. 180 days after settlement: any `owed` entries that nobody claimed
   become reclaimable. The settler can call `reclaimUnclaimed(month,
   winner)` to zero the entry; the USDC stays in the contract and rolls
   over into the next month's pool. This prevents permanent funds-lock
   from a lost wallet.

## Security

- **Pull-based claims** — contract calls `transfer` to msg.sender (the
  claimer), and writes `owed[..][msg.sender] = 0` BEFORE the transfer.
  Reentrancy from a hostile token-receiver hook can only re-enter to
  claim their own already-zeroed amount.
- **SafeERC20-style transfers** — `_safeTransfer` accepts non-standard
  ERC-20s (returns nothing) and reverts on false-returning ones. A
  future Circle USDC proxy upgrade that drops the bool return won't
  brick `claim()`.
- **CEI ordering in distribute()** — total + balance are validated
  BEFORE any `owed` writes. A partial-fill cannot leave the contract
  inconsistent if a future patch removes the revert.
- **One distribute per month** — `distributed[month]` flips true after
  the first successful call; subsequent calls revert.
- **No upgradeability** — bugs require redeploy, not proxy upgrade. The
  pool value at deploy is zero so the cost of a redeploy is gas-only.
- **2-step settler rotation** — `proposeSettler` + `acceptSettler` so a
  typo'd handover doesn't brick the rail. acceptSettler() only callable
  by the proposed address.
- **Rescue ≠ USDC** — `rescue()` explicitly refuses USDC so the settler
  can't drain the pool under the pretext of "wrong token sent." Rescue
  also rejects `to=address(0)` (would burn the rescued token).
- **180-day reclaim window** — settler can recover unclaimed `owed`
  entries back into rollover after 180 days, preventing permanent
  funds-lock from lost wallets. USDC never leaves the contract via
  reclaim.
- **Native ETH rejected** — stray ETH reverts. The pool is
  USDC-denominated; accepting ETH would complicate accounting and open
  a re-entrance surface once settler is a contract (Safe).
- **Explicit-SETTLER deploy** — the deploy script no longer falls back
  to `msg.sender` if `SETTLER` is unset; it reverts. Eliminates the
  silent "deployer becomes settler" path.

## Audit todo before mainnet

- [ ] Slither + Mythril sweep
- [ ] Foundry differential tests vs `computePayouts5()` (TS) — same inputs
      must produce same on-chain amounts to the wei
- [ ] Try a $5 distribute() on Base-Sepolia end-to-end
      (deploy + fund + settle-cron + claim from a Magic wallet)
- [ ] Have a second pair of eyes review (ideally a Solidity dev)

## Operational notes

- **Cron sweep window**: `SETTLE_BACKFILL_MONTHS=6` in the route caps
  catch-up at 6 months. A Vercel cron outage longer than that will
  starve the oldest month; document this if it ever becomes relevant.
- **First-month UX**: if the pool balance is small (<$50) on the first
  cron run, the public banner reads "$0.00 USDC" which looks broken.
  The `/intel/leaderboard` copy is being updated to show "Pool seeding"
  copy under the $50 threshold.
- **Reconciliation**: `/admin/prizes/reconcile?ym=YYYY-MM` (TODO) walks
  the `monthly_prizes` payouts JSON and cross-references against
  on-chain `pendingClaim` + `distributed[month]`. Use this if a row
  ever shows `paid_to` set but `txHash` null (= cron submitted tx but
  receipt was missed; rare with `maxDuration=300`).

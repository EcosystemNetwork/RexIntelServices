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

## Deploy to Base mainnet

```bash
cd contracts

export PRIVATE_KEY=0x...                # NEW key — initial settler EOA
export BASE_RPC_URL=https://mainnet.base.org
export BASESCAN_API_KEY=...             # for source verification
# USDC_ADDRESS and SETTLER fall back to defaults — USDC_ADDRESS=bridged USDC
# on Base, SETTLER=$PRIVATE_KEY's address. Override only if needed.

forge script script/DeployIntelPrizePool.s.sol \
  --rpc-url "$BASE_RPC_URL" \
  --private-key "$PRIVATE_KEY" \
  --broadcast \
  --verify \
  --etherscan-api-key "$BASESCAN_API_KEY" \
  -vvv
```

Grep the printed `IntelPrizePool deployed at: 0x...` line for the address.

## Wire the address into the app

```bash
# Production envs (Vercel)
vercel env add PRIZE_POOL_ADDRESS production       # the deployed 0x… address
vercel env add PRIZE_POOL_CHAIN production         # base
vercel env add PRIZE_POOL_ASSET production         # USDC
vercel env add PRIZE_POOL_RPC_URL production       # https://mainnet.base.org
vercel env add SETTLER_PRIVATE_KEY production      # same key used to deploy

# Important: remove or empty PRIZE_POOL_MOCK_BALANCE — in production it's
# ignored anyway, but clearing it avoids confusion in staging.
vercel env rm PRIZE_POOL_MOCK_BALANCE production   # if it exists

# Redeploy so the new envs land
vercel --prod
```

## Verify end-to-end

1. Visit `/intel/leaderboard` — pool balance reads $0.00 USDC live from
   the new contract.
2. Send a small USDC amount (e.g. $5) to the contract from any wallet.
   Refresh the leaderboard — the balance updates within ~60s (RPC cache).
3. Manually trigger the settlement cron for testing:
   `curl -H "Authorization: Bearer $CRON_SECRET" \
     https://rexintelservices.com/api/cron/settle-monthly-prizes`
   The first run picks up the current backlog (April 2026 onwards, all
   empty months get rows). Pool balance hasn't been split yet because we
   only settle *prior* months.
4. On the 1st of the next month at 01:00 UTC: the same cron fires
   automatically, computes top-5, calls `distribute()`, and emits the
   `Distributed` event. The monthly_prizes row gets each winner's txHash
   written into the JSONB payouts.
5. Winners visit `/intel/prizes`, sign in via Magic, click "Claim USDC".
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
   - Calls `distribute(YYYYMM, winners[5], amounts[5])` from the settler
     EOA. The contract records the per-winner `owed` mapping and emits a
     `Distributed` event.
   - Writes a `monthly_prizes` row marking the month settled.
3. Winners receive a magic-link email telling them their bounty is ready.
   Clicking through opens a "claim" UI that wallet-connects them and calls
   `claim(YYYYMM)`. USDC lands in their wallet, contract emits `Claimed`.
4. The 20% rollover stays in the contract for the following month's
   distribution.

## Security

- **Pull-based claims** — contract calls `transfer` (not `transferTo`), so
  even a hostile token-receiver hook can only re-enter to claim their own
  already-zeroed amount.
- **One distribute per month** — `distributed[month]` flips true after
  the first successful call; subsequent calls revert.
- **No upgradeability** — bugs require redeploy, not proxy upgrade. The
  pool value at deploy is zero so the cost of a redeploy is gas-only.
- **2-step settler rotation** — `proposeSettler` + `acceptSettler` so a
  typo'd handover doesn't brick the rail.
- **Rescue ≠ USDC** — `rescue()` explicitly refuses USDC so the settler
  can't drain the pool under the pretext of "wrong token sent."
- **Native ETH forwarded** — stray ETH goes to settler, not stuck.

## Audit todo before mainnet

- [ ] Slither + Mythril sweep
- [ ] Foundry differential tests vs `computePayouts5()` (TS) — same inputs
      must produce same on-chain amounts to the wei
- [ ] Try a $100 distribute() on Base-Sepolia first
- [ ] Have a second pair of eyes review (ideally a Solidity dev)

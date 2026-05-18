# IntelPrizePool

USDC prize pool with monthly top-5 waterfall distribution, settled by an
off-chain cron and pulled by winners on-chain.

## Deploy (Foundry)

```bash
# Once: install Foundry
curl -L https://foundry.paradigm.xyz | bash && foundryup

# Set env
export PRIVATE_KEY=0x...                # the initial settler EOA's key
export BASE_RPC_URL=https://mainnet.base.org
export USDC_BASE=0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
export SETTLER=0x...                    # same as PRIVATE_KEY's address for v1

# Deploy to Base mainnet
forge create contracts/src/IntelPrizePool.sol:IntelPrizePool \
  --rpc-url "$BASE_RPC_URL" \
  --private-key "$PRIVATE_KEY" \
  --constructor-args "$USDC_BASE" "$SETTLER" \
  --verify --verifier blockscout \
  --verifier-url https://base.blockscout.com/api

# Set the deployed address in Vercel
vercel env add PRIZE_POOL_CONTRACT_ADDRESS production
vercel env add PRIZE_POOL_ADDRESS production  # same value, for the leaderboard balance reader
vercel env add PRIZE_POOL_CHAIN production    # "base"
vercel env add PRIZE_POOL_ASSET production    # "USDC"
```

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

# IntelPrizePool — Operator Recovery Runbook

Single-page runbook for the four most likely incidents on the mainnet
prize-pool rail. Read in advance; reference under fire.

---

## Scenario 1: Settler private key leaked

**Detection:** any tx from the settler EOA that isn't `distribute()` or
`proposeSettler()`. Monitor via Basescan transaction-from filter. Also
the `Rescued` event should be near-zero — if it fires unexpectedly,
treat as a leak signal.

**Response (rotate, don't withdraw):**

1. Generate a fresh EOA offline: `cast wallet new`. Store privkey in
   1Password under "RexIntel — Prize Pool Settler EOA (v2)".
2. From the **leaked** key (assuming you still have a copy), call:
   ```
   cast send $PRIZE_POOL_ADDRESS \
     "proposeSettler(address)" $NEW_SETTLER \
     --rpc-url $BASE_RPC_URL --private-key $LEAKED_SETTLER_KEY
   ```
3. From the new EOA, call:
   ```
   cast send $PRIZE_POOL_ADDRESS \
     "acceptSettler()" \
     --rpc-url $BASE_RPC_URL --private-key $NEW_SETTLER_KEY
   ```
4. Verify rotation: `cast call $PRIZE_POOL_ADDRESS "settler()" --rpc-url $BASE_RPC_URL`
   should return the new EOA.
5. Update `SETTLER_PRIVATE_KEY` in Vercel prod env. Trigger a redeploy.
6. Update the `project_prize_pool_settler_key.md` memory entry with
   the rotation date and the v2 address.

**Note:** the attacker with the leaked key cannot drain the USDC pool —
there is no settler-callable USDC withdrawal path. They CAN:
- Call `distribute()` with bogus winners (cap your loss at the current
  pool balance; you can race to `proposeSettler` first if you spot it).
- Call `rescue()` on non-USDC tokens (low impact; only wrong-token
  deposits could exist there).

---

## Scenario 2: Settler private key LOST (no backup, no rotation possible)

**Detection:** monthly cron starts failing with `NotSettler` or you
realize the seed/passphrase is gone.

**Response (accept and migrate forward):**

1. **No on-chain recovery is possible.** The contract has no
   "owner can rotate without consent" backdoor by design — that would
   itself be a leak vector.
2. The USDC pool is NOT permanently lost — winners with `owed[month]
   [winner] > 0` can still call `claim()` and pull their share.
3. New funds sent to the contract are still distributable IF you
   had a multisig settler at the time of loss (the multisig can keep
   signing). If the settler was a single EOA: the pool is read-only
   from this point.
4. Migration plan:
   - Stop the cron from running: comment out the
     `/api/cron/settle-monthly-prizes` entry in `vercel.json` and
     redeploy. (Otherwise the cron will log errors monthly.)
   - Communicate to donors: stop sending USDC to the contract. Direct
     new donations to a v2 contract address (see Scenario 4).
   - Existing in-flight USDC stays distributable via past `distribute()`
     calls; only future months are lost.

**Prevention going forward:** ALWAYS rotate the EOA settler to a Safe
multisig BEFORE the first mainnet `distribute()`. See
[README.md](./README.md) → "Rotate settler → Safe multisig".

---

## Scenario 3: Bad cron settle — wrong winners, wrong amounts

**Detection:** post-cron review of the `Distributed` event on
Basescan. Compare event args against the off-chain
`monthly_prizes.payouts` JSONB.

**Response:**

1. The `distribute()` call is irreversible. The named winners can
   `claim()` and pull the USDC. There is no settler-callable refund or
   adjustment path.
2. If the wrong-winner amounts are small (e.g. a single $20 payout
   misrouted), accept the loss — the cost of human-managed reversal
   exceeds the loss.
3. If the wrong-winner amounts are large, your only options are:
   - Reach out directly to the wrong winners and ask them not to claim
     (off-chain trust). `reclaimUnclaimed(month, winner)` becomes
     callable after 180 days and zeroes their `owed` entry,
     returning the USDC to the rollover pool.
   - For amounts past the 180-day window, `reclaimUnclaimed` is the
     remediation path.
4. Investigate the cron bug. Likely causes:
   - `getMonthlyTopIntel` returned stale / cached rows.
   - `computePayouts5` math drift from the on-chain expectation
     (covered by the `testFuzz_distribute_matchesTsPayout` differential
     test — if that's still green, the bug is upstream of the math).
   - Wallet resolution wrote the wrong `paidTo` (check `submitters`
     table for the published submitter's wallet vs the on-chain
     `Distributed.winners` event).

---

## Scenario 4: Contract bug requires v2 redeploy

**Detection:** post-deploy audit or vulnerability disclosure
identifies a flaw not caught by the patched contract's test suite.

**Response:**

1. Pause new donations: update `/intel/leaderboard` copy to "Pool
   migration in progress — please hold new contributions" and post on
   X (@rexintelservice).
2. Deploy v2 of `IntelPrizePool` with the fix:
   - New contract address.
   - Settler can be the same Safe multisig (rotate via proposeSettler
     post-deploy) or a fresh EOA.
   - Use the SAME USDC token address as v1.
3. **v1 funds are not portable.** The settler cannot drain v1's USDC
   pool to v2. Two options:
   - Wait out the in-flight monthly distributes. v1 stops accepting
     new donations; existing winners continue to claim from v1.
   - If v1 is bricked entirely, accept the loss for any unclaimed
     amounts. The 180-day `reclaimUnclaimed` does NOT cross contracts.
4. Update `PRIZE_POOL_ADDRESS` in Vercel prod to point to v2. The
   cron + reconcile + claim UI all read from this single env var.
5. Update `project_prize_pool.md` memory with v2 address, deploy
   block, deprecation note for v1.

**Prevention:** Slither + Mythril sweep + Sepolia rehearsal before EVERY
contract change reaches mainnet, even minor patches.

---

## Quick-reference cast invocations

```bash
# Read on-chain state
cast call $PRIZE_POOL_ADDRESS "settler()(address)" --rpc-url $BASE_RPC_URL
cast call $PRIZE_POOL_ADDRESS "distributed(uint256)(bool)" 202607 --rpc-url $BASE_RPC_URL
cast call $PRIZE_POOL_ADDRESS "pendingClaim(uint256,address)(uint256)" 202607 $WINNER --rpc-url $BASE_RPC_URL
cast call $PRIZE_POOL_ADDRESS "distributedAt(uint256)(uint256)" 202607 --rpc-url $BASE_RPC_URL

# Settler rotation
cast send $PRIZE_POOL_ADDRESS "proposeSettler(address)" $NEW --rpc-url $BASE_RPC_URL --private-key $OLD_KEY
cast send $PRIZE_POOL_ADDRESS "acceptSettler()" --rpc-url $BASE_RPC_URL --private-key $NEW_KEY

# Reclaim a stale entry (after 180 days)
cast send $PRIZE_POOL_ADDRESS "reclaimUnclaimed(uint256,address)" 202507 $LOST_WALLET --rpc-url $BASE_RPC_URL --private-key $SETTLER_KEY

# Settler gas balance
cast balance $SETTLER_EOA --rpc-url $BASE_RPC_URL --ether
```

## Operator reconciliation (off-chain ↔ on-chain)

When in doubt, hit `/api/admin/prizes/reconcile?ym=YYYY-MM` on the
production deploy (operator auth required). The route surfaces every
drift mode in one shot: `ok_claimed`, `ok_pending`, `orphan_no_txhash`,
`drift_not_distributed_onchain`, `drift_db_row_missing`. Driving the
runbook with `driftCount: 0` is the success state.

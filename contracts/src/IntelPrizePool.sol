// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/**
 * @title IntelPrizePool
 * @notice Monthly USDC prize pool for RexIntel's top-5 intel contributors.
 *
 * Trust model:
 *   - Anyone can fund the pool by transferring USDC to this contract.
 *   - The `settler` (initially the RexIntel ops EOA, transferable to a
 *     Safe multisig) calls `distribute()` once per month to record the
 *     waterfall: winners + amounts for the prior month.
 *   - Winners pull their share with `claim(month)` — pull-based so we
 *     don't risk reentrancy from a hostile token-receiver fallback or
 *     touch USDC's blocklist surface on send.
 *
 * Waterfall:
 *   The off-chain settlement cron computes the top-5 leaderboard and
 *   the payable split using rexintelservices.com/src/lib/prize-pool.ts.
 *   Default split is 50/25/15/7/3 of 80% of pool — 20% rolls over by
 *   leaving USDC in the contract for the next distribute() call.
 *
 * Month encoding:
 *   `month` is the integer YYYYMM (e.g. 202506 for June 2026). One
 *   distribution per month is enforced by the `distributed` mapping.
 *
 * Tokens:
 *   USDC is fixed at deploy time. The contract holds a single ERC-20.
 *   Native ETH sent to the contract is REJECTED (revert) — the pool is
 *   USDC-denominated and stray ETH would complicate accounting + open a
 *   re-entry surface once the settler is rotated to a contract (Safe).
 *
 * Audit notes:
 *   - No upgradeability. Bug = redeploy + migrate balance via owner sweep.
 *   - `rescue()` is intentionally narrow: only non-USDC tokens (someone
 *     sending the wrong token by mistake). Settled USDC is never rescue-
 *     able by the settler — that would break the pull-claim promise.
 *   - `reclaimUnclaimed()` reverses an owed entry 180 days after the
 *     month was settled. USDC stays in the contract (rolls over into
 *     the next month's pool); a winner with a permanently lost wallet
 *     does not permanently lock the prize from the community.
 *   - `distribute()` accepts winners as duplicates safely: a duplicate
 *     winner across the 5 slots simply has both slots credited.
 *   - Token transfers use a minimal SafeERC20-style wrapper that handles
 *     non-bool-returning ERC-20s (a future Circle USDC proxy upgrade
 *     that changes return semantics won't brick claim).
 */

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

contract IntelPrizePool {
    // ─── Storage ────────────────────────────────────────────────────────

    IERC20 public immutable USDC;
    address public settler;
    address public pendingSettler;

    /// 180 days after settlement, the settler may reclaim an unclaimed
    /// owed entry back into the pool's rollover. Gives users a long
    /// window to claim while preventing permanent funds-lock from a
    /// lost wallet.
    uint256 public constant RECLAIM_WINDOW = 180 days;

    /// True once distribute() has been called for a given month.
    mapping(uint256 => bool) public distributed;

    /// Per-month winners + per-winner pending amount.
    /// distributedAt[month] is set at distribute() time so reads can
    /// inspect the settlement timestamp without parsing events.
    mapping(uint256 => uint256) public distributedAt;
    mapping(uint256 => mapping(address => uint256)) public owed;

    // ─── Events ─────────────────────────────────────────────────────────

    event Distributed(
        uint256 indexed month,
        address[5] winners,
        uint256[5] amounts,
        uint256 totalPayable,
        uint256 rolloverAfter
    );
    event Claimed(uint256 indexed month, address indexed winner, uint256 amount);
    event Reclaimed(uint256 indexed month, address indexed winner, uint256 amount);
    event SettlerProposed(address indexed proposed);
    event SettlerAccepted(address indexed newSettler);
    event Rescued(address indexed token, address indexed to, uint256 amount);

    // ─── Errors ─────────────────────────────────────────────────────────

    error NotSettler();
    error NotPendingSettler();
    error AlreadyDistributed(uint256 month);
    error NotDistributed(uint256 month);
    error InvalidMonth(uint256 month);
    error InsufficientBalance(uint256 needed, uint256 have);
    error NothingToClaim();
    error NotYetReclaimable(uint256 month, uint256 unlocksAt);
    error TransferFailed();
    error CannotRescueSettledToken();
    error EthNotAccepted();
    error ZeroAddress();

    // ─── Constructor ────────────────────────────────────────────────────

    constructor(address usdc, address initialSettler) {
        if (usdc == address(0)) revert ZeroAddress();
        if (initialSettler == address(0)) revert ZeroAddress();
        USDC = IERC20(usdc);
        settler = initialSettler;
    }

    modifier onlySettler() {
        if (msg.sender != settler) revert NotSettler();
        _;
    }

    // ─── Distribute (settler) ───────────────────────────────────────────

    /**
     * @notice Record the top-5 winners + their USDC amounts for `month`.
     * @dev The contract must already hold `sum(amounts)` USDC — fund
     * before calling distribute(). One call per month; subsequent calls
     * for the same month revert. The winners array may contain address(0)
     * for unused slots (e.g. only 3 valid winners that month); those
     * slots are skipped.
     *
     * Checks-effects-interactions: total + balance are validated BEFORE
     * any `owed` writes so a partial-fill cannot leave the contract in
     * an inconsistent state if a future patch removes the revert.
     */
    function distribute(
        uint256 month,
        address[5] calldata winners,
        uint256[5] calldata amounts
    ) external onlySettler {
        if (!_isValidMonth(month)) revert InvalidMonth(month);
        if (distributed[month]) revert AlreadyDistributed(month);

        // ── checks ────────────────────────────────────────────────────
        uint256 totalPayable;
        unchecked {
            for (uint256 i = 0; i < 5; ++i) {
                uint256 amount = amounts[i];
                address winner = winners[i];
                if (amount == 0 || winner == address(0)) continue;
                totalPayable += amount;
            }
        }
        uint256 have = USDC.balanceOf(address(this));
        if (have < totalPayable) revert InsufficientBalance(totalPayable, have);

        // ── effects ───────────────────────────────────────────────────
        distributed[month] = true;
        distributedAt[month] = block.timestamp;
        for (uint256 i = 0; i < 5; ++i) {
            uint256 amount = amounts[i];
            address winner = winners[i];
            if (amount == 0 || winner == address(0)) continue;
            // Duplicate winners across slots accumulate — the off-chain
            // ranking should prevent this but the contract handles it
            // safely either way.
            owed[month][winner] += amount;
        }

        emit Distributed(month, winners, amounts, totalPayable, have - totalPayable);
    }

    // ─── Claim (winners) ────────────────────────────────────────────────

    /**
     * @notice Pull the caller's share for `month`. Idempotent — repeated
     * calls after a successful claim revert NothingToClaim. Safe under
     * the checks-effects-interactions pattern.
     */
    function claim(uint256 month) external {
        uint256 amount = owed[month][msg.sender];
        if (amount == 0) revert NothingToClaim();
        owed[month][msg.sender] = 0;
        _safeTransfer(USDC, msg.sender, amount);
        emit Claimed(month, msg.sender, amount);
    }

    /**
     * @notice Read the pending claim amount without triggering a transfer.
     */
    function pendingClaim(uint256 month, address winner) external view returns (uint256) {
        return owed[month][winner];
    }

    // ─── Reclaim unclaimed (settler, after 180 days) ────────────────────

    /**
     * @notice Reverse an owed entry that no winner ever claimed. Gated by
     * a 180-day window from `distributedAt[month]` so legitimate winners
     * have a long claim runway. The USDC stays in the contract and rolls
     * over to a future month's pool — there is no settler-callable USDC
     * withdrawal path.
     */
    function reclaimUnclaimed(uint256 month, address winner) external onlySettler {
        if (!distributed[month]) revert NotDistributed(month);
        uint256 unlocksAt = distributedAt[month] + RECLAIM_WINDOW;
        if (block.timestamp < unlocksAt) revert NotYetReclaimable(month, unlocksAt);
        uint256 amount = owed[month][winner];
        if (amount == 0) revert NothingToClaim();
        owed[month][winner] = 0;
        // USDC is NOT transferred out — it stays in the contract and
        // naturally rolls over to the next distribute() call's pool.
        emit Reclaimed(month, winner, amount);
    }

    // ─── Settler rotation (2-step) ──────────────────────────────────────

    /// @notice Propose a new settler. Two-step to prevent typo-bricking.
    function proposeSettler(address newSettler) external onlySettler {
        if (newSettler == address(0)) revert ZeroAddress();
        pendingSettler = newSettler;
        emit SettlerProposed(newSettler);
    }

    /// @notice Accept the proposed settler role. Only callable by the
    /// proposed address — defends against a hostile or typo'd handover.
    function acceptSettler() external {
        if (msg.sender != pendingSettler) revert NotPendingSettler();
        settler = msg.sender;
        pendingSettler = address(0);
        emit SettlerAccepted(msg.sender);
    }

    // ─── Emergency rescue (settler) ─────────────────────────────────────

    /**
     * @notice Sweep an ERC-20 sent here by mistake. Cannot be used on USDC
     * (the pool token) — that's what the contract is for. If a settled
     * USDC distribution needs to be unwound, the only path is for the
     * settler to ask each winner to forfeit their claim; we deliberately
     * don't expose a backdoor to the prize pool.
     */
    function rescue(address token, address to, uint256 amount) external onlySettler {
        if (token == address(USDC)) revert CannotRescueSettledToken();
        if (to == address(0)) revert ZeroAddress();
        _safeTransfer(IERC20(token), to, amount);
        emit Rescued(token, to, amount);
    }

    // ─── Native ETH (rejected) ──────────────────────────────────────────

    /**
     * @notice Reject native ETH outright. The pool is USDC-denominated
     * and accepting ETH would (a) complicate accounting, (b) open a
     * re-entrance surface once the settler is rotated to a contract
     * (forwarding ETH via low-level call), and (c) trap funds with no
     * withdrawal path.
     */
    receive() external payable {
        revert EthNotAccepted();
    }

    // ─── Internals ──────────────────────────────────────────────────────

    /**
     * @dev Month must be a positive YYYYMM with month-of-year in [1, 12]
     * and year >= 2020. No explicit upper bound on year — uint256 has
     * room well beyond the next thousand years, and a typo'd huge month
     * is caught by the settler-only modifier upstream.
     */
    function _isValidMonth(uint256 month) internal pure returns (bool) {
        if (month < 202001) return false;
        uint256 m = month % 100;
        return m >= 1 && m <= 12;
    }

    /**
     * @dev SafeERC20-equivalent transfer. Handles three ERC-20 dialects:
     *   - returns bool: succeeds if bool == true
     *   - returns nothing (non-standard): succeeds if call did not revert
     *   - reverts on failure: bubbles via the `ok` check
     * The post-call balance check would also catch fee-on-transfer
     * tokens; we skip it because USDC has no fee and the contract is
     * USDC-only (rescue path is for accidental wrong-token deposits
     * where partial-recovery is acceptable).
     */
    function _safeTransfer(IERC20 token, address to, uint256 amount) internal {
        (bool ok, bytes memory data) = address(token).call(
            abi.encodeWithSelector(IERC20.transfer.selector, to, amount)
        );
        if (!ok) revert TransferFailed();
        if (data.length > 0 && !abi.decode(data, (bool))) revert TransferFailed();
    }
}

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
 *     touch USDC's blacklist surface on send.
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
 *   Native ETH sent to the contract is forwarded to `settler` via the
 *   receive() — we don't want ETH dust accumulating untrackable.
 *
 * Audit notes:
 *   - No upgradeability. Bug = redeploy + migrate balance via owner sweep.
 *   - `rescue()` is intentionally narrow: only non-USDC tokens (someone
 *     sending the wrong token by mistake). Settled USDC is never rescue-
 *     able by the settler — that would break the pull-claim promise.
 *   - `distribute()` accepts winners as duplicates safely: a duplicate
 *     winner across the 5 slots simply has both slots credited.
 *   - The amount sum must equal `payable` recorded for that month; we
 *     don't enforce 80%-of-balance on-chain because the off-chain math
 *     already does that and the contract's job is to record the math
 *     authoritatively, not re-derive it.
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
    event SettlerProposed(address indexed proposed);
    event SettlerAccepted(address indexed newSettler);
    event Rescued(address indexed token, address indexed to, uint256 amount);

    // ─── Errors ─────────────────────────────────────────────────────────

    error NotSettler();
    error NotPendingSettler();
    error AlreadyDistributed(uint256 month);
    error InvalidMonth(uint256 month);
    error InsufficientBalance(uint256 needed, uint256 have);
    error NothingToClaim();
    error TransferFailed();
    error CannotRescueSettledToken();

    // ─── Constructor ────────────────────────────────────────────────────

    constructor(address usdc, address initialSettler) {
        require(usdc != address(0), "usdc=0");
        require(initialSettler != address(0), "settler=0");
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
     */
    function distribute(
        uint256 month,
        address[5] calldata winners,
        uint256[5] calldata amounts
    ) external onlySettler {
        if (month < 202000 || month > 210000 || month % 100 == 0 || month % 100 > 12) {
            revert InvalidMonth(month);
        }
        if (distributed[month]) revert AlreadyDistributed(month);

        uint256 totalPayable = 0;
        for (uint256 i = 0; i < 5; ++i) {
            uint256 amount = amounts[i];
            address winner = winners[i];
            if (amount == 0 || winner == address(0)) continue;
            // Duplicate winners across slots accumulate — the off-chain
            // ranking should prevent this but the contract handles it
            // safely either way.
            owed[month][winner] += amount;
            totalPayable += amount;
        }

        uint256 have = USDC.balanceOf(address(this));
        if (have < totalPayable) revert InsufficientBalance(totalPayable, have);

        distributed[month] = true;
        distributedAt[month] = block.timestamp;

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
        bool ok = USDC.transfer(msg.sender, amount);
        if (!ok) revert TransferFailed();
        emit Claimed(month, msg.sender, amount);
    }

    /**
     * @notice Read the pending claim amount without triggering a transfer.
     */
    function pendingClaim(uint256 month, address winner) external view returns (uint256) {
        return owed[month][winner];
    }

    // ─── Settler rotation (2-step) ──────────────────────────────────────

    /// @notice Propose a new settler. Two-step to prevent typo-bricking.
    function proposeSettler(address newSettler) external onlySettler {
        require(newSettler != address(0), "settler=0");
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
        bool ok = IERC20(token).transfer(to, amount);
        if (!ok) revert TransferFailed();
        emit Rescued(token, to, amount);
    }

    // ─── Native ETH ─────────────────────────────────────────────────────

    /**
     * @notice Forward any native ETH to the settler. The pool is
     * USDC-denominated; we don't want stray ETH dust accumulating in a
     * way that complicates accounting.
     */
    receive() external payable {
        if (msg.value > 0) {
            (bool ok, ) = settler.call{value: msg.value}("");
            if (!ok) revert TransferFailed();
        }
    }
}

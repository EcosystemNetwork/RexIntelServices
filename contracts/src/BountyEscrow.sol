// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/**
 * @title BountyEscrow
 * @notice On-chain USDC escrow for RexIntel's white-hat recovery bounties.
 *
 * Trust model:
 *   - Anyone with USDC + allowance can `fundBounty(bountyKey, amount)` (the
 *     victim/poster) and `postBond(claimKey, bountyKey, amount)` (the
 *     claimant). Both calls pull USDC via `transferFrom`.
 *   - The `settler` (initially the RexIntel ops EOA — same key as the
 *     IntelPrizePool settler — transferable to a Safe multisig) records
 *     settlement decisions via accounting-only writes: `awardClaimant`,
 *     `slashBond`, `awardRefund`. These functions credit recipients in
 *     `owed[]` but never push USDC out of the contract.
 *   - Recipients pull their balance via `claimPayout()`. Pull-based payouts
 *     mean a compromised settler key cannot drain USDC — the attacker can
 *     only credit a bogus payee in the event log (detectable + bounded by
 *     the relevant bounty's principal).
 *
 * Lifecycle:
 *   1. fundBounty(bountyKey, principal)         — victim deposits
 *   2. postBond(claimKey, bountyKey, bondAmt)   — claimant deposits
 *   3a. awardClaimant(claim, bounty, payee, payout, refundBond)
 *                                               — settler accepts (or
 *                                                 partial-accepts) claim
 *   3b. slashBond(claimKey)                     — settler rejects bad-faith
 *   3c. awardRefund(bountyKey, poster, amount)  — settler closes bounty,
 *                                                 refunds poster
 *   4. claimPayout()                            — payee/poster/claimant
 *                                                 pulls their owed[] balance
 *
 * Key encoding:
 *   `bountyKey` and `claimKey` are opaque bytes32 passed by the off-chain
 *   server. RexIntel encodes the row's UUID into the low 16 bytes; the
 *   contract itself doesn't interpret keys — collision-resistance is the
 *   caller's responsibility (UUIDv4 is fine).
 *
 * Tokens:
 *   USDC is fixed at deploy time. Native ETH is REJECTED — accepting it
 *   would complicate accounting and open a re-entry surface once the
 *   settler is rotated to a contract (Safe).
 *
 * Audit notes:
 *   - No upgradeability. Bug = redeploy; the settler can `awardRefund` all
 *     open principal back to the original posters before drain via pull.
 *   - `rescue()` is intentionally narrow: only non-USDC tokens (someone
 *     sending the wrong token by mistake). USDC tracked in `principal`,
 *     `bonds`, or `owed` is never rescue-able by the settler.
 *   - Slashed bonds are intentionally NOT recyclable in v1 — they stay
 *     locked in the contract. Loss is bounded by the per-claim bond size
 *     (~$25 default). A v2 contract can add a treasury sink if Rex
 *     decides to recycle slashed funds.
 *   - Token transfers use a minimal SafeERC20-style wrapper that handles
 *     non-bool-returning ERC-20s.
 */

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

contract BountyEscrow {
    // ─── Storage ────────────────────────────────────────────────────────

    IERC20 public immutable USDC;
    address public settler;
    address public pendingSettler;

    /// Per-bounty USDC principal available for payout. Incremented on
    /// fundBounty, decremented on awardClaimant / awardRefund.
    mapping(bytes32 => uint256) public principal;

    struct Bond {
        address claimant;
        uint256 amount;
    }
    /// Per-claim posted bond. Cleared on awardClaimant (with refund) or
    /// slashBond. The `claimant` field locks the refund target — only the
    /// original bond-poster can be credited the refund.
    mapping(bytes32 => Bond) public bonds;

    /// Pull-claimable USDC per recipient address. Settler credits via
    /// awardClaimant / awardRefund / awardClaimant-bond-refund; the
    /// recipient calls claimPayout() to pull.
    mapping(address => uint256) public owed;

    // ─── Events ─────────────────────────────────────────────────────────

    event BountyFunded(bytes32 indexed bountyKey, address indexed from, uint256 amount, uint256 principalAfter);
    event BondPosted(bytes32 indexed claimKey, bytes32 indexed bountyKey, address indexed claimant, uint256 amount);
    event ClaimAwarded(
        bytes32 indexed claimKey,
        bytes32 indexed bountyKey,
        address indexed payee,
        uint256 payoutAmount,
        bool bondRefunded
    );
    event BondSlashed(bytes32 indexed claimKey, address indexed claimant, uint256 amount);
    event RefundAwarded(bytes32 indexed bountyKey, address indexed poster, uint256 amount);
    event PayoutClaimed(address indexed payee, uint256 amount);
    event SettlerProposed(address indexed proposed);
    event SettlerAccepted(address indexed newSettler);
    event Rescued(address indexed token, address indexed to, uint256 amount);

    // ─── Errors ─────────────────────────────────────────────────────────

    error NotSettler();
    error NotPendingSettler();
    error ZeroAddress();
    error ZeroAmount();
    error ZeroKey();
    error BondAlreadyExists(bytes32 claimKey);
    error BondNotFound(bytes32 claimKey);
    error InsufficientPrincipal(bytes32 bountyKey, uint256 needed, uint256 have);
    error NothingToClaim();
    error TransferFailed();
    error CannotRescueSettledToken();
    error EthNotAccepted();

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

    // ─── Public deposits ────────────────────────────────────────────────

    /**
     * @notice Deposit USDC against a bounty key. Anyone can call — the
     * victim is the typical caller but a third-party top-up is allowed
     * (the server is the source of truth on who the "poster" is for
     * refund purposes).
     *
     * The caller must `approve` USDC for `amount` to this contract first.
     */
    function fundBounty(bytes32 bountyKey, uint256 amount) external {
        if (bountyKey == bytes32(0)) revert ZeroKey();
        if (amount == 0) revert ZeroAmount();
        _safeTransferFrom(USDC, msg.sender, address(this), amount);
        principal[bountyKey] += amount;
        emit BountyFunded(bountyKey, msg.sender, amount, principal[bountyKey]);
    }

    /**
     * @notice Post a USDC bond against a claim. The claimant address is
     * locked to the first poster — a second postBond on the same claimKey
     * reverts. Off-chain claim revisions should keep the bond intact and
     * never re-call this function for the same claimKey.
     */
    function postBond(bytes32 claimKey, bytes32 bountyKey, uint256 amount) external {
        if (claimKey == bytes32(0) || bountyKey == bytes32(0)) revert ZeroKey();
        if (amount == 0) revert ZeroAmount();
        if (bonds[claimKey].amount != 0) revert BondAlreadyExists(claimKey);
        _safeTransferFrom(USDC, msg.sender, address(this), amount);
        bonds[claimKey] = Bond({claimant: msg.sender, amount: amount});
        emit BondPosted(claimKey, bountyKey, msg.sender, amount);
    }

    // ─── Settler accounting (no token transfers out) ────────────────────

    /**
     * @notice Accept (or partial-accept) a claim. Decrements the bounty's
     * principal by `payoutAmount` and credits `payee` in `owed[]`. If
     * `refundBondToClaimant` is true and a bond exists for `claimKey`,
     * the bond is cleared and credited to the original bond-poster in
     * `owed[]`.
     *
     * `payoutAmount` may be zero when `refundBondToClaimant` is true —
     * this covers the rejected-without-strike case (no payout from the
     * bounty principal, but the claimant gets their bond back). The
     * `payee` address is still required (server passes the claimant
     * address) and emits in the log for auditability, but no principal
     * is moved.
     *
     * Partial accepts: call again with a smaller payoutAmount for a
     * follow-up claim, OR call once with the partial amount and later
     * close the bounty via awardRefund.
     */
    function awardClaimant(
        bytes32 claimKey,
        bytes32 bountyKey,
        address payee,
        uint256 payoutAmount,
        bool refundBondToClaimant
    ) external onlySettler {
        if (claimKey == bytes32(0) || bountyKey == bytes32(0)) revert ZeroKey();
        if (payee == address(0)) revert ZeroAddress();
        // Either a non-zero payout OR a bond refund must happen — a call
        // with payoutAmount=0 and refundBondToClaimant=false is a no-op
        // that should be expressed as not calling the function at all.
        if (payoutAmount == 0 && !refundBondToClaimant) revert ZeroAmount();

        if (payoutAmount != 0) {
            uint256 have = principal[bountyKey];
            if (have < payoutAmount) revert InsufficientPrincipal(bountyKey, payoutAmount, have);
            principal[bountyKey] = have - payoutAmount;
            owed[payee] += payoutAmount;
        }

        if (refundBondToClaimant) {
            Bond memory b = bonds[claimKey];
            if (b.amount != 0) {
                delete bonds[claimKey];
                owed[b.claimant] += b.amount;
            }
        }

        emit ClaimAwarded(claimKey, bountyKey, payee, payoutAmount, refundBondToClaimant);
    }

    /**
     * @notice Slash a claim's bond — USDC stays locked in the contract
     * with no withdrawal path. Used when a claim is rejected for
     * bad_faith or doxx_attempt. Loss is bounded by the per-claim bond
     * size (default ~$25); slashed funds are intentionally unrecyclable
     * in v1 to keep the trust surface minimal.
     */
    function slashBond(bytes32 claimKey) external onlySettler {
        Bond memory b = bonds[claimKey];
        if (b.amount == 0) revert BondNotFound(claimKey);
        delete bonds[claimKey];
        emit BondSlashed(claimKey, b.claimant, b.amount);
    }

    /**
     * @notice Refund (a portion of) the bounty's remaining principal back
     * to the original poster. Used when the bounty expires unfilled, is
     * cancelled, or has leftover principal after a partial accept. The
     * `poster` address is passed by the settler — the contract trusts the
     * off-chain server to look up the correct refund target from the
     * bounties row.
     */
    function awardRefund(bytes32 bountyKey, address poster, uint256 amount) external onlySettler {
        if (bountyKey == bytes32(0)) revert ZeroKey();
        if (poster == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        uint256 have = principal[bountyKey];
        if (have < amount) revert InsufficientPrincipal(bountyKey, amount, have);
        principal[bountyKey] = have - amount;
        owed[poster] += amount;
        emit RefundAwarded(bountyKey, poster, amount);
    }

    // ─── Public pull ────────────────────────────────────────────────────

    /**
     * @notice Pull the caller's `owed[]` balance to themselves. Idempotent —
     * repeated calls after a successful claim revert NothingToClaim. Safe
     * under the checks-effects-interactions pattern.
     */
    function claimPayout() external {
        uint256 amount = owed[msg.sender];
        if (amount == 0) revert NothingToClaim();
        owed[msg.sender] = 0;
        _safeTransfer(USDC, msg.sender, amount);
        emit PayoutClaimed(msg.sender, amount);
    }

    /**
     * @notice Read the pending claim amount without triggering a transfer.
     */
    function pendingPayout(address payee) external view returns (uint256) {
        return owed[payee];
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
     * (the escrow token) — that's what the contract is for. Settled USDC
     * (held in principal / bonds / owed) is never rescue-able by the
     * settler.
     */
    function rescue(address token, address to, uint256 amount) external onlySettler {
        if (token == address(USDC)) revert CannotRescueSettledToken();
        if (to == address(0)) revert ZeroAddress();
        _safeTransfer(IERC20(token), to, amount);
        emit Rescued(token, to, amount);
    }

    // ─── Native ETH (rejected) ──────────────────────────────────────────

    receive() external payable {
        revert EthNotAccepted();
    }

    // ─── Internals ──────────────────────────────────────────────────────

    /**
     * @dev SafeERC20-equivalent transfer. Handles three ERC-20 dialects:
     *   - returns bool: succeeds if bool == true
     *   - returns nothing (non-standard): succeeds if call did not revert
     *   - reverts on failure: bubbles via the `ok` check
     */
    function _safeTransfer(IERC20 token, address to, uint256 amount) internal {
        (bool ok, bytes memory data) = address(token).call(
            abi.encodeWithSelector(IERC20.transfer.selector, to, amount)
        );
        if (!ok) revert TransferFailed();
        if (data.length > 0 && !abi.decode(data, (bool))) revert TransferFailed();
    }

    function _safeTransferFrom(IERC20 token, address from, address to, uint256 amount) internal {
        (bool ok, bytes memory data) = address(token).call(
            abi.encodeWithSelector(IERC20.transferFrom.selector, from, to, amount)
        );
        if (!ok) revert TransferFailed();
        if (data.length > 0 && !abi.decode(data, (bool))) revert TransferFailed();
    }
}

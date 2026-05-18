// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test, console2} from "forge-std/Test.sol";
import {IntelPrizePool} from "../src/IntelPrizePool.sol";

/// @dev Minimal ERC-20 stand-in for USDC. Not a faithful USDC (no blocklist,
///      no permit) — we just need transfer/transferFrom/balanceOf semantics.
contract MockUSDC {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    bool public transferShouldFail;

    function setTransferShouldFail(bool v) external {
        transferShouldFail = v;
    }

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        if (transferShouldFail) return false;
        require(balanceOf[msg.sender] >= amount, "balance");
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        require(allowance[from][msg.sender] >= amount, "allowance");
        allowance[from][msg.sender] -= amount;
        require(balanceOf[from] >= amount, "balance");
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

/// @dev ERC-20 that returns no bytes from `transfer` (non-standard like USDT
///      on Ethereum mainnet). The pool's safe-transfer wrapper must accept it.
contract NonReturningToken {
    mapping(address => uint256) public balanceOf;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function transfer(address to, uint256 amount) external {
        require(balanceOf[msg.sender] >= amount, "balance");
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        // Intentionally returns nothing.
    }
}

contract IntelPrizePoolTest is Test {
    IntelPrizePool pool;
    MockUSDC usdc;

    address settler = address(0xA11CE);
    address w1 = address(0xB0B1);
    address w2 = address(0xB0B2);
    address w3 = address(0xB0B3);
    address w4 = address(0xB0B4);
    address w5 = address(0xB0B5);

    function setUp() public {
        usdc = new MockUSDC();
        pool = new IntelPrizePool(address(usdc), settler);
        // Fund the contract with $1000 USDC (6 decimals).
        usdc.mint(address(pool), 1_000 * 1e6);
    }

    // ─── Constructor ──────────────────────────────────────────────────────

    function test_constructor_setsImmutables() public view {
        assertEq(address(pool.USDC()), address(usdc));
        assertEq(pool.settler(), settler);
        assertEq(pool.pendingSettler(), address(0));
    }

    function test_constructor_rejectsZeroUsdc() public {
        vm.expectRevert(IntelPrizePool.ZeroAddress.selector);
        new IntelPrizePool(address(0), settler);
    }

    function test_constructor_rejectsZeroSettler() public {
        vm.expectRevert(IntelPrizePool.ZeroAddress.selector);
        new IntelPrizePool(address(usdc), address(0));
    }

    // ─── distribute ───────────────────────────────────────────────────────

    function test_distribute_happyPath() public {
        // $800 payable across 5 places at 50/25/15/7/3.
        uint256[5] memory amounts = [
            uint256(400 * 1e6), // 50%
            uint256(200 * 1e6), // 25%
            uint256(120 * 1e6), // 15%
            uint256(56 * 1e6),  //  7%
            uint256(24 * 1e6)   //  3%
        ];
        address[5] memory winners = [w1, w2, w3, w4, w5];

        vm.prank(settler);
        pool.distribute(202605, winners, amounts);

        assertTrue(pool.distributed(202605));
        assertGt(pool.distributedAt(202605), 0);
        assertEq(pool.pendingClaim(202605, w1), 400 * 1e6);
        assertEq(pool.pendingClaim(202605, w5), 24 * 1e6);
        // 20% rollover stays in contract.
        assertEq(usdc.balanceOf(address(pool)), 1_000 * 1e6);
    }

    function test_distribute_duplicateWinnerAccumulates() public {
        uint256[5] memory amounts = [
            uint256(100 * 1e6),
            uint256(100 * 1e6),
            uint256(0),
            uint256(0),
            uint256(0)
        ];
        address[5] memory winners = [w1, w1, address(0), address(0), address(0)];

        vm.prank(settler);
        pool.distribute(202605, winners, amounts);

        assertEq(pool.pendingClaim(202605, w1), 200 * 1e6);
    }

    function test_distribute_skipsZeroAddressSlots() public {
        uint256[5] memory amounts = [
            uint256(100 * 1e6),
            uint256(50 * 1e6), // amount set but winner=0 → skipped
            uint256(0),
            uint256(0),
            uint256(0)
        ];
        address[5] memory winners = [w1, address(0), address(0), address(0), address(0)];

        vm.prank(settler);
        pool.distribute(202605, winners, amounts);

        assertEq(pool.pendingClaim(202605, w1), 100 * 1e6);
        // The skipped $50 stays as rollover; pool balance unchanged.
        assertEq(usdc.balanceOf(address(pool)), 1_000 * 1e6);
    }

    function test_distribute_revertsOnDuplicateMonth() public {
        uint256[5] memory amounts = [uint256(1e6), uint256(0), uint256(0), uint256(0), uint256(0)];
        address[5] memory winners = [w1, address(0), address(0), address(0), address(0)];

        vm.prank(settler);
        pool.distribute(202605, winners, amounts);

        vm.expectRevert(abi.encodeWithSelector(IntelPrizePool.AlreadyDistributed.selector, 202605));
        vm.prank(settler);
        pool.distribute(202605, winners, amounts);
    }

    function test_distribute_revertsOnInvalidMonth() public {
        uint256[5] memory amounts = [uint256(1e6), uint256(0), uint256(0), uint256(0), uint256(0)];
        address[5] memory winners = [w1, address(0), address(0), address(0), address(0)];

        // Month 0 within encoded year → invalid (month % 100 == 0)
        vm.prank(settler);
        vm.expectRevert(abi.encodeWithSelector(IntelPrizePool.InvalidMonth.selector, 202600));
        pool.distribute(202600, winners, amounts);

        // Month 13 → invalid
        vm.prank(settler);
        vm.expectRevert(abi.encodeWithSelector(IntelPrizePool.InvalidMonth.selector, 202613));
        pool.distribute(202613, winners, amounts);

        // Year out of range (pre-2020) → invalid
        vm.prank(settler);
        vm.expectRevert(abi.encodeWithSelector(IntelPrizePool.InvalidMonth.selector, 199912));
        pool.distribute(199912, winners, amounts);

        // Year 0 → invalid
        vm.prank(settler);
        vm.expectRevert(abi.encodeWithSelector(IntelPrizePool.InvalidMonth.selector, 0));
        pool.distribute(0, winners, amounts);
    }

    function test_distribute_acceptsBoundaryMonths() public {
        // 2020-01: lower bound — accepted
        uint256[5] memory amounts = [uint256(1e6), uint256(0), uint256(0), uint256(0), uint256(0)];
        address[5] memory winners = [w1, address(0), address(0), address(0), address(0)];
        vm.prank(settler);
        pool.distribute(202001, winners, amounts);
        assertTrue(pool.distributed(202001));

        // 2099-12, 2100-01, 2100-12: upper-bound regression (the old
        // contract rejected anything > 210000 which broke at year 2100).
        vm.prank(settler);
        pool.distribute(209912, winners, amounts);
        assertTrue(pool.distributed(209912));

        vm.prank(settler);
        pool.distribute(210001, winners, amounts);
        assertTrue(pool.distributed(210001));

        vm.prank(settler);
        pool.distribute(210012, winners, amounts);
        assertTrue(pool.distributed(210012));
    }

    function test_distribute_revertsOnInsufficientBalance() public {
        // Drain the pool down to $1 then try to distribute $100.
        vm.prank(address(pool));
        usdc.transfer(address(0xdead), 1_000 * 1e6 - 1e6);
        assertEq(usdc.balanceOf(address(pool)), 1e6);

        uint256[5] memory amounts = [uint256(100 * 1e6), uint256(0), uint256(0), uint256(0), uint256(0)];
        address[5] memory winners = [w1, address(0), address(0), address(0), address(0)];

        vm.prank(settler);
        vm.expectRevert(
            abi.encodeWithSelector(IntelPrizePool.InsufficientBalance.selector, 100 * 1e6, 1e6)
        );
        pool.distribute(202605, winners, amounts);

        // Insufficient-balance revert must NOT have written `owed` for w1.
        // Regression test for the CEI ordering fix (pre-patch the loop
        // wrote owed BEFORE balance check; an EVM revert rolled it back
        // but the ordering was a footgun).
        assertFalse(pool.distributed(202605));
        assertEq(pool.pendingClaim(202605, w1), 0);
    }

    function test_distribute_revertsForNonSettler() public {
        uint256[5] memory amounts = [uint256(1e6), uint256(0), uint256(0), uint256(0), uint256(0)];
        address[5] memory winners = [w1, address(0), address(0), address(0), address(0)];

        vm.prank(w1);
        vm.expectRevert(IntelPrizePool.NotSettler.selector);
        pool.distribute(202605, winners, amounts);
    }

    // ─── claim ────────────────────────────────────────────────────────────

    function test_claim_happyPath() public {
        _distributeOneWinner(w1, 100 * 1e6);

        vm.prank(w1);
        pool.claim(202605);

        assertEq(usdc.balanceOf(w1), 100 * 1e6);
        assertEq(pool.pendingClaim(202605, w1), 0);
    }

    function test_claim_idempotent_revertsSecondTime() public {
        _distributeOneWinner(w1, 100 * 1e6);

        vm.prank(w1);
        pool.claim(202605);

        vm.prank(w1);
        vm.expectRevert(IntelPrizePool.NothingToClaim.selector);
        pool.claim(202605);
    }

    function test_claim_revertsForNonWinner() public {
        _distributeOneWinner(w1, 100 * 1e6);

        vm.prank(w2);
        vm.expectRevert(IntelPrizePool.NothingToClaim.selector);
        pool.claim(202605);
    }

    function test_claim_revertsOnFailedTransfer() public {
        _distributeOneWinner(w1, 100 * 1e6);
        usdc.setTransferShouldFail(true);

        vm.prank(w1);
        vm.expectRevert(IntelPrizePool.TransferFailed.selector);
        pool.claim(202605);
    }

    // ─── reclaim unclaimed ────────────────────────────────────────────────

    function test_reclaim_revertsBeforeWindow() public {
        _distributeOneWinner(w1, 100 * 1e6);
        // Immediately try to reclaim — window is 180 days
        uint256 unlocksAt = block.timestamp + 180 days;
        vm.prank(settler);
        vm.expectRevert(
            abi.encodeWithSelector(
                IntelPrizePool.NotYetReclaimable.selector, 202605, unlocksAt
            )
        );
        pool.reclaimUnclaimed(202605, w1);
    }

    function test_reclaim_afterWindow_zerosOwed() public {
        _distributeOneWinner(w1, 100 * 1e6);

        // Fast-forward past the reclaim window
        vm.warp(block.timestamp + 180 days + 1);

        vm.prank(settler);
        pool.reclaimUnclaimed(202605, w1);

        assertEq(pool.pendingClaim(202605, w1), 0);
        // USDC stays in the contract — no transfer out.
        assertEq(usdc.balanceOf(address(pool)), 1_000 * 1e6);
        assertEq(usdc.balanceOf(w1), 0);
    }

    function test_reclaim_revertsOnUnsettledMonth() public {
        vm.prank(settler);
        vm.expectRevert(
            abi.encodeWithSelector(IntelPrizePool.NotDistributed.selector, 202605)
        );
        pool.reclaimUnclaimed(202605, w1);
    }

    function test_reclaim_revertsOnAlreadyClaimed() public {
        _distributeOneWinner(w1, 100 * 1e6);

        vm.prank(w1);
        pool.claim(202605);

        vm.warp(block.timestamp + 180 days + 1);

        vm.prank(settler);
        vm.expectRevert(IntelPrizePool.NothingToClaim.selector);
        pool.reclaimUnclaimed(202605, w1);
    }

    function test_reclaim_revertsForNonSettler() public {
        _distributeOneWinner(w1, 100 * 1e6);
        vm.warp(block.timestamp + 180 days + 1);

        vm.prank(w1);
        vm.expectRevert(IntelPrizePool.NotSettler.selector);
        pool.reclaimUnclaimed(202605, w1);
    }

    // ─── safe transfer (non-standard ERC-20) ──────────────────────────────

    function test_rescue_acceptsNonReturningErc20() public {
        // USDT-style token that returns no bytes from transfer. The pool's
        // _safeTransfer wrapper must treat "no return data" as success.
        NonReturningToken weird = new NonReturningToken();
        weird.mint(address(pool), 50 * 1e6);

        vm.prank(settler);
        pool.rescue(address(weird), settler, 50 * 1e6);

        assertEq(weird.balanceOf(settler), 50 * 1e6);
    }

    // ─── rescue ───────────────────────────────────────────────────────────

    function test_rescue_nonUsdcOk() public {
        MockUSDC other = new MockUSDC();
        other.mint(address(pool), 50 * 1e6);

        vm.prank(settler);
        pool.rescue(address(other), settler, 50 * 1e6);

        assertEq(other.balanceOf(settler), 50 * 1e6);
    }

    function test_rescue_revertsOnUsdc() public {
        vm.prank(settler);
        vm.expectRevert(IntelPrizePool.CannotRescueSettledToken.selector);
        pool.rescue(address(usdc), settler, 1);
    }

    function test_rescue_revertsOnZeroRecipient() public {
        MockUSDC other = new MockUSDC();
        other.mint(address(pool), 1);
        vm.prank(settler);
        vm.expectRevert(IntelPrizePool.ZeroAddress.selector);
        pool.rescue(address(other), address(0), 1);
    }

    function test_rescue_revertsForNonSettler() public {
        MockUSDC other = new MockUSDC();
        other.mint(address(pool), 1);

        vm.prank(w1);
        vm.expectRevert(IntelPrizePool.NotSettler.selector);
        pool.rescue(address(other), w1, 1);
    }

    // ─── settler rotation ─────────────────────────────────────────────────

    function test_settlerRotation_twoStep() public {
        address newSettler = address(0xC0DE);

        vm.prank(settler);
        pool.proposeSettler(newSettler);
        assertEq(pool.pendingSettler(), newSettler);
        assertEq(pool.settler(), settler); // unchanged until acceptance

        vm.prank(newSettler);
        pool.acceptSettler();
        assertEq(pool.settler(), newSettler);
        assertEq(pool.pendingSettler(), address(0));
    }

    function test_acceptSettler_revertsForNonPending() public {
        vm.prank(settler);
        pool.proposeSettler(address(0xC0DE));

        vm.prank(w1);
        vm.expectRevert(IntelPrizePool.NotPendingSettler.selector);
        pool.acceptSettler();
    }

    function test_proposeSettler_rejectsZero() public {
        vm.prank(settler);
        vm.expectRevert(IntelPrizePool.ZeroAddress.selector);
        pool.proposeSettler(address(0));
    }

    // ─── native ETH (rejected) ────────────────────────────────────────────

    function test_receiveEth_reverts() public {
        vm.deal(address(this), 1 ether);

        vm.expectRevert(IntelPrizePool.EthNotAccepted.selector);
        (bool ok,) = address(pool).call{value: 0.5 ether}("");
        // ok will be false due to revert
        assertFalse(ok);
        assertEq(address(pool).balance, 0);
    }

    // ─── helpers ──────────────────────────────────────────────────────────

    function _distributeOneWinner(address winner, uint256 amount) internal {
        uint256[5] memory amounts =
            [amount, uint256(0), uint256(0), uint256(0), uint256(0)];
        address[5] memory winners =
            [winner, address(0), address(0), address(0), address(0)];
        vm.prank(settler);
        pool.distribute(202605, winners, amounts);
    }
}

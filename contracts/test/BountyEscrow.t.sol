// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test, console2} from "forge-std/Test.sol";
import {BountyEscrow} from "../src/BountyEscrow.sol";

/// @dev Minimal ERC-20 stand-in for USDC. Same shape as the IntelPrizePool
///      test mock — transferFrom is exercised by the escrow's deposit paths.
contract MockUSDC {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    bool public transferShouldFail;

    function setTransferShouldFail(bool v) external {
        transferShouldFail = v;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
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
///      on Ethereum mainnet). The escrow's safe-transfer wrapper must accept it.
contract NonReturningToken {
    mapping(address => uint256) public balanceOf;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function transfer(address to, uint256 amount) external {
        require(balanceOf[msg.sender] >= amount, "balance");
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
    }
}

contract BountyEscrowTest is Test {
    BountyEscrow esc;
    MockUSDC usdc;

    address settler = address(0xA11CE);
    address victim = address(0xC0DE01);
    address victim2 = address(0xC0DE02);
    address claimant = address(0xCA1A47);
    address claimant2 = address(0xCA1A48);
    address payee = address(0xDA11EE);
    address stranger = address(0xDEADBEEF);

    bytes32 constant BOUNTY_A = bytes32(uint256(0xB001));
    bytes32 constant BOUNTY_B = bytes32(uint256(0xB002));
    bytes32 constant CLAIM_A1 = bytes32(uint256(0xC0A1));
    bytes32 constant CLAIM_A2 = bytes32(uint256(0xC0A2));

    function setUp() public {
        usdc = new MockUSDC();
        esc = new BountyEscrow(address(usdc), settler);
        // Mint and pre-approve victims + claimants. Bounties are denominated
        // in 6-decimal USDC; defaults below use $1000 principal + $25 bond.
        usdc.mint(victim, 10_000 * 1e6);
        usdc.mint(victim2, 10_000 * 1e6);
        usdc.mint(claimant, 1_000 * 1e6);
        usdc.mint(claimant2, 1_000 * 1e6);
        vm.prank(victim); usdc.approve(address(esc), type(uint256).max);
        vm.prank(victim2); usdc.approve(address(esc), type(uint256).max);
        vm.prank(claimant); usdc.approve(address(esc), type(uint256).max);
        vm.prank(claimant2); usdc.approve(address(esc), type(uint256).max);
    }

    // ─── Constructor ──────────────────────────────────────────────────────

    function test_constructor_setsImmutables() public view {
        assertEq(address(esc.USDC()), address(usdc));
        assertEq(esc.settler(), settler);
        assertEq(esc.pendingSettler(), address(0));
    }

    function test_constructor_rejectsZeroUsdc() public {
        vm.expectRevert(BountyEscrow.ZeroAddress.selector);
        new BountyEscrow(address(0), settler);
    }

    function test_constructor_rejectsZeroSettler() public {
        vm.expectRevert(BountyEscrow.ZeroAddress.selector);
        new BountyEscrow(address(usdc), address(0));
    }

    // ─── fundBounty ───────────────────────────────────────────────────────

    function test_fundBounty_happyPath() public {
        vm.prank(victim);
        esc.fundBounty(BOUNTY_A, 1_000 * 1e6);

        assertEq(esc.principal(BOUNTY_A), 1_000 * 1e6);
        assertEq(usdc.balanceOf(address(esc)), 1_000 * 1e6);
        assertEq(usdc.balanceOf(victim), 9_000 * 1e6);
    }

    function test_fundBounty_accumulatesAcrossCallers() public {
        vm.prank(victim);
        esc.fundBounty(BOUNTY_A, 500 * 1e6);
        vm.prank(victim2);
        esc.fundBounty(BOUNTY_A, 300 * 1e6);

        assertEq(esc.principal(BOUNTY_A), 800 * 1e6);
        assertEq(usdc.balanceOf(address(esc)), 800 * 1e6);
    }

    function test_fundBounty_rejectsZeroAmount() public {
        vm.prank(victim);
        vm.expectRevert(BountyEscrow.ZeroAmount.selector);
        esc.fundBounty(BOUNTY_A, 0);
    }

    function test_fundBounty_rejectsZeroKey() public {
        vm.prank(victim);
        vm.expectRevert(BountyEscrow.ZeroKey.selector);
        esc.fundBounty(bytes32(0), 100 * 1e6);
    }

    // ─── postBond ─────────────────────────────────────────────────────────

    function test_postBond_happyPath() public {
        vm.prank(claimant);
        esc.postBond(CLAIM_A1, BOUNTY_A, 25 * 1e6);

        (address c, uint256 amt) = esc.bonds(CLAIM_A1);
        assertEq(c, claimant);
        assertEq(amt, 25 * 1e6);
        assertEq(usdc.balanceOf(address(esc)), 25 * 1e6);
    }

    function test_postBond_doublePostReverts() public {
        vm.prank(claimant);
        esc.postBond(CLAIM_A1, BOUNTY_A, 25 * 1e6);

        vm.expectRevert(abi.encodeWithSelector(BountyEscrow.BondAlreadyExists.selector, CLAIM_A1));
        vm.prank(claimant2);
        esc.postBond(CLAIM_A1, BOUNTY_A, 25 * 1e6);
    }

    function test_postBond_rejectsZeroAmount() public {
        vm.prank(claimant);
        vm.expectRevert(BountyEscrow.ZeroAmount.selector);
        esc.postBond(CLAIM_A1, BOUNTY_A, 0);
    }

    function test_postBond_rejectsZeroKeys() public {
        vm.prank(claimant);
        vm.expectRevert(BountyEscrow.ZeroKey.selector);
        esc.postBond(bytes32(0), BOUNTY_A, 25 * 1e6);

        vm.prank(claimant);
        vm.expectRevert(BountyEscrow.ZeroKey.selector);
        esc.postBond(CLAIM_A1, bytes32(0), 25 * 1e6);
    }

    // ─── awardClaimant ────────────────────────────────────────────────────

    function test_awardClaimant_fullPayoutWithBondRefund() public {
        vm.prank(victim);
        esc.fundBounty(BOUNTY_A, 1_000 * 1e6);
        vm.prank(claimant);
        esc.postBond(CLAIM_A1, BOUNTY_A, 25 * 1e6);

        vm.prank(settler);
        esc.awardClaimant(CLAIM_A1, BOUNTY_A, payee, 1_000 * 1e6, true);

        assertEq(esc.principal(BOUNTY_A), 0);
        assertEq(esc.pendingPayout(payee), 1_000 * 1e6);
        assertEq(esc.pendingPayout(claimant), 25 * 1e6);
        // Bond cleared.
        (address c, uint256 amt) = esc.bonds(CLAIM_A1);
        assertEq(c, address(0));
        assertEq(amt, 0);
    }

    function test_awardClaimant_partialPayoutLeavesPrincipal() public {
        vm.prank(victim);
        esc.fundBounty(BOUNTY_A, 1_000 * 1e6);

        vm.prank(settler);
        esc.awardClaimant(CLAIM_A1, BOUNTY_A, payee, 400 * 1e6, false);

        assertEq(esc.principal(BOUNTY_A), 600 * 1e6);
        assertEq(esc.pendingPayout(payee), 400 * 1e6);
    }

    function test_awardClaimant_skipsBondRefundWhenFlagFalse() public {
        vm.prank(victim);
        esc.fundBounty(BOUNTY_A, 1_000 * 1e6);
        vm.prank(claimant);
        esc.postBond(CLAIM_A1, BOUNTY_A, 25 * 1e6);

        vm.prank(settler);
        esc.awardClaimant(CLAIM_A1, BOUNTY_A, payee, 1_000 * 1e6, false);

        // Bond stays put — claimant has no pending payout.
        (, uint256 amt) = esc.bonds(CLAIM_A1);
        assertEq(amt, 25 * 1e6);
        assertEq(esc.pendingPayout(claimant), 0);
    }

    function test_awardClaimant_revertsOnInsufficientPrincipal() public {
        vm.prank(victim);
        esc.fundBounty(BOUNTY_A, 100 * 1e6);

        vm.prank(settler);
        vm.expectRevert(
            abi.encodeWithSelector(
                BountyEscrow.InsufficientPrincipal.selector, BOUNTY_A, 200 * 1e6, 100 * 1e6
            )
        );
        esc.awardClaimant(CLAIM_A1, BOUNTY_A, payee, 200 * 1e6, false);
    }

    function test_awardClaimant_rejectsNonSettler() public {
        vm.prank(victim);
        esc.fundBounty(BOUNTY_A, 1_000 * 1e6);

        vm.prank(stranger);
        vm.expectRevert(BountyEscrow.NotSettler.selector);
        esc.awardClaimant(CLAIM_A1, BOUNTY_A, payee, 100 * 1e6, false);
    }

    function test_awardClaimant_rejectsZeroPayee() public {
        vm.prank(victim);
        esc.fundBounty(BOUNTY_A, 1_000 * 1e6);

        vm.prank(settler);
        vm.expectRevert(BountyEscrow.ZeroAddress.selector);
        esc.awardClaimant(CLAIM_A1, BOUNTY_A, address(0), 100 * 1e6, false);
    }

    function test_awardClaimant_zeroPayoutWithBondRefundIsAllowed() public {
        // Rejected-no-strike path: no payout, just bond refund.
        vm.prank(victim);
        esc.fundBounty(BOUNTY_A, 1_000 * 1e6);
        vm.prank(claimant);
        esc.postBond(CLAIM_A1, BOUNTY_A, 25 * 1e6);

        vm.prank(settler);
        esc.awardClaimant(CLAIM_A1, BOUNTY_A, claimant, 0, true);

        // Principal untouched, bond cleared, claimant credited.
        assertEq(esc.principal(BOUNTY_A), 1_000 * 1e6);
        (, uint256 amt) = esc.bonds(CLAIM_A1);
        assertEq(amt, 0);
        assertEq(esc.pendingPayout(claimant), 25 * 1e6);
    }

    function test_awardClaimant_zeroPayoutWithoutBondRefundReverts() public {
        // Caller is expressing "do nothing" — should be a no-call, not a no-op.
        vm.prank(settler);
        vm.expectRevert(BountyEscrow.ZeroAmount.selector);
        esc.awardClaimant(CLAIM_A1, BOUNTY_A, payee, 0, false);
    }

    function test_awardClaimant_refundFlagWithoutBondIsSafe() public {
        // Setting refundBondToClaimant=true when no bond exists should be
        // a no-op rather than a revert — the off-chain server should never
        // do this, but defensive behavior keeps a settler typo from
        // bricking a settlement.
        vm.prank(victim);
        esc.fundBounty(BOUNTY_A, 1_000 * 1e6);

        vm.prank(settler);
        esc.awardClaimant(CLAIM_A1, BOUNTY_A, payee, 100 * 1e6, true);

        assertEq(esc.pendingPayout(payee), 100 * 1e6);
        assertEq(esc.pendingPayout(claimant), 0);
    }

    // ─── slashBond ────────────────────────────────────────────────────────

    function test_slashBond_happyPath() public {
        vm.prank(claimant);
        esc.postBond(CLAIM_A1, BOUNTY_A, 25 * 1e6);

        uint256 escBalanceBefore = usdc.balanceOf(address(esc));
        vm.prank(settler);
        esc.slashBond(CLAIM_A1);

        (address c, uint256 amt) = esc.bonds(CLAIM_A1);
        assertEq(c, address(0));
        assertEq(amt, 0);
        // USDC stays in the contract — slashed bonds are unrecyclable in v1.
        assertEq(usdc.balanceOf(address(esc)), escBalanceBefore);
        // Claimant gets nothing back.
        assertEq(esc.pendingPayout(claimant), 0);
    }

    function test_slashBond_rejectsMissingBond() public {
        vm.prank(settler);
        vm.expectRevert(abi.encodeWithSelector(BountyEscrow.BondNotFound.selector, CLAIM_A1));
        esc.slashBond(CLAIM_A1);
    }

    function test_slashBond_rejectsNonSettler() public {
        vm.prank(claimant);
        esc.postBond(CLAIM_A1, BOUNTY_A, 25 * 1e6);

        vm.prank(stranger);
        vm.expectRevert(BountyEscrow.NotSettler.selector);
        esc.slashBond(CLAIM_A1);
    }

    // ─── awardRefund ──────────────────────────────────────────────────────

    function test_awardRefund_happyPath() public {
        vm.prank(victim);
        esc.fundBounty(BOUNTY_A, 1_000 * 1e6);

        vm.prank(settler);
        esc.awardRefund(BOUNTY_A, victim, 1_000 * 1e6);

        assertEq(esc.principal(BOUNTY_A), 0);
        assertEq(esc.pendingPayout(victim), 1_000 * 1e6);
    }

    function test_awardRefund_partialIsAllowed() public {
        vm.prank(victim);
        esc.fundBounty(BOUNTY_A, 1_000 * 1e6);

        vm.prank(settler);
        esc.awardRefund(BOUNTY_A, victim, 400 * 1e6);

        assertEq(esc.principal(BOUNTY_A), 600 * 1e6);
        assertEq(esc.pendingPayout(victim), 400 * 1e6);
    }

    function test_awardRefund_revertsOnInsufficientPrincipal() public {
        vm.prank(victim);
        esc.fundBounty(BOUNTY_A, 100 * 1e6);

        vm.prank(settler);
        vm.expectRevert(
            abi.encodeWithSelector(
                BountyEscrow.InsufficientPrincipal.selector, BOUNTY_A, 200 * 1e6, 100 * 1e6
            )
        );
        esc.awardRefund(BOUNTY_A, victim, 200 * 1e6);
    }

    function test_awardRefund_rejectsNonSettler() public {
        vm.prank(victim);
        esc.fundBounty(BOUNTY_A, 1_000 * 1e6);

        vm.prank(stranger);
        vm.expectRevert(BountyEscrow.NotSettler.selector);
        esc.awardRefund(BOUNTY_A, victim, 100 * 1e6);
    }

    function test_awardRefund_rejectsZeroPoster() public {
        vm.prank(victim);
        esc.fundBounty(BOUNTY_A, 1_000 * 1e6);

        vm.prank(settler);
        vm.expectRevert(BountyEscrow.ZeroAddress.selector);
        esc.awardRefund(BOUNTY_A, address(0), 100 * 1e6);
    }

    // ─── claimPayout ──────────────────────────────────────────────────────

    function test_claimPayout_happyPath() public {
        vm.prank(victim);
        esc.fundBounty(BOUNTY_A, 1_000 * 1e6);
        vm.prank(settler);
        esc.awardClaimant(CLAIM_A1, BOUNTY_A, payee, 1_000 * 1e6, false);

        vm.prank(payee);
        esc.claimPayout();

        assertEq(esc.pendingPayout(payee), 0);
        assertEq(usdc.balanceOf(payee), 1_000 * 1e6);
    }

    function test_claimPayout_accumulatesAcrossSources() public {
        // Same payee gets credited by two separate awards.
        vm.prank(victim);
        esc.fundBounty(BOUNTY_A, 1_000 * 1e6);
        vm.prank(victim2);
        esc.fundBounty(BOUNTY_B, 500 * 1e6);

        vm.prank(settler);
        esc.awardClaimant(CLAIM_A1, BOUNTY_A, payee, 400 * 1e6, false);
        vm.prank(settler);
        esc.awardClaimant(CLAIM_A2, BOUNTY_B, payee, 200 * 1e6, false);

        assertEq(esc.pendingPayout(payee), 600 * 1e6);

        vm.prank(payee);
        esc.claimPayout();
        assertEq(usdc.balanceOf(payee), 600 * 1e6);
    }

    function test_claimPayout_revertsWhenNothingToClaim() public {
        vm.prank(stranger);
        vm.expectRevert(BountyEscrow.NothingToClaim.selector);
        esc.claimPayout();
    }

    function test_claimPayout_idempotent() public {
        vm.prank(victim);
        esc.fundBounty(BOUNTY_A, 1_000 * 1e6);
        vm.prank(settler);
        esc.awardClaimant(CLAIM_A1, BOUNTY_A, payee, 100 * 1e6, false);

        vm.prank(payee);
        esc.claimPayout();

        // Second call after balance drained → reverts.
        vm.prank(payee);
        vm.expectRevert(BountyEscrow.NothingToClaim.selector);
        esc.claimPayout();
    }

    // ─── Settler rotation ─────────────────────────────────────────────────

    function test_settlerRotation_twoStepHandoff() public {
        address newSettler = address(0xBEEF);

        vm.prank(settler);
        esc.proposeSettler(newSettler);
        assertEq(esc.pendingSettler(), newSettler);
        assertEq(esc.settler(), settler);

        vm.prank(newSettler);
        esc.acceptSettler();
        assertEq(esc.settler(), newSettler);
        assertEq(esc.pendingSettler(), address(0));
    }

    function test_settlerRotation_onlyPendingCanAccept() public {
        address newSettler = address(0xBEEF);
        vm.prank(settler);
        esc.proposeSettler(newSettler);

        vm.prank(stranger);
        vm.expectRevert(BountyEscrow.NotPendingSettler.selector);
        esc.acceptSettler();
    }

    function test_settlerRotation_proposeRejectsZero() public {
        vm.prank(settler);
        vm.expectRevert(BountyEscrow.ZeroAddress.selector);
        esc.proposeSettler(address(0));
    }

    function test_settlerRotation_proposeRejectsNonSettler() public {
        vm.prank(stranger);
        vm.expectRevert(BountyEscrow.NotSettler.selector);
        esc.proposeSettler(address(0xBEEF));
    }

    // ─── Rescue + ETH ─────────────────────────────────────────────────────

    function test_rescue_cannotRescueUsdc() public {
        vm.prank(settler);
        vm.expectRevert(BountyEscrow.CannotRescueSettledToken.selector);
        esc.rescue(address(usdc), stranger, 1);
    }

    function test_rescue_canSweepWrongToken() public {
        NonReturningToken wrong = new NonReturningToken();
        wrong.mint(address(esc), 42);

        vm.prank(settler);
        esc.rescue(address(wrong), stranger, 42);

        assertEq(wrong.balanceOf(stranger), 42);
        assertEq(wrong.balanceOf(address(esc)), 0);
    }

    function test_rescue_rejectsNonSettler() public {
        vm.prank(stranger);
        vm.expectRevert(BountyEscrow.NotSettler.selector);
        esc.rescue(address(usdc), stranger, 1);
    }

    function test_rescue_rejectsZeroRecipient() public {
        NonReturningToken wrong = new NonReturningToken();
        wrong.mint(address(esc), 1);

        vm.prank(settler);
        vm.expectRevert(BountyEscrow.ZeroAddress.selector);
        esc.rescue(address(wrong), address(0), 1);
    }

    function test_eth_rejected() public {
        vm.deal(stranger, 1 ether);
        vm.prank(stranger);
        (bool ok, ) = address(esc).call{value: 1 ether}("");
        assertFalse(ok, "ETH should revert");
        assertEq(address(esc).balance, 0);
    }

    // ─── End-to-end lifecycle ─────────────────────────────────────────────

    function test_lifecycle_fundClaimAwardWithdraw() public {
        // 1) Victim funds.
        vm.prank(victim);
        esc.fundBounty(BOUNTY_A, 1_000 * 1e6);

        // 2) Two claimants post bonds.
        vm.prank(claimant);
        esc.postBond(CLAIM_A1, BOUNTY_A, 25 * 1e6);
        vm.prank(claimant2);
        esc.postBond(CLAIM_A2, BOUNTY_A, 25 * 1e6);

        // 3) Settler partial-accepts the first claim, refunds bond.
        vm.prank(settler);
        esc.awardClaimant(CLAIM_A1, BOUNTY_A, claimant, 600 * 1e6, true);

        // 4) Settler slashes the second (bad-faith).
        vm.prank(settler);
        esc.slashBond(CLAIM_A2);

        // 5) Settler refunds the remaining principal to the victim.
        vm.prank(settler);
        esc.awardRefund(BOUNTY_A, victim, 400 * 1e6);

        // 6) Everyone pulls.
        uint256 claimantBalBefore = usdc.balanceOf(claimant);
        vm.prank(claimant);
        esc.claimPayout();
        // Claimant got payout + bond refund = 600 + 25 = 625
        assertEq(usdc.balanceOf(claimant) - claimantBalBefore, 625 * 1e6);

        vm.prank(victim);
        esc.claimPayout();
        // Victim got 400 back (started with 10000, spent 1000, refunded 400).
        assertEq(usdc.balanceOf(victim), 9_400 * 1e6);

        // Principal drained, contract holds only the slashed bond ($25).
        assertEq(esc.principal(BOUNTY_A), 0);
        assertEq(usdc.balanceOf(address(esc)), 25 * 1e6);
    }
}

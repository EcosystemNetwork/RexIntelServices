// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {BountyEscrow} from "../src/BountyEscrow.sol";

/**
 * @notice Deploy BountyEscrow to Base mainnet (or any EVM chain).
 *
 * Env vars (BOTH REQUIRED — no fallbacks on mainnet):
 *   USDC_ADDRESS  — ERC-20 the escrow denominates in. For Base mainnet
 *                   this is 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913.
 *   SETTLER       — initial settler address. SHOULD be a Safe multisig.
 *                   If you must launch with an EOA (e.g. share the same
 *                   key as PRIZE_POOL's settler), rotate to a multisig
 *                   via proposeSettler() / acceptSettler() once the
 *                   bounty pot has grown enough to justify the friction.
 *
 * Usage (Base mainnet):
 *   USDC_ADDRESS=0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913 \
 *   SETTLER=0xYourSettlerEOAOrSafe \
 *   forge script contracts/script/DeployBountyEscrow.s.sol \
 *     --rpc-url $BASE_RPC_URL \
 *     --private-key $DEPLOYER_PRIVATE_KEY \
 *     --broadcast \
 *     --verify \
 *     --etherscan-api-key $BASESCAN_API_KEY \
 *     -vvv
 *
 * The script prints the deployed contract address as its final log line
 * and asserts the constructor args read back correctly before exiting.
 */
contract DeployBountyEscrow is Script {
    function run() external returns (BountyEscrow esc) {
        // vm.envAddress reverts when the env var is unset — that's the
        // behavior we want. NO fallback: explicit SETTLER is mandatory.
        address usdc = vm.envAddress("USDC_ADDRESS");
        address settler = vm.envAddress("SETTLER");

        require(usdc != address(0), "USDC_ADDRESS=0");
        require(settler != address(0), "SETTLER=0");

        console2.log("Deploying BountyEscrow");
        console2.log("  USDC:    ", usdc);
        console2.log("  Settler: ", settler);

        vm.startBroadcast();
        esc = new BountyEscrow(usdc, settler);
        vm.stopBroadcast();

        // Sanity: constructor args round-trip. Catches a fat-finger in
        // the deploy bytecode before the operator pastes the address
        // into Vercel and the server starts hitting it.
        require(address(esc.USDC()) == usdc, "USDC mismatch");
        require(esc.settler() == settler, "settler mismatch");
        require(esc.pendingSettler() == address(0), "pendingSettler not zero");

        console2.log("BountyEscrow deployed at:", address(esc));
    }
}

// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {IntelPrizePool} from "../src/IntelPrizePool.sol";

/**
 * @notice Deploy IntelPrizePool to Base mainnet (or any EVM chain).
 *
 * Env vars (BOTH REQUIRED — no fallbacks on mainnet):
 *   USDC_ADDRESS  — ERC-20 the pool denominates in. For Base mainnet
 *                   this is 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913.
 *   SETTLER       — initial settler address. SHOULD be a Safe multisig.
 *                   If you must launch with an EOA, rotate to a multisig
 *                   via proposeSettler() / acceptSettler() before the
 *                   first distribute() call.
 *
 * The previous version of this script defaulted SETTLER to the
 * broadcasting EOA, which made deploy-key = settler-key the path of
 * least resistance and concentrated full pool control in one key.
 * That fallback was removed — a missing SETTLER env now hard-fails.
 *
 * Usage (Base mainnet):
 *   USDC_ADDRESS=0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913 \
 *   SETTLER=0xYourSafeMultisigOrFreshEOA \
 *   forge script contracts/script/DeployIntelPrizePool.s.sol \
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
contract DeployIntelPrizePool is Script {
    function run() external returns (IntelPrizePool pool) {
        // vm.envAddress reverts when the env var is unset — that's the
        // behavior we want. NO fallback: explicit SETTLER is mandatory.
        address usdc = vm.envAddress("USDC_ADDRESS");
        address settler = vm.envAddress("SETTLER");

        require(usdc != address(0), "USDC_ADDRESS=0");
        require(settler != address(0), "SETTLER=0");

        console2.log("Deploying IntelPrizePool");
        console2.log("  USDC:    ", usdc);
        console2.log("  Settler: ", settler);

        vm.startBroadcast();
        pool = new IntelPrizePool(usdc, settler);
        vm.stopBroadcast();

        // Sanity: constructor args round-trip. Catches a fat-finger in
        // the deploy bytecode before the operator pastes the address
        // into Vercel and the cron starts hitting it.
        require(address(pool.USDC()) == usdc, "USDC mismatch");
        require(pool.settler() == settler, "settler mismatch");
        require(pool.pendingSettler() == address(0), "pendingSettler not zero");

        console2.log("IntelPrizePool deployed at:", address(pool));
    }
}

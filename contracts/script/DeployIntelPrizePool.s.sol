// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {IntelPrizePool} from "../src/IntelPrizePool.sol";

/**
 * @notice Deploy IntelPrizePool to Base mainnet (or any EVM chain).
 *
 * Env vars:
 *   USDC_ADDRESS      — ERC-20 the pool denominates in. Defaults to Base
 *                       mainnet USDC if unset. Must be set explicitly on
 *                       any other chain.
 *   SETTLER           — initial settler address. Defaults to msg.sender
 *                       (broadcaster) if unset, which is the simplest v1
 *                       setup: the deployer EOA also runs distribute().
 *
 * Usage (Base mainnet):
 *   forge script contracts/script/DeployIntelPrizePool.s.sol \
 *     --rpc-url $BASE_RPC_URL \
 *     --private-key $PRIVATE_KEY \
 *     --broadcast \
 *     --verify \
 *     --etherscan-api-key $BASESCAN_API_KEY \
 *     -vvv
 *
 * The script prints the deployed contract address as its final log line so
 * the caller can grep it out into the Vercel env update.
 */
contract DeployIntelPrizePool is Script {
    // Base mainnet bridged USDC (Circle).
    address constant DEFAULT_USDC_BASE = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;

    function run() external returns (IntelPrizePool pool) {
        address usdc = _envAddressOr("USDC_ADDRESS", DEFAULT_USDC_BASE);
        address settler = _envAddressOr("SETTLER", msg.sender);

        require(usdc != address(0), "USDC_ADDRESS=0");
        require(settler != address(0), "SETTLER=0");

        console2.log("Deploying IntelPrizePool");
        console2.log("  USDC:    ", usdc);
        console2.log("  Settler: ", settler);

        vm.startBroadcast();
        pool = new IntelPrizePool(usdc, settler);
        vm.stopBroadcast();

        console2.log("IntelPrizePool deployed at:", address(pool));
    }

    function _envAddressOr(string memory key, address fallbackValue)
        internal
        view
        returns (address)
    {
        try vm.envAddress(key) returns (address v) {
            return v;
        } catch {
            return fallbackValue;
        }
    }
}

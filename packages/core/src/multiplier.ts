/**
 * @stockcheck/core — Multiplier resolution engine
 *
 * Implements Token-2022's reference schedule resolution for ScaledUiAmountConfig:
 * determines whether the current on-chain timestamp has crossed the activation boundary.
 */

import type { MintState } from "./types.js";

/**
 * Resolve the effective multiplier from mint state and the current clock time.
 * This mirrors Token-2022's reference implementation: if the chain clock has
 * passed newMultiplierEffectiveTimestamp, the new multiplier is active.
 *
 * @param mint - Current mint state
 * @param clockTimestampSeconds - Current unix timestamp from Solana Clock sysvar (seconds)
 */
export function resolveEffectiveMultiplier(
  mint: MintState,
  clockTimestampSeconds: bigint
): number {
  if (
    mint.newMultiplierEffectiveTimestamp > 0n &&
    clockTimestampSeconds >= mint.newMultiplierEffectiveTimestamp
  ) {
    return mint.newMultiplier;
  }
  return mint.currentMultiplier;
}

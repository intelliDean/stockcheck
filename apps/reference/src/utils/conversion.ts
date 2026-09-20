/**
 * apps/reference/src/utils/conversion.ts
 *
 * Mode detection and mathematical conversion between scaled UI amounts and raw base units.
 */

export type AppMode = "correct" | "ignore-activation" | "max-roundtrip";
export type TxStatus = "idle" | "pending" | "confirmed" | "error";

export interface MintInfo {
  address: string;
  decimals: number;
  currentMultiplier: number;
  newMultiplier: number;
  newMultiplierEffectiveTimestamp: bigint;
  symbol: string;
}

export interface TestWallet {
  publicKey: string;
  secretKey: Uint8Array;
  isTestWallet: boolean;
}

export interface ReviewState {
  amount: string;
  unit: string;
  recipient: string;
  mint: string;
  rawAmountToTransfer: bigint;
}

export function getAppMode(): AppMode {
  if (typeof window === "undefined") return "correct";
  const params = new URLSearchParams(window.location.search);
  const mode = params.get("mode");
  if (mode === "ignore-activation" || mode === "max-roundtrip") return mode;
  return "correct";
}

export function getAppConvention(): "scaled" | "unscaled" {
  if (typeof window === "undefined") return "scaled";
  const params = new URLSearchParams(window.location.search);
  return params.get("convention") === "unscaled" ? "unscaled" : "scaled";
}

/**
 * Multiplier resolution mirroring Token-2022's reference schedule implementation.
 */
export function resolveMultiplier(mint: MintInfo, mode: AppMode): number {
  if (mode === "ignore-activation") {
    // Seeded defect Q06: deliberately retains old multiplier (1) after activation
    return 1;
  }
  const nowSeconds = BigInt(Math.floor(Date.now() / 1000));
  if (
    mint.newMultiplierEffectiveTimestamp > 0n &&
    nowSeconds >= mint.newMultiplierEffectiveTimestamp
  ) {
    return mint.newMultiplier;
  }
  return mint.currentMultiplier;
}

/**
 * Convert user-entered scaled quantity string to integer raw base units.
 */
export function scaledToRaw(
  scaledAmount: string,
  decimals: number,
  multiplier: number
): bigint {
  const scaled = parseFloat(scaledAmount);
  if (isNaN(scaled) || scaled <= 0) return 0n;
  const unscaled = scaled / multiplier;
  const rawFloat = unscaled * Math.pow(10, decimals);
  return BigInt(Math.floor(rawFloat));
}

/**
 * Convert integer raw base units to user-facing scaled unit string.
 */
export function rawToScaled(raw: bigint, decimals: number, multiplier: number): string {
  const unscaled = Number(raw) / Math.pow(10, decimals);
  const scaled = unscaled * multiplier;
  return scaled.toFixed(6).replace(/\.?0+$/, "");
}

/**
 * @stockcheck/runtime — Mint management
 *
 * Helpers to create and inspect ScaledUiAmount Token-2022 mints
 * on the local Surfpool environment.
 */

import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

export interface SyntheticMintConfig {
  /** Mint address (base58) */
  mintAddress: string;
  /** Token program: always Token-2022 for ScaledUiAmount */
  tokenProgram: string;
  /** Decimal places — 6 for the primary synthetic fixture */
  decimals: number;
  /** Initial multiplier at mint creation */
  initialMultiplier: number;
  /** Base58 keypair path used to create the mint */
  mintKeypairPath: string;
  /** SHA-256 hash of raw mint account bytes at creation (hex) */
  mintBytesHashAtCreation: string;
}

/**
 * Compute a SHA-256 hash of raw mint account data bytes.
 * Used to prove the mint was NOT written during a time-activation test.
 */
export function hashMintBytes(data: Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}

/**
 * Load a pre-existing synthetic mint config from fixtures/synthetic/mint.json.
 * Returns null if the fixture does not exist yet.
 */
export function loadSyntheticMintConfig(
  fixturePath: string
): SyntheticMintConfig | null {
  try {
    const raw = readFileSync(fixturePath, "utf-8");
    return JSON.parse(raw) as SyntheticMintConfig;
  } catch {
    return null;
  }
}

/** Save the synthetic mint config to fixtures/synthetic/mint.json */
export function saveSyntheticMintConfig(
  fixturePath: string,
  config: SyntheticMintConfig
): void {
  writeFileSync(fixturePath, JSON.stringify(config, null, 2));
}

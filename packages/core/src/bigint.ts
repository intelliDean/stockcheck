/**
 * @stockcheck/core — BigInt arithmetic & serialization helpers
 *
 * Provides precision-safe parsing and string serialization for raw token amounts,
 * strictly preventing IEEE-754 double precision corruption.
 */

import type { RawBaseUnits } from "./types.js";

/**
 * Safe: convert decimal string → BigInt.
 * Throws on non-integer / empty / NaN / hex input so callers see explicit errors.
 */
export function parseBigInt(value: string): RawBaseUnits {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) {
    throw new Error(
      `parseBigInt: "${value}" is not a non-negative decimal integer string`
    );
  }
  return BigInt(trimmed);
}

/**
 * Serialize BigInt to decimal string for JSON reports (never loses precision or uses scientific notation).
 */
export function serializeBigInt(value: bigint): string {
  return value.toString(10);
}

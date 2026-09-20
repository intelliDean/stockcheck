/**
 * @stockcheck/core — BigInt arithmetic & serialization helpers
 *
 * Provides precision-safe parsing and string serialization for raw token amounts,
 * strictly preventing IEEE-754 double precision corruption.
 */

import type { RawBaseUnits } from "./types.js";

/**
 * Convert a decimal string to a `RawBaseUnits` BigInt.
 *
 * Rejects any input that is not a non-negative plain decimal integer string
 * (e.g. rejects hex, floats, empty strings, and scientific notation) so
 * callers receive explicit errors rather than silent precision loss.
 *
 * @param value - Decimal integer string (e.g. `"2000000"`)
 * @returns The equivalent BigInt value
 * @throws {Error} If `value` contains non-digit characters or is empty
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
 * Serialize a BigInt to a decimal string safe for JSON reports.
 *
 * Using `.toString(10)` avoids the scientific notation that `JSON.stringify`
 * would emit for large numbers, and prevents IEEE-754 precision loss.
 *
 * @param value - Any BigInt value (positive, negative, or zero)
 * @returns Decimal string representation, e.g. `"2000000"`
 */
export function serializeBigInt(value: bigint): string {
  return value.toString(10);
}

/**
 * @stockcheck/core — Transfer verification engine
 *
 * Observes the application's transaction and independently evaluates whether the
 * actual on-chain token movement conforms to user approvals and Token-2022 rules.
 */

import type {
  TestEvidence,
  Verdict,
  FailureCode,
} from "./types.js";
import { serializeBigInt } from "./bigint.js";

// Re-export submodules for full backward compatibility
export { parseBigInt, serializeBigInt } from "./bigint.js";
export { resolveEffectiveMultiplier } from "./multiplier.js";
export { formatReport } from "./report.js";

export interface CheckResult {
  verdict: Verdict;
  /** Full evidence for the report */
  evidence: TestEvidence;
}

/**
 * Run all checks for a standard (non-Max) transfer.
 *
 * Independently verifies two §8C invariants:
 * 1. `senderDebit === recipientCredit` — no unexpected fee was deducted.
 * 2. `senderDebit === expectedRawAmount` — on-chain movement matches what the user approved.
 *
 * @param evidence - Fully populated `TestEvidence` bundle (pre- and post-transfer snapshots + review capture)
 * @returns `Verdict` with `status: "PASS"` or `status: "FAIL"` and a failure code
 */
export function checkTransfer(evidence: TestEvidence): Verdict {
  const { observedSenderDebit, observedRecipientCredit, expectedRawAmount } =
    evidence;

  // Check 1: sender debit must equal recipient credit (no fee)
  if (observedSenderDebit !== observedRecipientCredit) {
    return fail("SENDER_DEBIT_RECIPIENT_CREDIT_MISMATCH", [
      `Sender debit ${serializeBigInt(observedSenderDebit)} ≠`,
      `recipient credit ${serializeBigInt(observedRecipientCredit)}`,
    ]);
  }

  // Check 2: actual movement must equal independently expected raw amount
  if (observedSenderDebit !== expectedRawAmount) {
    return fail("DISPLAYED_QUANTITY_MISMATCH", [
      `Expected raw movement: ${serializeBigInt(expectedRawAmount)}`,
      `Observed sender debit: ${serializeBigInt(observedSenderDebit)}`,
      `Observed recipient credit: ${serializeBigInt(observedRecipientCredit)}`,
      `Observed scaled equivalent: ${evidence.observedScaledEquivalent}`,
    ]);
  }

  return {
    status: "PASS",
    summary: [
      `Transfer matched: ${serializeBigInt(observedSenderDebit)} raw base units`,
      `= expected ${serializeBigInt(expectedRawAmount)}`,
    ].join(" "),
  };
}

/**
 * Run checks for a Max transfer (§8D of the brief).
 *
 * Independently verifies three invariants:
 * 1. The transferred amount equals the source account's full raw balance before transfer.
 * 2. The source account's remaining raw balance is exactly 0.
 * 3. `senderDebit === recipientCredit` — no unexpected fee.
 *
 * @param evidence - Fully populated `TestEvidence` bundle. `sourceBefore.rawBalance` is
 *                   used as the expected full-balance amount.
 * @returns `Verdict` with `status: "PASS"` or `status: "FAIL"` and a failure code
 */
export function checkMaxTransfer(evidence: TestEvidence): Verdict {
  const {
    sourceBefore,
    sourceAfter,
    observedSenderDebit,
    observedRecipientCredit,
  } = evidence;

  const expectedRaw = sourceBefore.rawBalance;

  if (observedSenderDebit !== expectedRaw) {
    return fail("DISPLAYED_QUANTITY_MISMATCH", [
      `Max: expected full balance ${serializeBigInt(expectedRaw)} raw base units`,
      `but observed debit ${serializeBigInt(observedSenderDebit)}`,
    ]);
  }

  if (sourceAfter.rawBalance !== 0n) {
    return fail("MAX_RESIDUAL_BALANCE", [
      `Max: source account residual raw balance = ${serializeBigInt(
        sourceAfter.rawBalance
      )} (expected 0)`,
    ]);
  }

  if (observedSenderDebit !== observedRecipientCredit) {
    return fail("SENDER_DEBIT_RECIPIENT_CREDIT_MISMATCH", [
      `Sender debit ${serializeBigInt(observedSenderDebit)} ≠ recipient credit ${serializeBigInt(
        observedRecipientCredit
      )}`,
    ]);
  }

  return {
    status: "PASS",
    summary: `Max transfer matched: ${serializeBigInt(expectedRaw)} raw base units, source residual = 0`,
  };
}

// ──────────────────────────────────────────────────────────
// Internal helpers
// ──────────────────────────────────────────────────────────

/**
 * Build a FAIL verdict with a structured reason code.
 *
 * @param code - Machine-readable failure code
 * @param details - Human-readable lines describing the mismatch
 * @returns A `Verdict` with `status: "FAIL"`
 */
function fail(code: FailureCode, details: string[]): Verdict {
  return {
    status: "FAIL",
    failureCode: code,
    summary: details.join("\n"),
  };
}

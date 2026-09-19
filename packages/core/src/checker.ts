/**
 * @stockcheck/core — checker engine
 *
 * The checker observes the application's transaction and independently
 * computes the expected raw amount. It does NOT dictate what the application
 * should transfer — that decision is always the application's.
 */

import type {
  TestEvidence,
  Verdict,
  FailureCode,
  RawBaseUnits,
  MintState,
} from "./types.js";

// ──────────────────────────────────────────────────────────
// BigInt arithmetic helpers
// ──────────────────────────────────────────────────────────

/**
 * Safe: convert decimal string → BigInt.
 * Throws on non-integer / empty / NaN input so callers see explicit errors.
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

/** Serialize BigInt to decimal string for JSON reports (never loses precision). */
export function serializeBigInt(value: bigint): string {
  return value.toString(10);
}

// ──────────────────────────────────────────────────────────
// Effective-multiplier resolution
// ──────────────────────────────────────────────────────────

/**
 * Resolve the effective multiplier from mint state and the current clock time.
 * This mirrors Token-2022's reference implementation: if the chain clock has
 * passed new_multiplier_effective_timestamp, the new multiplier is active.
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

// ──────────────────────────────────────────────────────────
// Core verdict engine
// ──────────────────────────────────────────────────────────

export interface CheckResult {
  verdict: Verdict;
  /** Full evidence for the report */
  evidence: TestEvidence;
}

/**
 * Run all checks for a standard (non-Max) transfer.
 *
 * Rules (§8C of the brief):
 *   senderDebit = recipientCredit = executedAmount = expectedRawAmount
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
 * Rules:
 *   - The transferred amount = source account's full raw balance before transfer
 *   - Source account's remaining raw balance = 0
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
// Report formatting
// ──────────────────────────────────────────────────────────

/**
 * Format a structured text report for a test result.
 * Format follows §11 of the project brief exactly.
 */
export function formatReport(verdict: Verdict, evidence: TestEvidence): string {
  const lines: string[] = [];

  lines.push(
    verdict.status === "PASS"
      ? `PASS — ${evidence.scenarioId}: ${evidence.scenarioDescription}`
      : verdict.status === "FAIL"
      ? `FAIL — ${verdict.failureCode}`
      : `${verdict.status} — ${evidence.scenarioId}`
  );
  lines.push("");
  lines.push(`Scenario: ${evidence.scenarioDescription}`);
  lines.push(
    `Approved quantity: ${evidence.capturedReview.displayedAmount} ${evidence.capturedReview.displayedUnit}`
  );
  lines.push("");
  lines.push(
    `Expected raw movement: ${serializeBigInt(evidence.expectedRawAmount)}`
  );
  lines.push(
    `Observed sender debit: ${serializeBigInt(evidence.observedSenderDebit)}`
  );
  lines.push(
    `Observed recipient credit: ${serializeBigInt(evidence.observedRecipientCredit)}`
  );
  lines.push(`Observed scaled equivalent: ${evidence.observedScaledEquivalent}`);
  lines.push("");
  lines.push(`Transaction: ${evidence.transactionSignature}`);
  lines.push(`Fixture: ${evidence.fixtureIdentity}`);
  lines.push(`Runtime: ${evidence.runtimeIdentity}`);
  lines.push(`Evaluated at: ${evidence.evaluatedAt}`);

  return lines.join("\n");
}

// ──────────────────────────────────────────────────────────
// Internal helpers
// ──────────────────────────────────────────────────────────

function fail(code: FailureCode, details: string[]): Verdict {
  return {
    status: "FAIL",
    failureCode: code,
    summary: details.join("\n"),
  };
}

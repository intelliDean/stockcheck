/**
 * @stockcheck/core — Report formatting engine
 *
 * Formats structured text reports for test verdicts and evidence bundles,
 * adhering strictly to §11 of the project specification.
 */

import type { Verdict, TestEvidence } from "./types.js";
import { serializeBigInt } from "./bigint.js";

/**
 * Format a structured text report for a test result.
 *
 * Output conforms exactly to §11 of the project specification:
 * a PASS/FAIL header, scenario metadata, quantity comparison lines,
 * and chain/fixture identity fields — all separated by newlines.
 *
 * @param verdict - The verdict returned by `checkTransfer` or `checkMaxTransfer`
 * @param evidence - The full `TestEvidence` bundle for the evaluated scenario
 * @returns Multi-line string report ready for logging or file output
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

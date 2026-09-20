/**
 * @stockcheck/playwright — Evidence assembly helpers
 *
 * Constructs structured TestEvidence bundles for full on-chain verdicts
 * and unverified/partial test executions.
 */

import type { TestEvidence, MintState, AccountSnapshot } from "@stockcheck/core";
import type { AppAdapter } from "../adapter.js";

export interface EvidenceCommonOptions {
  scenarioId: string;
  scenarioDescription: string;
  adapter: AppAdapter;
  fixtureIdentity: string;
  runtimeIdentity: string;
  capturedReview: TestEvidence["capturedReview"];
  mintState: MintState;
}

/**
 * Build a partial `TestEvidence` bundle for a scenario where no transaction signature
 * was received (e.g. Surfpool was unreachable or the operation is not supported).
 *
 * The before-snapshots are reused for the after-snapshots, and all observed
 * deltas are set to `0n`. The verdict for this evidence will be `NOT_TESTED`.
 *
 * @param opts - Common scenario and adapter metadata
 * @param sourceBefore - Pre-transfer source account snapshot
 * @param destinationBefore - Pre-transfer destination account snapshot
 * @param expectedRawAmount - Expected raw base units (from independent checker math)
 * @returns A `TestEvidence` bundle suitable for a `NOT_TESTED` verdict
 */
export function buildPartialEvidence(
  opts: EvidenceCommonOptions,
  sourceBefore: AccountSnapshot,
  destinationBefore: AccountSnapshot,
  expectedRawAmount: bigint
): TestEvidence {
  const { scenarioId, scenarioDescription, adapter, fixtureIdentity, runtimeIdentity, capturedReview, mintState } = opts;
  return {
    scenarioId,
    scenarioDescription,
    adapterVersion: `${adapter.name}@${adapter.version}`,
    fixtureIdentity,
    runtimeIdentity,
    evaluatedAt: new Date().toISOString(),
    capturedReview,
    mintStateAtEvaluation: mintState,
    sourceBefore,
    sourceAfter: sourceBefore,
    destinationBefore,
    destinationAfter: destinationBefore,
    transactionSignature: "NOT_AVAILABLE",
    transactionMessage: "",
    expectedRawAmount,
    observedSenderDebit: 0n,
    observedRecipientCredit: 0n,
    observedScaledEquivalent: 0,
  };
}

/**
 * Build a complete `TestEvidence` bundle from pre- and post-transfer account snapshots
 * and a confirmed transaction signature.
 *
 * Computes `observedSenderDebit` and `observedRecipientCredit` from the snapshot deltas,
 * and calculates `observedScaledEquivalent` for the report using the mint's current multiplier.
 *
 * @param opts - Common scenario and adapter metadata
 * @param sourceBefore - Source account snapshot taken before the transfer
 * @param sourceAfter - Source account snapshot taken after the transfer
 * @param destinationBefore - Destination account snapshot taken before the transfer
 * @param destinationAfter - Destination account snapshot taken after the transfer
 * @param signature - Confirmed transaction signature string
 * @param expectedRawAmount - Expected raw base units (from independent checker math)
 * @returns A fully populated `TestEvidence` bundle ready for `checkTransfer` or `checkMaxTransfer`
 */
export function buildFullEvidence(
  opts: EvidenceCommonOptions,
  sourceBefore: AccountSnapshot,
  sourceAfter: AccountSnapshot,
  destinationBefore: AccountSnapshot,
  destinationAfter: AccountSnapshot,
  signature: string,
  expectedRawAmount: bigint
): TestEvidence {
  const { scenarioId, scenarioDescription, adapter, fixtureIdentity, runtimeIdentity, capturedReview, mintState } = opts;

  const observedSenderDebit = sourceBefore.rawBalance - sourceAfter.rawBalance;
  const observedRecipientCredit = destinationAfter.rawBalance - destinationBefore.rawBalance;

  // Compute scaled equivalent from actual movement
  const effectiveMultiplier = mintState.currentMultiplier;
  const observedScaledEquivalent =
    (Number(observedSenderDebit) / Math.pow(10, mintState.decimals)) * effectiveMultiplier;

  return {
    scenarioId,
    scenarioDescription,
    adapterVersion: `${adapter.name}@${adapter.version}`,
    fixtureIdentity,
    runtimeIdentity,
    evaluatedAt: new Date().toISOString(),
    capturedReview,
    mintStateAtEvaluation: {
      ...mintState,
      newMultiplierEffectiveTimestamp: mintState.newMultiplierEffectiveTimestamp,
    },
    sourceBefore,
    sourceAfter,
    destinationBefore,
    destinationAfter,
    transactionSignature: signature,
    transactionMessage: "",
    expectedRawAmount,
    observedSenderDebit,
    observedRecipientCredit,
    observedScaledEquivalent,
  };
}

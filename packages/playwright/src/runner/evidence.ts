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

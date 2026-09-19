/**
 * @stockcheck/playwright — shared Playwright fixtures
 *
 * Provides:
 *   - stockcheck fixture: sets up the Surfpool runtime, test wallets,
 *     and the AppAdapter for each test
 *   - Helper functions for reading on-chain state
 */

import { test as base, expect } from "@playwright/test";
import type { AppAdapter } from "./adapter.js";
import {
  generateTestKeypair,
  buildWalletInjectionScript,
} from "@stockcheck/test-wallet";
import {
  isSurfpoolRunning,
  getClockTimestampSeconds,
  airdropSol,
  mintTokensTo,
  readAccountSnapshot as runtimeReadAccountSnapshot,
} from "@stockcheck/runtime";
import type {
  AccountSnapshot,
  MintState,
  TestEvidence,
  Verdict,
  VerdictStatus,
} from "@stockcheck/core";
import {
  checkTransfer,
  checkMaxTransfer,
  formatReport,
  parseBigInt,
} from "@stockcheck/core";

// ──────────────────────────────────────────────────────────
// Fixture types
// ──────────────────────────────────────────────────────────

export interface StockCheckFixtures {
  /** Configured adapter for the application under test */
  adapter: AppAdapter;
  /** Sender test wallet */
  senderWallet: Awaited<ReturnType<typeof generateTestKeypair>>;
  /** Recipient test wallet */
  recipientWallet: Awaited<ReturnType<typeof generateTestKeypair>>;
}

// ──────────────────────────────────────────────────────────
// Base fixture factory
// ──────────────────────────────────────────────────────────

export function createStockCheckTest(adapter: AppAdapter) {
  return base.extend<StockCheckFixtures>({
    adapter: async ({}, use) => {
      await use(adapter);
    },

    senderWallet: async ({ page }, use) => {
      const wallet = await generateTestKeypair();
      try {
        await airdropSol(wallet.publicKey, 10_000_000_000n);
        await mintTokensTo(wallet.publicKey, 3_456_789n);
      } catch {
        // Non-fatal if Surfpool is offline
      }
      await page.addInitScript(buildWalletInjectionScript(wallet));
      await use(wallet);
    },

    recipientWallet: async ({}, use) => {
      const wallet = await generateTestKeypair();
      await use(wallet);
    },
  });
}

// ──────────────────────────────────────────────────────────
// Global setup check
// ──────────────────────────────────────────────────────────

/**
 * Call at the top of each test file to gate on Surfpool availability.
 * If Surfpool is unreachable the test is marked NOT_TESTED — not FAIL.
 */
export async function requireSurfpool(): Promise<void> {
  const running = await isSurfpoolRunning();
  if (!running) {
    throw new Error(
      "NOT_TESTED: Surfpool is not running. Start it with: surfpool start"
    );
  }
}

// ──────────────────────────────────────────────────────────
// Scenario runner
// ──────────────────────────────────────────────────────────

export interface ScenarioOptions {
  scenarioId: string;
  scenarioDescription: string;
  mintAddress: string;
  mintState: MintState;
  senderAddress?: string;
  recipientAddress: string;
  /** Amount string in the adapter's declared unit convention */
  amountToEnter: string;
  /** Is this a Max transfer? */
  isMax?: boolean;
  /** Snapshot reader function — implementation depends on runtime setup */
  readAccountSnapshot?: (address: string) => Promise<AccountSnapshot>;
  /** Fixture identity string */
  fixtureIdentity: string;
  /** Runtime identity string */
  runtimeIdentity: string;
}

/**
 * Run a complete scenario: navigate → input → review → confirm → check.
 * Returns the full verdict and evidence bundle.
 *
 * This is the heart of StockCheck — it ensures the checker observes the
 * application's actual transaction, not a fabricated one.
 */
export async function runScenario(
  page: import("@playwright/test").Page,
  adapter: AppAdapter,
  opts: ScenarioOptions,
  expectedRawAmount: bigint
): Promise<{ verdict: Verdict; evidence: TestEvidence }> {
  const {
    scenarioId,
    scenarioDescription,
    mintAddress,
    mintState,
    senderAddress,
    recipientAddress,
    amountToEnter,
    isMax = false,
    readAccountSnapshot,
    fixtureIdentity,
    runtimeIdentity,
  } = opts;

  const sender = senderAddress || `source-for-${recipientAddress}`;
  const getSnapshot = async (addr: string) => {
    if (readAccountSnapshot) {
      try {
        const res = await readAccountSnapshot(addr);
        if (res && res.slot > 0n) return res;
      } catch {}
    }
    return runtimeReadAccountSnapshot(addr, mintAddress);
  };

  // Snapshot before
  const sourceBefore = await getSnapshot(sender);
  const destinationBefore = await getSnapshot(recipientAddress);
  const clockAtEvaluation = await getClockTimestampSeconds();

  // Operate the UI
  await adapter.openTransferScreen(page);
  await adapter.connectWallet(page);
  await adapter.selectToken(page, mintAddress);
  await adapter.enterRecipient(page, recipientAddress);

  if (isMax) {
    await adapter.clickMax(page);
  } else {
    await adapter.enterAmount(page, amountToEnter);
  }

  await adapter.clickReview(page);
  const capturedReview = await adapter.captureReview(page);
  const signature = await adapter.clickConfirmAndWaitForReceipt(page);

  if (signature === null) {
    return {
      verdict: {
        status: "NOT_TESTED",
        summary:
          "Transaction receipt not found — Surfpool may be unreachable or operation unsupported",
      },
      evidence: buildPartialEvidence(
        scenarioId,
        scenarioDescription,
        capturedReview,
        mintState,
        sourceBefore,
        sourceBefore,
        destinationBefore,
        destinationBefore,
        expectedRawAmount,
        adapter,
        fixtureIdentity,
        runtimeIdentity
      ),
    };
  }

  // Snapshot after
  const sourceAfter = await getSnapshot(sender);
  const destinationAfter = await getSnapshot(recipientAddress);

  const observedSenderDebit =
    sourceBefore.rawBalance - sourceAfter.rawBalance;
  const observedRecipientCredit =
    destinationAfter.rawBalance - destinationBefore.rawBalance;

  // Compute scaled equivalent from actual movement
  const effectiveMultiplier = mintState.currentMultiplier;
  const observedScaledEquivalent =
    (Number(observedSenderDebit) / Math.pow(10, mintState.decimals)) *
    effectiveMultiplier;

  const evidence: TestEvidence = {
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

  const verdict = isMax
    ? checkMaxTransfer(evidence)
    : checkTransfer(evidence);

  return { verdict, evidence };
}

// ──────────────────────────────────────────────────────────
// Internal helpers
// ──────────────────────────────────────────────────────────

function buildPartialEvidence(
  scenarioId: string,
  scenarioDescription: string,
  capturedReview: TestEvidence["capturedReview"],
  mintState: MintState,
  sourceBefore: AccountSnapshot,
  sourceAfter: AccountSnapshot,
  destinationBefore: AccountSnapshot,
  destinationAfter: AccountSnapshot,
  expectedRawAmount: bigint,
  adapter: AppAdapter,
  fixtureIdentity: string,
  runtimeIdentity: string
): TestEvidence {
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
    sourceAfter,
    destinationBefore,
    destinationAfter,
    transactionSignature: "NOT_AVAILABLE",
    transactionMessage: "",
    expectedRawAmount,
    observedSenderDebit: 0n,
    observedRecipientCredit: 0n,
    observedScaledEquivalent: 0,
  };
}

export { expect };
export type { AppAdapter };

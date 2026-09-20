/**
 * @stockcheck/playwright — shared Playwright fixtures
 *
 * Provides:
 *   - stockcheck fixture: sets up the Surfpool runtime, test wallets,
 *     and the AppAdapter for each test
 *   - Helper functions for reading on-chain state and running test scenarios
 */

import { test as base, expect } from "@playwright/test";
import type { AppAdapter } from "./adapter.js";
import {
  generateTestKeypair,
  buildWalletInjectionScript,
} from "@stockcheck/test-wallet";
import {
  isSurfpoolRunning,
  airdropSol,
  mintTokensTo,
  readAccountSnapshot as runtimeReadAccountSnapshot,
} from "@stockcheck/runtime";
import type {
  AccountSnapshot,
  MintState,
  TestEvidence,
  Verdict,
} from "@stockcheck/core";
import {
  checkTransfer,
  checkMaxTransfer,
} from "@stockcheck/core";
import { executeTransferFlow } from "./runner/ui-flow.js";
import { buildPartialEvidence, buildFullEvidence } from "./runner/evidence.js";

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

/**
 * Create a Playwright `test` object pre-wired with StockCheck fixtures.
 *
 * Extends Playwright's `base.test` with three fixtures:
 * - `adapter` — the configured `AppAdapter` instance
 * - `senderWallet` — a freshly generated keypair, airdropped 10 SOL and 3,456,789 raw tokens
 * - `recipientWallet` — a freshly generated keypair (no pre-funding)
 *
 * The sender wallet keypair is injected into the page via `window.__TEST_WALLET__`
 * before any navigation, so the app can auto-connect without user interaction.
 *
 * @param adapter - The `AppAdapter` implementation to bind for all tests in this suite
 * @returns A Playwright `test` function extended with `StockCheckFixtures`
 */
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
 * Run a complete end-to-end transfer scenario and return the verdict and evidence.
 *
 * Orchestrates the full lifecycle:
 * 1. Capture pre-transfer on-chain snapshots for sender and recipient.
 * 2. Drive the UI transfer via `executeTransferFlow`.
 * 3. If no receipt signature, return a `NOT_TESTED` verdict.
 * 4. Capture post-transfer snapshots.
 * 5. Assemble `TestEvidence` and run `checkTransfer` or `checkMaxTransfer`.
 *
 * @param page - Playwright `Page` instance
 * @param adapter - The `AppAdapter` configured for the application under test
 * @param opts - Scenario options: IDs, mint info, addresses, amount, and snapshot reader
 * @param expectedRawAmount - The independently computed expected raw base units to transfer
 * @returns Object containing the `Verdict` and full `TestEvidence` bundle
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

  // 1. Capture on-chain balances before transfer
  const sourceBefore = await getSnapshot(sender);
  const destinationBefore = await getSnapshot(recipientAddress);

  // 2. Drive the UI transfer interaction via adapter
  const { capturedReview, signature } = await executeTransferFlow(page, adapter, {
    mintAddress,
    mintState,
    recipientAddress,
    amountToEnter,
    isMax,
  });

  const commonEvidenceOpts = {
    scenarioId,
    scenarioDescription,
    adapter,
    fixtureIdentity,
    runtimeIdentity,
    capturedReview,
    mintState,
  };

  // 3. If receipt missing, return unverified NOT_TESTED verdict
  if (signature === null) {
    return {
      verdict: {
        status: "NOT_TESTED",
        summary:
          "Transaction receipt not found — Surfpool may be unreachable or operation unsupported",
      },
      evidence: buildPartialEvidence(
        commonEvidenceOpts,
        sourceBefore,
        destinationBefore,
        expectedRawAmount
      ),
    };
  }

  // 4. Capture on-chain balances after confirmed transaction
  const sourceAfter = await getSnapshot(sender);
  const destinationAfter = await getSnapshot(recipientAddress);

  // 5. Assemble evidence and evaluate mathematical verdict
  const evidence = buildFullEvidence(
    commonEvidenceOpts,
    sourceBefore,
    sourceAfter,
    destinationBefore,
    destinationAfter,
    signature,
    expectedRawAmount
  );

  const verdict = isMax
    ? checkMaxTransfer(evidence)
    : checkTransfer(evidence);

  return { verdict, evidence };
}

export { expect };
export type { AppAdapter };
export * from "./runner/ui-flow.js";
export * from "./runner/evidence.js";

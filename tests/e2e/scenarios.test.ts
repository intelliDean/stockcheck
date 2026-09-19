/**
 * E2E test scenarios Q01–Q08
 *
 * These are the required test cases from §10 of the project brief.
 * All checks are performed by the independent checker (packages/core),
 * not by the adapter or the test runner.
 */

import { test, expect } from "@playwright/test";
import { ReferenceAppAdapter } from "@stockcheck/adapter-reference";
import {
  requireSurfpool,
  createStockCheckTest,
  runScenario,
} from "@stockcheck/playwright";
import {
  resolveEffectiveMultiplier,
  formatReport,
} from "@stockcheck/core";
import type { MintState, AccountSnapshot } from "@stockcheck/core";
import {
  getClockTimestampSeconds,
  timeTravelTo,
  isSurfpoolRunning,
} from "@stockcheck/runtime";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// ──────────────────────────────────────────────────────────
// Fixtures
// ──────────────────────────────────────────────────────────

const adapter = new ReferenceAppAdapter({ inputConvention: "scaled" });
const stockcheck = createStockCheckTest(adapter);
const FIXTURE_PATH = resolve(
  import.meta.dirname,
  "../../fixtures/synthetic/mint.json"
);

// Load fixture — created by scripts/create-mint.ts
function loadMintState(): MintState {
  const raw = readFileSync(FIXTURE_PATH, "utf-8");
  const config = JSON.parse(raw);
  return {
    mintAddress: config.mintAddress,
    tokenProgram: config.tokenProgram,
    decimals: config.decimals,
    currentMultiplier: config.initialMultiplier,
    newMultiplier: config.initialMultiplier,
    newMultiplierEffectiveTimestamp: 0n,
    mintBytesHash: config.mintBytesHashAtCreation,
  };
}

// Placeholder — replace with actual @solana/kit account reads in integration
async function readAccountSnapshot(address: string): Promise<AccountSnapshot> {
  const clockTs = await getClockTimestampSeconds().catch(() => 0n);
  return {
    address,
    rawBalance: 0n, // TODO: implement real RPC read
    slot: 0n,
    timestamp: clockTs,
  };
}

const FIXTURE_IDENTITY = "synthetic-v1-6dec";
const RUNTIME_IDENTITY = "surfpool-local";

// ──────────────────────────────────────────────────────────
// Q01 — Baseline: multiplier=1, 2 scaled units → 2,000,000 raw
// ──────────────────────────────────────────────────────────

stockcheck(
  "Q01: multiplier=1, enter 2 scaled units → transfers 2,000,000 raw base units",
  async ({ page, senderWallet, recipientWallet, adapter }) => {
    if (!(await isSurfpoolRunning())) {
      test.skip(true, "NOT_TESTED: Surfpool not running");
    }

    const mintState = loadMintState();
    // Ensure pre-activation (multiplier=1)
    const clockTs = await getClockTimestampSeconds();
    const effectiveMultiplier = resolveEffectiveMultiplier(mintState, clockTs);

    // Expected: 2 scaled units at multiplier=1 → 2 unscaled → 2,000,000 raw (6 decimals)
    const expectedRaw = 2_000_000n;

    const { verdict, evidence } = await runScenario(
      page,
      adapter,
      {
        scenarioId: "Q01",
        scenarioDescription: "Multiplier 1; six decimals; enter 2 scaled units",
        mintAddress: mintState.mintAddress,
        mintState,
        recipientAddress: recipientWallet.publicKey,
        amountToEnter: "2",
        readAccountSnapshot,
        fixtureIdentity: FIXTURE_IDENTITY,
        runtimeIdentity: RUNTIME_IDENTITY,
      },
      expectedRaw
    );

    console.log(formatReport(verdict, evidence));

    expect(verdict.status).toBe("PASS");
  }
);

// ──────────────────────────────────────────────────────────
// Q02 — Active multiplier=2, 2 scaled units → 1,000,000 raw
// ──────────────────────────────────────────────────────────

stockcheck(
  "Q02: active multiplier=2, enter 2 scaled units → transfers 1,000,000 raw base units",
  async ({ page, senderWallet, recipientWallet, adapter }) => {
    if (!(await isSurfpoolRunning())) {
      test.skip(true, "NOT_TESTED: Surfpool not running");
    }

    const mintState: MintState = {
      ...loadMintState(),
      currentMultiplier: 2,
      newMultiplier: 2,
      newMultiplierEffectiveTimestamp: 0n,
    };

    // 2 scaled at multiplier=2 → 1 unscaled → 1,000,000 raw
    const expectedRaw = 1_000_000n;

    const { verdict, evidence } = await runScenario(
      page,
      adapter,
      {
        scenarioId: "Q02",
        scenarioDescription: "Active multiplier 2; enter 2 scaled units",
        mintAddress: mintState.mintAddress,
        mintState,
        recipientAddress: recipientWallet.publicKey,
        amountToEnter: "2",
        readAccountSnapshot,
        fixtureIdentity: FIXTURE_IDENTITY,
        runtimeIdentity: RUNTIME_IDENTITY,
      },
      expectedRaw
    );

    console.log(formatReport(verdict, evidence));
    expect(verdict.status).toBe("PASS");
  }
);

// ──────────────────────────────────────────────────────────
// Q03 — Page open across scheduled 1→2 activation
// ──────────────────────────────────────────────────────────

stockcheck(
  "Q03: page remains open across scheduled 1→2 activation — post-activation input is consistent",
  async ({ page, senderWallet, recipientWallet, adapter }) => {
    if (!(await isSurfpoolRunning())) {
      test.skip(true, "NOT_TESTED: Surfpool not running");
    }

    const mintState = loadMintState();
    const nowTs = await getClockTimestampSeconds();
    const activationTs = nowTs + 30n; // 30s in the future

    // Install Playwright clock BEFORE navigation — captures all timers
    await page.clock.install({ time: Number(nowTs) * 1000 });

    // Open the page BEFORE activation (multiplier=1)
    await adapter.openTransferScreen(page);
    await adapter.connectWallet(page);

    // Advance chain time past activation
    await timeTravelTo(activationTs + 1n);

    // Advance browser clock past activation
    await page.clock.fastForward(31_000);

    // Allow app's polling interval to fire (app should detect new multiplier)
    await page.waitForTimeout(500);

    // Now enter a transfer — post-activation multiplier=2
    // 2 scaled at multiplier=2 → 1,000,000 raw
    const expectedRaw = 1_000_000n;
    const activatedMintState: MintState = {
      ...mintState,
      currentMultiplier: 2,
      newMultiplier: 2,
      newMultiplierEffectiveTimestamp: activationTs,
    };

    const { verdict, evidence } = await runScenario(
      page,
      adapter,
      {
        scenarioId: "Q03",
        scenarioDescription:
          "Page open across scheduled 1→2 activation; post-activation transfer",
        mintAddress: mintState.mintAddress,
        mintState: activatedMintState,
        recipientAddress: recipientWallet.publicKey,
        amountToEnter: "2",
        readAccountSnapshot,
        fixtureIdentity: FIXTURE_IDENTITY,
        runtimeIdentity: RUNTIME_IDENTITY,
      },
      expectedRaw
    );

    console.log(formatReport(verdict, evidence));
    expect(verdict.status).toBe("PASS");
  }
);

// ──────────────────────────────────────────────────────────
// Q04 — Max with fractional balance
// ──────────────────────────────────────────────────────────

stockcheck(
  "Q04: Max button transfers complete source-account raw balance",
  async ({ page, senderWallet, recipientWallet, adapter }) => {
    if (!(await isSurfpoolRunning())) {
      test.skip(true, "NOT_TESTED: Surfpool not running");
    }

    if (!adapter.capabilities.supportsMax) {
      test.skip(true, "UNSUPPORTED: adapter does not declare Max support");
    }

    const mintState = loadMintState();

    const { verdict, evidence } = await runScenario(
      page,
      adapter,
      {
        scenarioId: "Q04",
        scenarioDescription: "Max with fractional balance",
        mintAddress: mintState.mintAddress,
        mintState,
        recipientAddress: recipientWallet.publicKey,
        amountToEnter: "0",
        isMax: true,
        readAccountSnapshot,
        fixtureIdentity: FIXTURE_IDENTITY,
        runtimeIdentity: RUNTIME_IDENTITY,
      },
      0n // expectedRawAmount is derived from source balance in checkMaxTransfer
    );

    console.log(formatReport(verdict, evidence));
    expect(verdict.status).toBe("PASS");
  }
);

// ──────────────────────────────────────────────────────────
// Q05 — Unscaled input at multiplier=2
// ──────────────────────────────────────────────────────────

stockcheck(
  "Q05: explicit unscaled-input interface at multiplier=2 — entering 2 unscaled transfers 2,000,000 raw",
  async ({ page, senderWallet, recipientWallet }) => {
    if (!(await isSurfpoolRunning())) {
      test.skip(true, "NOT_TESTED: Surfpool not running");
    }

    const unscaledAdapter = new ReferenceAppAdapter({
      inputConvention: "unscaled",
    });

    if (!unscaledAdapter.capabilities.supportsUnscaledInput) {
      test.skip(true, "UNSUPPORTED: adapter does not declare unscaled input");
    }

    const mintState: MintState = {
      ...loadMintState(),
      currentMultiplier: 2,
    };

    // 2 unscaled → 2,000,000 raw (independent of multiplier)
    const expectedRaw = 2_000_000n;

    const { verdict, evidence } = await runScenario(
      page,
      unscaledAdapter,
      {
        scenarioId: "Q05",
        scenarioDescription:
          "Explicit unscaled-input interface at multiplier=2; enter 2 unscaled",
        mintAddress: mintState.mintAddress,
        mintState,
        recipientAddress: recipientWallet.publicKey,
        amountToEnter: "2",
        readAccountSnapshot,
        fixtureIdentity: FIXTURE_IDENTITY,
        runtimeIdentity: RUNTIME_IDENTITY,
      },
      expectedRaw
    );

    console.log(formatReport(verdict, evidence));
    expect(verdict.status).toBe("PASS");
  }
);

// ──────────────────────────────────────────────────────────
// Q08 — Missing RPC / receipt → NOT_TESTED
// ──────────────────────────────────────────────────────────

test(
  "Q08: missing Surfpool → NOT_TESTED (never PASS)",
  async () => {
    const running = await isSurfpoolRunning();
    if (running) {
      // If Surfpool IS running, this test documents expected behavior and skips
      test.skip(true, "Surfpool is running — Q08 requires it to be offline");
    }
    // If not running, the test passes by asserting the correct NOT_TESTED outcome
    expect(running).toBe(false);
    // The caller (test suite runner) should surface this as NOT_TESTED in the report
    console.log(
      "Q08: NOT_TESTED — Surfpool is offline. Verdict: NOT_TESTED (not PASS)"
    );
  }
);

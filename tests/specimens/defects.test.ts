/**
 * Specimen tests — seeded defect scenarios Q06 and Q07
 *
 * These tests EXPECT a FAIL verdict from StockCheck.
 * CI asserts "the checker correctly detected this seeded defect."
 *
 * Run with: pnpm test:specimens
 * Config: playwright.specimens.config.ts
 *
 * A genuine FAIL from the checker is the correct outcome here.
 * DO NOT convert a detected bad transfer into a compatibility PASS.
 */

import { test, expect } from "@playwright/test";
import { ReferenceAppAdapter } from "@stockcheck/adapter-reference";
import { createStockCheckTest, runScenario } from "@stockcheck/playwright";
import { formatReport } from "@stockcheck/core";
import type { MintState, AccountSnapshot } from "@stockcheck/core";
import { isSurfpoolRunning, getClockTimestampSeconds } from "@stockcheck/runtime";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const FIXTURE_PATH = resolve(
  import.meta.dirname,
  "../../fixtures/synthetic/mint.json"
);

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

async function readAccountSnapshot(address: string): Promise<AccountSnapshot> {
  const clockTs = await getClockTimestampSeconds().catch(() => 0n);
  return { address, rawBalance: 0n, slot: 0n, timestamp: clockTs };
}

// ──────────────────────────────────────────────────────────
// Q06 — Seeded old-multiplier defect
// ──────────────────────────────────────────────────────────

/**
 * The "ignore-activation" mode of the reference app deliberately retains
 * the old multiplier (1) after activation. This means when the user
 * enters 2 scaled units at multiplier=2, the app transfers 2,000,000 raw
 * instead of the correct 1,000,000 raw.
 *
 * StockCheck must detect this as FAIL — DISPLAYED_QUANTITY_MISMATCH.
 * The test PASSES when the checker correctly returns FAIL.
 */
const faultyAdapter = new ReferenceAppAdapter({ inputConvention: "scaled" });
const faultyTest = createStockCheckTest(faultyAdapter);

faultyTest(
  "Q06: ignore-activation defect → checker correctly returns FAIL (genuine mismatch)",
  async ({ page, senderWallet, recipientWallet, adapter }) => {
    if (!(await isSurfpoolRunning())) {
      test.skip(true, "NOT_TESTED: Surfpool not running");
    }

    // The mint state reflects multiplier=2 is active
    const mintState: MintState = {
      ...loadMintState(),
      currentMultiplier: 2,
      newMultiplier: 2,
      newMultiplierEffectiveTimestamp: 0n,
    };

    // Correct expected raw: 2 scaled at multiplier=2 → 1,000,000
    // The faulty app will transfer 2,000,000 (uses old multiplier=1)
    const expectedRaw = 1_000_000n;

    // Navigate to faulty mode
    await page.goto("http://localhost:5173?mode=ignore-activation");

    const { verdict, evidence } = await runScenario(
      page,
      adapter,
      {
        scenarioId: "Q06",
        scenarioDescription:
          "Seeded old-multiplier defect — app ignores activation, transfers double the correct amount",
        mintAddress: mintState.mintAddress,
        mintState,
        senderAddress: senderWallet.publicKey,
        recipientAddress: recipientWallet.publicKey,
        amountToEnter: "2",
        readAccountSnapshot,
        fixtureIdentity: "synthetic-v1-6dec",
        runtimeIdentity: "surfpool-local",
      },
      expectedRaw
    );

    console.log("=== SPECIMEN Q06 ===");
    console.log(formatReport(verdict, evidence));
    console.log("===================");

    // The specimen PASSES by confirming the checker detected the defect
    expect(verdict.status).toBe("FAIL");
    expect(verdict.failureCode).toBe("DISPLAYED_QUANTITY_MISMATCH");
    console.log(
      "✅ StockCheck correctly detected seeded defect Q06:",
      verdict.failureCode
    );
  }
);

// ──────────────────────────────────────────────────────────
// Q07 — Seeded Max round-trip defect
// ──────────────────────────────────────────────────────────

faultyTest(
  "Q07: max-roundtrip defect → checker correctly detects residual raw tokens (FAIL)",
  async ({ page, senderWallet, recipientWallet, adapter }) => {
    if (!(await isSurfpoolRunning())) {
      test.skip(true, "NOT_TESTED: Surfpool not running");
    }

    if (!adapter.capabilities.supportsMax) {
      test.skip(true, "UNSUPPORTED: adapter does not declare Max support");
    }

    const mintState = loadMintState();

    // Navigate to max-roundtrip faulty mode
    await page.goto("http://localhost:5173?mode=max-roundtrip");

    const { verdict, evidence } = await runScenario(
      page,
      adapter,
      {
        scenarioId: "Q07",
        scenarioDescription:
          "Seeded Max round-trip defect — app rounds displayed balance then reconstructs amount, leaving residual tokens",
        mintAddress: mintState.mintAddress,
        mintState,
        senderAddress: senderWallet.publicKey,
        recipientAddress: recipientWallet.publicKey,
        amountToEnter: "", // Max will set this
        isMax: true,
        readAccountSnapshot,
        fixtureIdentity: "synthetic-v1-6dec",
        runtimeIdentity: "surfpool-local",
      },
      0n // Max transfer: remainder should be 0n
    );

    console.log("=== SPECIMEN Q07 ===");
    console.log(formatReport(verdict, evidence));
    console.log("===================");

    // Specimen PASSES by confirming the checker found the residual
    expect(verdict.status).toBe("FAIL");
    expect(["MAX_RESIDUAL_BALANCE", "DISPLAYED_QUANTITY_MISMATCH"]).toContain(
      verdict.failureCode
    );
    console.log(
      "✅ StockCheck correctly detected seeded defect Q07:",
      verdict.failureCode
    );
  }
);

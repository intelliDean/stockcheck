/**
 * Unit tests for @stockcheck/core — checker engine
 *
 * Tests the key quantity math, verdict logic, BigInt serialization,
 * and edge cases mentioned in §10 of the project brief.
 */

import {
  parseBigInt,
  serializeBigInt,
  resolveEffectiveMultiplier,
  checkTransfer,
  checkMaxTransfer,
  formatReport,
} from "../src/checker.js";
import type { TestEvidence, MintState, AccountSnapshot } from "../src/types.js";

// ──────────────────────────────────────────────────────────
// Test fixtures
// ──────────────────────────────────────────────────────────

const MOCK_MINT: MintState = {
  mintAddress: "MockMint11111111111111111111111111111111111",
  tokenProgram: "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
  decimals: 6,
  currentMultiplier: 1,
  newMultiplier: 2,
  newMultiplierEffectiveTimestamp: 1000000n,
  mintBytesHash: "abc123",
};

function makeAccount(rawBalance: bigint, address = "Acc1"): AccountSnapshot {
  return {
    address,
    rawBalance,
    slot: 1n,
    timestamp: 900000n,
  };
}

function makeEvidence(
  overrides: Partial<TestEvidence> = {}
): TestEvidence {
  const base: TestEvidence = {
    scenarioId: "Q01",
    scenarioDescription: "Multiplier 1; six decimals; enter 2 scaled units",
    adapterVersion: "test@0.1.0",
    fixtureIdentity: "synthetic-v1",
    runtimeIdentity: "surfpool-local",
    evaluatedAt: new Date().toISOString(),
    capturedReview: {
      displayedAmount: "2",
      displayedUnit: "scaled units",
      displayedRecipient: "Rec1111111111111111111111111111111111111111",
    },
    mintStateAtEvaluation: MOCK_MINT,
    sourceBefore: makeAccount(2_000_000n, "Src1"),
    sourceAfter: makeAccount(0n, "Src1"),
    destinationBefore: makeAccount(0n, "Dst1"),
    destinationAfter: makeAccount(2_000_000n, "Dst1"),
    transactionSignature: "SomeSig1111111111111111111111111111111111111111111111111111111111111111111111111111111111",
    transactionMessage: "",
    expectedRawAmount: 2_000_000n,
    observedSenderDebit: 2_000_000n,
    observedRecipientCredit: 2_000_000n,
    observedScaledEquivalent: 2,
  };
  return { ...base, ...overrides };
}

// ──────────────────────────────────────────────────────────
// parseBigInt
// ──────────────────────────────────────────────────────────

describe("parseBigInt", () => {
  test("parses valid decimal strings", () => {
    expect(parseBigInt("0")).toBe(0n);
    expect(parseBigInt("1000000")).toBe(1_000_000n);
    expect(parseBigInt("9007199254740993")).toBe(9_007_199_254_740_993n); // > Number.MAX_SAFE_INTEGER
  });

  test("rejects empty string", () => {
    expect(() => parseBigInt("")).toThrow();
  });

  test("rejects non-integer strings", () => {
    expect(() => parseBigInt("1.5")).toThrow();
    expect(() => parseBigInt("1e6")).toThrow();
    expect(() => parseBigInt("NaN")).toThrow();
    expect(() => parseBigInt("-1")).toThrow();
  });

  test("rejects hex strings", () => {
    expect(() => parseBigInt("0x1F")).toThrow();
  });
});

// ──────────────────────────────────────────────────────────
// serializeBigInt
// ──────────────────────────────────────────────────────────

describe("serializeBigInt", () => {
  test("serializes to decimal string", () => {
    expect(serializeBigInt(0n)).toBe("0");
    expect(serializeBigInt(1_000_000n)).toBe("1000000");
  });

  test("handles values > Number.MAX_SAFE_INTEGER", () => {
    const big = 9_007_199_254_740_993n; // Number.MAX_SAFE_INTEGER + 1
    const result = serializeBigInt(big);
    expect(result).toBe("9007199254740993");
    // Roundtrip
    expect(parseBigInt(result)).toBe(big);
  });

  test("does NOT use scientific notation", () => {
    const result = serializeBigInt(1_000_000_000_000n);
    expect(result).not.toContain("e");
  });
});

// ──────────────────────────────────────────────────────────
// resolveEffectiveMultiplier
// ──────────────────────────────────────────────────────────

describe("resolveEffectiveMultiplier", () => {
  const mint = MOCK_MINT; // activates at timestamp 1000000

  test("returns currentMultiplier before activation", () => {
    expect(resolveEffectiveMultiplier(mint, 999_999n)).toBe(1);
  });

  test("returns newMultiplier exactly at activation timestamp", () => {
    expect(resolveEffectiveMultiplier(mint, 1_000_000n)).toBe(2);
  });

  test("returns newMultiplier after activation (T+1)", () => {
    expect(resolveEffectiveMultiplier(mint, 1_000_001n)).toBe(2);
  });

  test("returns currentMultiplier when no update is scheduled (timestamp=0)", () => {
    const noUpdate: MintState = {
      ...mint,
      newMultiplierEffectiveTimestamp: 0n,
    };
    expect(resolveEffectiveMultiplier(noUpdate, 9_999_999n)).toBe(
      noUpdate.currentMultiplier
    );
  });
});

// ──────────────────────────────────────────────────────────
// checkTransfer — PASS cases
// ──────────────────────────────────────────────────────────

describe("checkTransfer — PASS", () => {
  test("Q01: multiplier=1, 2 scaled units → 2,000,000 raw", () => {
    const evidence = makeEvidence({
      expectedRawAmount: 2_000_000n,
      observedSenderDebit: 2_000_000n,
      observedRecipientCredit: 2_000_000n,
    });
    const verdict = checkTransfer(evidence);
    expect(verdict.status).toBe("PASS");
  });

  test("Q02: multiplier=2, 2 scaled units → 1,000,000 raw", () => {
    const evidence = makeEvidence({
      scenarioId: "Q02",
      expectedRawAmount: 1_000_000n,
      observedSenderDebit: 1_000_000n,
      observedRecipientCredit: 1_000_000n,
      observedScaledEquivalent: 2,
    });
    const verdict = checkTransfer(evidence);
    expect(verdict.status).toBe("PASS");
  });
});

// ──────────────────────────────────────────────────────────
// checkTransfer — FAIL cases (seeded defects)
// ──────────────────────────────────────────────────────────

describe("checkTransfer — FAIL (seeded defects)", () => {
  test("Q06: ignore-activation defect transfers 2,000,000 when expected 1,000,000", () => {
    const evidence = makeEvidence({
      scenarioId: "Q06",
      expectedRawAmount: 1_000_000n,    // correct: multiplier=2, 2 scaled → 1M
      observedSenderDebit: 2_000_000n,  // defect: app used old multiplier
      observedRecipientCredit: 2_000_000n,
      observedScaledEquivalent: 4,
    });
    const verdict = checkTransfer(evidence);
    expect(verdict.status).toBe("FAIL");
    expect(verdict.failureCode).toBe("DISPLAYED_QUANTITY_MISMATCH");
    expect(verdict.summary).toContain("1000000");
    expect(verdict.summary).toContain("2000000");
  });

  test("sender debit ≠ recipient credit triggers correct failure code", () => {
    const evidence = makeEvidence({
      observedSenderDebit: 1_000_000n,
      observedRecipientCredit: 999_999n, // mismatch
    });
    const verdict = checkTransfer(evidence);
    expect(verdict.status).toBe("FAIL");
    expect(verdict.failureCode).toBe("SENDER_DEBIT_RECIPIENT_CREDIT_MISMATCH");
  });
});

// ──────────────────────────────────────────────────────────
// checkMaxTransfer
// ──────────────────────────────────────────────────────────

describe("checkMaxTransfer", () => {
  test("Q04: transfers full raw balance, leaves 0 residual → PASS", () => {
    const evidence = makeEvidence({
      scenarioId: "Q04",
      sourceBefore: makeAccount(1_234_567n, "Src1"),
      sourceAfter: makeAccount(0n, "Src1"),
      destinationBefore: makeAccount(0n, "Dst1"),
      destinationAfter: makeAccount(1_234_567n, "Dst1"),
      observedSenderDebit: 1_234_567n,
      observedRecipientCredit: 1_234_567n,
      expectedRawAmount: 1_234_567n,
    });
    const verdict = checkMaxTransfer(evidence);
    expect(verdict.status).toBe("PASS");
  });

  test("Q07: max-roundtrip defect leaves residual raw tokens → FAIL", () => {
    // Defect: app derived Max from rounded displayed balance
    // Displayed balance at multiplier=2: 1.234567 scaled → app rounds to 1.23 → converts back to 615000
    // Actual raw balance: 1_234_567
    const evidence = makeEvidence({
      scenarioId: "Q07",
      sourceBefore: makeAccount(1_234_567n, "Src1"),
      sourceAfter: makeAccount(619_567n, "Src1"),  // residual remains
      destinationBefore: makeAccount(0n, "Dst1"),
      destinationAfter: makeAccount(615_000n, "Dst1"),
      observedSenderDebit: 615_000n,
      observedRecipientCredit: 615_000n,
      expectedRawAmount: 1_234_567n,
    });
    const verdict = checkMaxTransfer(evidence);
    expect(verdict.status).toBe("FAIL");
    expect(verdict.failureCode).toBe("DISPLAYED_QUANTITY_MISMATCH");
  });
});

// ──────────────────────────────────────────────────────────
// formatReport
// ──────────────────────────────────────────────────────────

describe("formatReport", () => {
  test("FAIL report contains all required §11 fields", () => {
    const evidence = makeEvidence({
      expectedRawAmount: 1_000_000n,
      observedSenderDebit: 2_000_000n,
      observedRecipientCredit: 2_000_000n,
      observedScaledEquivalent: 4,
    });
    const verdict = {
      status: "FAIL" as const,
      failureCode: "DISPLAYED_QUANTITY_MISMATCH" as const,
      summary: "Mismatch detected",
    };
    const report = formatReport(verdict, evidence);

    expect(report).toContain("FAIL — DISPLAYED_QUANTITY_MISMATCH");
    expect(report).toContain("Expected raw movement: 1000000");
    expect(report).toContain("Observed sender debit: 2000000");
    expect(report).toContain("Observed recipient credit: 2000000");
    expect(report).toContain("Observed scaled equivalent: 4");
    expect(report).not.toContain("undefined");
    expect(report).not.toContain("null");
  });

  test("PASS report is well-formed", () => {
    const evidence = makeEvidence();
    const verdict = {
      status: "PASS" as const,
      summary: "Transfer matched",
    };
    const report = formatReport(verdict, evidence);
    expect(report).toContain("PASS");
    expect(report).not.toContain("undefined");
  });
});

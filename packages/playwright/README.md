# `@stockcheck/playwright`

The **Playwright fixtures and scenario runner** for StockCheck — wires together the adapter, Surfpool runtime, and the core checker to execute end-to-end transfer verification scenarios.

See [`docs/ADAPTER_GUIDE.md`](../../docs/ADAPTER_GUIDE.md) for the full guide on writing adapters for new applications.

---

## Modules

| Module | Description |
|---|---|
| [`adapter.ts`](./src/adapter.ts) | `AppAdapter` interface — the contract every app adapter must implement |
| [`fixtures.ts`](./src/fixtures.ts) | `createStockCheckTest`, `runScenario`, `requireSurfpool` — Playwright fixture factory and scenario orchestrator |
| [`runner/ui-flow.ts`](./src/runner/ui-flow.ts) | `executeTransferFlow` — drives the adapter through the full UI interaction and captures the review panel state |
| [`runner/evidence.ts`](./src/runner/evidence.ts) | `buildPartialEvidence`, `buildFullEvidence` — assembles the `TestEvidence` bundle from snapshots and review state |

---

## Quick Start

### 1. Install

```bash
pnpm add -D @stockcheck/playwright @playwright/test
```

### 2. Create your adapter

```ts
// my-app/adapters/my-adapter.ts
import type { AppAdapter } from "@stockcheck/playwright";

export class MyAppAdapter implements AppAdapter {
  readonly name = "My App";
  readonly version = "1.0.0";
  readonly inputConvention = "scaled" as const;
  readonly capabilities = { supportsMax: true, supportsUnscaledInput: false };

  async openTransferScreen(page) { /* navigate to the transfer page */ }
  async connectWallet(page)      { /* wait for wallet to connect */ }
  async selectToken(page, mint)  { /* pick the token from the dropdown */ }
  async enterRecipient(page, r)  { /* fill recipient input */ }
  async enterAmount(page, a)     { /* fill amount input */ }
  async clickMax(page)           { /* click Max button */ }
  async clickReview(page)        { /* click Review and wait for panel */ }
  async captureReview(page)      { /* return displayedAmount, displayedUnit, displayedRecipient */ }
  async clickConfirmAndWaitForReceipt(page) { /* click Confirm; return tx signature or null */ }
  async readReceiptSignature(page)          { /* return signature string or null */ }
}
```

### 3. Write a test

```ts
// tests/e2e/q01.spec.ts
import { createStockCheckTest, runScenario, requireSurfpool } from "@stockcheck/playwright";
import { resolveEffectiveMultiplier } from "@stockcheck/core";
import { MyAppAdapter } from "../adapters/my-adapter";

const adapter = new MyAppAdapter();
const test = createStockCheckTest(adapter);

test.beforeAll(requireSurfpool);

test("Q01 — correct transfer at multiplier=1", async ({ page, senderWallet, recipientWallet }) => {
  const mintState = /* ... read from on-chain ... */;
  const multiplier = resolveEffectiveMultiplier(mintState, currentTimestamp);
  const expectedRawAmount = /* core math */ 2_000_000n;

  const { verdict, evidence } = await runScenario(page, adapter, {
    scenarioId: "Q01",
    scenarioDescription: "Correct transfer with multiplier=1",
    mintAddress: "...",
    mintState,
    recipientAddress: recipientWallet.publicKey,
    amountToEnter: "2",
    fixtureIdentity: "my-fixture-v1",
    runtimeIdentity: "surfpool-v1",
  }, expectedRawAmount);

  expect(verdict.status).toBe("PASS");
});
```

---

## `AppAdapter` Contract

The adapter is the **only** boundary between StockCheck and the application under test.

**Rules:**
- The adapter **must read actual DOM values** in `captureReview` — never compute or derive them.
- The adapter **must not** perform any quantity math or multiplier calculations.
- The adapter **must not** call `expect()` or make assertions; it only navigates and observes.

All quantity verification is performed independently by `@stockcheck/core`.

---

## `runScenario` Lifecycle

```
1. readAccountSnapshot(sender)          → sourceBefore
2. readAccountSnapshot(recipient)       → destinationBefore
3. executeTransferFlow(page, adapter)   → capturedReview + signature
4. If signature === null → NOT_TESTED
5. readAccountSnapshot(sender)          → sourceAfter
6. readAccountSnapshot(recipient)       → destinationAfter
7. buildFullEvidence(...)               → evidence bundle
8. checkTransfer(evidence)              → Verdict
```

---

## Fixture Setup

`createStockCheckTest` extends Playwright's `base.test` with three fixtures:

| Fixture | What it provides |
|---|---|
| `adapter` | The configured `AppAdapter` instance |
| `senderWallet` | A freshly generated keypair, airdropped 10 SOL and 3,456,789 raw tokens |
| `recipientWallet` | A freshly generated keypair (no pre-funding) |

The sender wallet keypair is injected into the browser page via `window.__TEST_WALLET__` before any navigation.

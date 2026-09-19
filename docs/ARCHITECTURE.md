# StockCheck Architecture & Invariants

## Core Purpose

Token-2022's `ScaledUiAmountConfig` extension introduces time-dependent multipliers for token balances. This enables programmatic token splits, interest accrual, and rebasing mechanisms directly in the mint definition.

However, standard wallets and dApps frequently suffer from catastrophic regressions when interacting with scaled mints:
1. **Old Multiplier Retention**: Displaying a new multiplied balance to the user while using an un-updated multiplier when assembling raw token transfer instructions.
2. **Lossy Max Reconstruction**: Deriving "Max" transfer quantities by parsing the formatted/rounded displayed balance string into a float, leaving residual dust in the sender's account.
3. **Stale Multipliers Across Activations**: Retaining the previous multiplier when a scheduled activation passes while the user keeps the transfer modal open.

StockCheck was created to verify that Solana interfaces execute transfers with zero discrepancy between what the user approved and what the chain debited.

---

## Architectural Non-Negotiable Invariants

1. **The Independent Checker Invariant**:
   `packages/core` is strictly decoupled from `apps/reference` and `adapters/reference`. The checker never dictates, builds, or replaces the application's transaction. It operates purely as an external auditor observing UI claims and comparing them with on-chain delta snapshots.

2. **The Reality Invariant**:
   Every test must be a genuine on-chain Solana transaction executed against a live testnet (`@solana/surfpool`). No mocked transactions or synthetic confirmations are permitted.

3. **Defect Trapping Invariant**:
   Faulty application modes (`ignore-activation` and `max-roundtrip`) must produce real `FAIL` verdicts from StockCheck (`DISPLAYED_QUANTITY_MISMATCH` or `MAX_RESIDUAL_BALANCE`). The test assertions verify that StockCheck accurately caught the defect.

4. **Graceful Degradation Invariant**:
   If the local Solana cluster is unreachable, tests report `NOT_TESTED` or skip gracefully. A missing runtime must never produce a false `PASS`.

---

## Component Topology

```
┌─────────────────────────────────────────────────────────┐
│                   Playwright Test Runner                │
│                 (Q01–Q08 & Seeded Defects)              │
└───────────────┬─────────────────────────┬───────────────┘
                │                         │
                ▼                         ▼
┌───────────────────────────────┐ ┌───────────────────────┐
│     AppAdapter Interface      │ │      Test Wallet      │
│     (DOM actions & reviews)   │ │  (Inject keypair into │
└───────────────┬───────────────┘ │   browser window)     │
                │                 └───────────┬───────────┘
                ▼                             │
┌───────────────────────────────┐             │
│   Web Interface Under Test    │◄────────────┘
│  (React / Vite + @solana/kit) │
└───────────────┬───────────────┘
                │
                ▼
┌───────────────────────────────┐
│  Surfpool Local Solana Node   │
│   (Token-2022 + Cheatcodes)   │
└───────────────┬───────────────┘
                │
                ▼
┌───────────────────────────────┐
│  packages/core Check Engine   │
│  (Independent Quantity Audit) │
└───────────────┬───────────────┘
                │
                ▼
┌───────────────────────────────┐
│  Structured Verdict Evidence  │
│  (JSON Report + Trace + Diff) │
└───────────────────────────────┘
```

---

## Time-Travel & Scheduled Multiplier Coordination

Token-2022 activation timestamps are denominated in seconds (`Clock` sysvar), while Surfpool's `surfnet_timeTravel` cheatcode expects absolute millisecond timestamps:

```typescript
// Chain clock is in seconds
const activationTs = nowTs + 30n;

// Advance Solana validator state
await timeTravelTo(activationTs + 1n);

// Advance Playwright virtual browser clock
await page.clock.fastForward(31_000);
```

StockCheck coordinates both the chain clock and browser runtime clock simultaneously, ensuring scheduled activation transitions can be tested cleanly without flaky sleep timers or page reloads.

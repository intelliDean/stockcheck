# `@stockcheck/core`

The **pure, dependency-free** verification engine at the heart of StockCheck.

`@stockcheck/core` is intentionally isolated from Playwright, Solana RPC, and any test infrastructure. It takes a fully-assembled `TestEvidence` bundle and answers one question: *did the on-chain token movement match what the user was shown?*

---

## Modules

| Module | Description |
|---|---|
| [`types.ts`](./src/types.ts) | All shared TypeScript types and interfaces (`TestEvidence`, `MintState`, `AccountSnapshot`, `Verdict`, …) |
| [`bigint.ts`](./src/bigint.ts) | `parseBigInt` / `serializeBigInt` — safe BigInt serialization with overflow guards |
| [`multiplier.ts`](./src/multiplier.ts) | `resolveEffectiveMultiplier` — Token-2022 `InterestBearingConfig` clock-aware multiplier resolution |
| [`checker.ts`](./src/checker.ts) | `checkTransfer` / `checkMaxTransfer` — the verdict engine (§8C/§8D rules) |
| [`report.ts`](./src/report.ts) | `formatReport` — §11-compliant structured report string for each scenario |

---

## Key Concepts

### Raw Base Units vs Scaled Units

Token-2022 stores and transfers amounts as **raw base units** (`bigint`). The UI displays **scaled units** that include a per-mint multiplier on top of standard decimal scaling.

```
rawBaseUnits  →  ÷ 10^decimals  →  unscaledTokenUnits  →  × multiplier  →  scaledUnits
```

**`@stockcheck/core` always works in raw base units.** It never touches `Number` for token amounts to avoid precision loss.

### Multiplier Resolution

`resolveEffectiveMultiplier` reads `MintState` (populated by `@stockcheck/runtime`) and applies the time-activation logic: if the current timestamp is past `newMultiplierEffectiveTimestamp`, the new multiplier is active; otherwise the current one applies.

```ts
import { resolveEffectiveMultiplier } from "@stockcheck/core";

const multiplier = resolveEffectiveMultiplier(mintState, currentTimestamp);
```

### Verdict Engine

```ts
import { checkTransfer, checkMaxTransfer } from "@stockcheck/core";

const verdict = checkTransfer(evidence);
// { status: "PASS", summary: "Transfer matched: 2000000 raw base units = expected 2000000" }

const maxVerdict = checkMaxTransfer(evidence);
// { status: "FAIL", failureCode: "MAX_RESIDUAL_BALANCE", summary: "…" }
```

#### Failure Codes

| Code | Meaning |
|---|---|
| `DISPLAYED_QUANTITY_MISMATCH` | On-chain movement ≠ independently expected raw amount |
| `SENDER_DEBIT_RECIPIENT_CREDIT_MISMATCH` | Sender debit ≠ recipient credit (unexpected fee) |
| `MAX_RESIDUAL_BALANCE` | Max transfer left a non-zero residual in the source account |
| `MISSING_EVIDENCE` | Required evidence fields are absent |

---

## Usage

```ts
import {
  checkTransfer,
  checkMaxTransfer,
  formatReport,
  resolveEffectiveMultiplier,
  parseBigInt,
  serializeBigInt,
} from "@stockcheck/core";
```

All public exports are re-exported from the package root — import everything from `"@stockcheck/core"`.

---

## Design Constraints

- **No runtime dependencies.** Only TypeScript types are imported.
- **BigInt everywhere.** Raw token amounts are `bigint`. Never pass them through `Number`.
- **Stateless functions.** `checkTransfer` and `checkMaxTransfer` are pure functions — same input always produces the same output.
- **No assertions.** The checker *returns* a `Verdict`; it never calls `expect()`. Test assertions are the responsibility of `@stockcheck/playwright`.

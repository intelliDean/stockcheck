# `@stockcheck/adapter-reference`

The **reference adapter** for StockCheck — implements the `AppAdapter` interface for the `apps/reference` Vite/React application.

This adapter is the canonical example of how to connect StockCheck's verification framework to a real UI. If you are building an adapter for a different application, use this as your reference implementation alongside [`docs/ADAPTER_GUIDE.md`](../../docs/ADAPTER_GUIDE.md).

---

## Modules

| Module | Description |
|---|---|
| [`selectors.ts`](./src/selectors.ts) | `REFERENCE_SELECTORS` — centralized `data-testid` constants for every interactive element |
| [`index.ts`](./src/index.ts) | `ReferenceAppAdapter` — full `AppAdapter` implementation, plus `REFERENCE_APP_BASE_URL` |

---

## Usage

```ts
import { ReferenceAppAdapter } from "@stockcheck/adapter-reference";
import { createStockCheckTest } from "@stockcheck/playwright";

const adapter = new ReferenceAppAdapter();
const test = createStockCheckTest(adapter);
```

### Constructor Options

```ts
const adapter = new ReferenceAppAdapter({
  inputConvention: "scaled",   // "scaled" (default) | "unscaled"
  supportsMax: true,           // true (default) | false
});
```

| Option | Default | Description |
|---|---|---|
| `inputConvention` | `"scaled"` | Whether the amount field expects scaled or unscaled units |
| `supportsMax` | `true` | Whether the app's Max button is available |

---

## DOM Selectors

All `data-testid` values are defined in `REFERENCE_SELECTORS` and exported from the package root:

```ts
import { REFERENCE_SELECTORS } from "@stockcheck/adapter-reference";

console.log(REFERENCE_SELECTORS.AMOUNT_FIELD);   // "amount-field"
console.log(REFERENCE_SELECTORS.CONFIRM_BUTTON); // "confirm-button"
```

| Constant | `data-testid` value | Element |
|---|---|---|
| `TRANSFER_FORM` | `transfer-form` | Root transfer form wrapper |
| `WALLET_ADDRESS` | `wallet-address` | Connected wallet address display |
| `ASSET_SELECTOR` | `asset-selector` | Token dropdown trigger |
| `ASSET_OPTION_PREFIX` | `asset-option-` | Per-token dropdown option (append mint address) |
| `RECIPIENT_FIELD` | `recipient-field` | Recipient address input |
| `AMOUNT_FIELD` | `amount-field` | Amount input |
| `MAX_BUTTON` | `max-button` | Max balance button |
| `REVIEW_BUTTON` | `review-button` | Open review drawer button |
| `REVIEW_PANEL` | `review-panel` | Review confirmation drawer |
| `REVIEW_AMOUNT` | `review-amount` | Displayed amount in the review panel |
| `REVIEW_UNIT` | `review-unit` | Displayed unit label in the review panel |
| `REVIEW_RECIPIENT` | `review-recipient` | Displayed recipient in the review panel |
| `REVIEW_MINT` | `review-mint` | Displayed mint address in the review panel |
| `CONFIRM_BUTTON` | `confirm-button` | Confirm & send button |
| `RECEIPT_SIGNATURE` | `receipt-signature` | Transaction signature on receipt screen |
| `NEW_TRANSFER_BUTTON` | `new-transfer-button` | "Start Another Transfer" button |

---

## App Modes

The reference app supports three modes injected via URL parameter (`?mode=…`):

| URL | Mode | Behaviour |
|---|---|---|
| `http://localhost:5173` | `correct` | Correct Token-2022 transfer implementation |
| `http://localhost:5173?mode=ignore-activation` | `ignore-activation` | Defect: ignores multiplier activation timestamp |
| `http://localhost:5173?mode=max-roundtrip` | `max-roundtrip` | Defect: roundtrip precision error in Max transfer |

The adapter navigates to the base URL by default. Tests that exercise specific modes should call `page.goto(...)` before invoking `runScenario`.

---

## `AppAdapter` Constraint Reminder

Per the StockCheck specification:

- `captureReview` **reads real DOM text**. It does not derive or compute values.
- The adapter performs **no quantity math** — all verification is done by `@stockcheck/core`.
- `clickConfirmAndWaitForReceipt` returns the on-screen signature string (or `null`). Returning `null` results in `NOT_TESTED`, not `FAIL`.

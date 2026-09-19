# StockCheck Adapter Integration Guide

StockCheck is designed to test **any** Solana wallet interface, dApp, or transfer modal—not just our reference implementation. To test your application against Token-2022 `ScaledUiAmount` regressions, you implement the `AppAdapter` interface.

---

## The `AppAdapter` Interface

The adapter tells StockCheck **how** to operate your UI (DOM selectors, clicks, inputs), while StockCheck's independent checker (`@stockcheck/core`) verifies **what** was actually transferred on-chain.

```typescript
import type { Page } from "@playwright/test";

export type InputUnitConvention = "scaled" | "unscaled";

export interface AppCapabilities {
  supportsMax: boolean;
  supportsUnscaledInput: boolean;
}

export interface AppAdapter {
  readonly name: string;
  readonly version: string;
  readonly inputConvention: InputUnitConvention;
  readonly capabilities: AppCapabilities;

  /** Navigate to the transfer screen / open the modal */
  openTransferScreen(page: Page): Promise<void>;

  /** Connect wallet (or await auto-connection of injected window.__TEST_WALLET__) */
  connectWallet(page: Page): Promise<void>;

  /** Select the synthetic token by mint address */
  selectToken(page: Page, mintAddress: string): Promise<void>;

  /** Enter recipient public key */
  enterRecipient(page: Page, recipientAddress: string): Promise<void>;

  /** Enter quantity in the interface's input box */
  enterAmount(page: Page, amount: string): Promise<void>;

  /** Click the interface's "Max" button */
  clickMax(page: Page): Promise<void>;

  /** Click "Review" or advance to confirmation stage */
  clickReview(page: Page): Promise<void>;

  /** Read the visible review state from DOM */
  captureReview(page: Page): Promise<{
    displayedAmount: string;
    displayedUnit: string;
    displayedRecipient: string;
    displayedMint?: string;
  }>;

  /** Click "Confirm" / "Send", wait for signature, return transaction signature */
  clickConfirmAndWaitForReceipt(page: Page): Promise<string | null>;
}
```

---

## 30-Line Integration Example

Here is how you can write an adapter for an existing wallet extension or web interface:

```typescript
import type { Page } from "@playwright/test";
import type { AppAdapter, AppCapabilities } from "@stockcheck/playwright";

export class MyWalletAdapter implements AppAdapter {
  readonly name = "MyWallet Transfer Modal";
  readonly version = "1.0.0";
  readonly inputConvention = "scaled";
  readonly capabilities: AppCapabilities = {
    supportsMax: true,
    supportsUnscaledInput: false,
  };

  async openTransferScreen(page: Page): Promise<void> {
    await page.goto("http://localhost:3000/send");
    await page.waitForSelector("[data-testid='send-modal']");
  }

  async connectWallet(page: Page): Promise<void> {
    await page.waitForSelector("[data-testid='wallet-connected']");
  }

  async selectToken(page: Page, mintAddress: string): Promise<void> {
    await page.getByTestId("token-selector").click();
    await page.getByTestId(`token-row-${mintAddress}`).click();
  }

  async enterRecipient(page: Page, recipientAddress: string): Promise<void> {
    await page.getByTestId("recipient-input").fill(recipientAddress);
  }

  async enterAmount(page: Page, amount: string): Promise<void> {
    await page.getByTestId("amount-input").fill(amount);
  }

  async clickMax(page: Page): Promise<void> {
    await page.getByTestId("max-btn").click();
  }

  async clickReview(page: Page): Promise<void> {
    await page.getByTestId("review-btn").click();
    await page.waitForSelector("[data-testid='review-dialog']");
  }

  async captureReview(page: Page) {
    return {
      displayedAmount: (await page.getByTestId("review-amt").innerText()).trim(),
      displayedUnit: (await page.getByTestId("review-unit").innerText()).trim(),
      displayedRecipient: (await page.getByTestId("review-dest").innerText()).trim(),
    };
  }

  async clickConfirmAndWaitForReceipt(page: Page): Promise<string | null> {
    await page.getByTestId("confirm-send-btn").click();
    const sigEl = await page.waitForSelector("[data-testid='tx-signature']", { timeout: 15_000 });
    return (await sigEl.innerText()).trim();
  }
}
```

---

## Running the StockCheck Suite on Your Adapter

In your test file:

```typescript
import { createStockCheckTest, runScenario } from "@stockcheck/playwright";
import { MyWalletAdapter } from "./my-wallet-adapter";

const adapter = new MyWalletAdapter();
const test = createStockCheckTest(adapter);

test("Verify Token-2022 multiplier handling", async ({ page, senderWallet, recipientWallet }) => {
  // StockCheck runs automated scenarios Q01–Q05 on your app!
});
```

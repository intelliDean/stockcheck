/**
 * adapters/reference — adapter for the StockCheck reference application
 *
 * This adapter knows HOW to operate apps/reference — its DOM selectors,
 * navigation, and which unit convention it uses.
 *
 * It does NOT know what the expected raw amount should be — that is
 * computed entirely by packages/core.
 */

import type { Page } from "@playwright/test";
import type {
  AppAdapter,
  AppCapabilities,
  InputUnitConvention,
} from "@stockcheck/playwright";
import { REFERENCE_SELECTORS } from "./selectors.js";

export { REFERENCE_SELECTORS } from "./selectors.js";

export const REFERENCE_APP_BASE_URL = "http://127.0.0.1:5173";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a `[data-testid='…']` attribute selector from a bare testid string. */
function testidAttr(testid: string): string {
  return `[data-testid='${testid}']`;
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

export class ReferenceAppAdapter implements AppAdapter {
  readonly name = "StockCheck Reference App";
  readonly version = "0.1.0";
  readonly inputConvention: InputUnitConvention;
  readonly capabilities: AppCapabilities;

  constructor(options?: {
    inputConvention?: InputUnitConvention;
    supportsMax?: boolean;
  }) {
    this.inputConvention = options?.inputConvention ?? "scaled";
    this.capabilities = {
      supportsMax: options?.supportsMax ?? true,
      supportsUnscaledInput: true,
    };
  }

  async openTransferScreen(page: Page): Promise<void> {
    const currentUrl = page.url();
    const targetUrl =
      this.inputConvention === "unscaled"
        ? `${REFERENCE_APP_BASE_URL}?convention=unscaled`
        : REFERENCE_APP_BASE_URL;
    if (!currentUrl.startsWith(targetUrl)) {
      await page.goto(targetUrl);
    }
    await page.waitForSelector(testidAttr(REFERENCE_SELECTORS.TRANSFER_FORM));
  }

  async connectWallet(page: Page): Promise<void> {
    // The reference app auto-detects window.__TEST_WALLET__ injected by the fixture
    // and connects it without user action — just wait for the connected state
    await page.waitForSelector(testidAttr(REFERENCE_SELECTORS.WALLET_ADDRESS), {
      timeout: 5000,
    });
  }

  async selectToken(page: Page, mintAddress: string): Promise<void> {
    const selector = page.getByTestId(REFERENCE_SELECTORS.ASSET_SELECTOR);
    await selector.click();
    const option = page.getByTestId(
      `${REFERENCE_SELECTORS.ASSET_OPTION_PREFIX}${mintAddress}`
    );
    const isVisible = await option.isVisible({ timeout: 2000 }).catch(() => false);
    if (isVisible) {
      await option.click();
    } else {
      await selector.click().catch(() => {});
    }
  }

  async enterRecipient(page: Page, recipientAddress: string): Promise<void> {
    const field = page.getByTestId(REFERENCE_SELECTORS.RECIPIENT_FIELD);
    await field.clear();
    await field.fill(recipientAddress);
  }

  async enterAmount(page: Page, amount: string): Promise<void> {
    const field = page.getByTestId(REFERENCE_SELECTORS.AMOUNT_FIELD);
    await field.clear();
    await field.fill(amount);
  }

  async clickMax(page: Page): Promise<void> {
    await page.getByTestId(REFERENCE_SELECTORS.MAX_BUTTON).click();
    // Wait for amount field to populate
    const amountSelector = testidAttr(REFERENCE_SELECTORS.AMOUNT_FIELD);
    await page.waitForFunction((sel) => {
      const el = document.querySelector(sel) as HTMLInputElement | null;
      return el !== null && el.value !== "" && el.value !== "0";
    }, amountSelector);
  }

  async clickReview(page: Page): Promise<void> {
    await page.getByTestId(REFERENCE_SELECTORS.REVIEW_BUTTON).click();
    await page.waitForSelector(testidAttr(REFERENCE_SELECTORS.REVIEW_PANEL));
  }

  async captureReview(page: Page): Promise<{
    displayedAmount: string;
    displayedUnit: string;
    displayedRecipient: string;
    displayedMint?: string;
  }> {
    // Read separate visible DOM elements — NOT derived from expected values (§6)
    const displayedAmount = await page
      .getByTestId(REFERENCE_SELECTORS.REVIEW_AMOUNT)
      .innerText();
    const displayedUnit = await page
      .getByTestId(REFERENCE_SELECTORS.REVIEW_UNIT)
      .innerText();
    const displayedRecipient = await page
      .getByTestId(REFERENCE_SELECTORS.REVIEW_RECIPIENT)
      .innerText();
    const displayedMint = await page
      .getByTestId(REFERENCE_SELECTORS.REVIEW_MINT)
      .innerText()
      .catch(() => undefined);

    const result: {
      displayedAmount: string;
      displayedUnit: string;
      displayedRecipient: string;
      displayedMint?: string;
    } = {
      displayedAmount: displayedAmount.trim(),
      displayedUnit: displayedUnit.trim(),
      displayedRecipient: displayedRecipient.trim(),
    };
    if (displayedMint !== undefined) {
      result.displayedMint = displayedMint.trim();
    }
    return result;
  }

  async clickConfirmAndWaitForReceipt(page: Page): Promise<string | null> {
    await page.getByTestId(REFERENCE_SELECTORS.CONFIRM_BUTTON).click();

    try {
      await page.waitForSelector(
        testidAttr(REFERENCE_SELECTORS.RECEIPT_SIGNATURE),
        { timeout: 30000 }
      );
      return await this.readReceiptSignature(page);
    } catch {
      return null;
    }
  }

  async readReceiptSignature(page: Page): Promise<string | null> {
    try {
      const sig = await page
        .getByTestId(REFERENCE_SELECTORS.RECEIPT_SIGNATURE)
        .innerText();
      const trimmed = sig.trim();
      // Basic signature sanity check — base58, ~88 chars
      return trimmed.length > 40 ? trimmed : null;
    } catch {
      return null;
    }
  }
}

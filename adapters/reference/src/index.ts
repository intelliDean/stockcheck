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

export const REFERENCE_APP_BASE_URL = "http://localhost:5173";

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
    await page.goto(REFERENCE_APP_BASE_URL);
    await page.waitForSelector("[data-testid='transfer-form']");
  }

  async connectWallet(page: Page): Promise<void> {
    // The reference app auto-detects window.__TEST_WALLET__ injected by the fixture
    // and connects it without user action — just wait for the connected state
    await page.waitForSelector("[data-testid='wallet-address']", {
      timeout: 5000,
    });
  }

  async selectToken(page: Page, mintAddress: string): Promise<void> {
    const selector = page.getByTestId("asset-selector");
    await selector.click();
    await page
      .getByTestId(`asset-option-${mintAddress}`)
      .click();
  }

  async enterRecipient(page: Page, recipientAddress: string): Promise<void> {
    const field = page.getByTestId("recipient-field");
    await field.clear();
    await field.fill(recipientAddress);
  }

  async enterAmount(page: Page, amount: string): Promise<void> {
    const field = page.getByTestId("amount-field");
    await field.clear();
    await field.fill(amount);
  }

  async clickMax(page: Page): Promise<void> {
    await page.getByTestId("max-button").click();
    // Wait for amount field to populate
    await page.waitForFunction(() => {
      const el = document.querySelector(
        "[data-testid='amount-field']"
      ) as HTMLInputElement | null;
      return el !== null && el.value !== "" && el.value !== "0";
    });
  }

  async clickReview(page: Page): Promise<void> {
    await page.getByTestId("review-button").click();
    await page.waitForSelector("[data-testid='review-panel']");
  }

  async captureReview(page: Page): Promise<{
    displayedAmount: string;
    displayedUnit: string;
    displayedRecipient: string;
    displayedMint?: string;
  }> {
    // Read separate visible DOM elements — NOT derived from expected values (§6)
    const displayedAmount = await page
      .getByTestId("review-amount")
      .innerText();
    const displayedUnit = await page
      .getByTestId("review-unit")
      .innerText();
    const displayedRecipient = await page
      .getByTestId("review-recipient")
      .innerText();
    const displayedMint = await page
      .getByTestId("review-mint")
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
    await page.getByTestId("confirm-button").click();

    try {
      await page.waitForSelector("[data-testid='receipt-signature']", {
        timeout: 30000,
      });
      return await this.readReceiptSignature(page);
    } catch {
      return null;
    }
  }

  async readReceiptSignature(page: Page): Promise<string | null> {
    try {
      const sig = await page
        .getByTestId("receipt-signature")
        .innerText();
      const trimmed = sig.trim();
      // Basic signature sanity check — base58, ~88 chars
      return trimmed.length > 40 ? trimmed : null;
    } catch {
      return null;
    }
  }
}

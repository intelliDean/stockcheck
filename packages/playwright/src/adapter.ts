/**
 * @stockcheck/playwright — AppAdapter interface
 *
 * The adapter describes HOW to operate an application.
 * It MUST NOT provide expected raw balances, multiplier calculations,
 * or custom quantity assertions (§7 of the project brief).
 *
 * The checker (packages/core) performs all independent quantity checks.
 */

import type { Page } from "@playwright/test";

/** Unit convention the application uses for user-visible amount input */
export type InputUnitConvention = "scaled" | "unscaled";

/**
 * Capabilities the adapter declares for the application.
 * The checker uses these to determine which scenarios are SUPPORTED vs NOT_TESTED.
 */
export interface AppCapabilities {
  /** Whether this app supports the Max button */
  supportsMax: boolean;
  /** Whether this app supports unscaled input mode */
  supportsUnscaledInput: boolean;
}

/**
 * AppAdapter — the ONLY boundary between StockCheck and the application under test.
 *
 * Implement this interface for each application you want to test.
 * The adapter describes HOW to operate the app — not what the app should do.
 */
export interface AppAdapter {
  /** Human-readable name (e.g. "StockCheck Reference App v0.1.0") */
  readonly name: string;

  /** Version string for evidence reports */
  readonly version: string;

  /** What unit convention does the amount input use? */
  readonly inputConvention: InputUnitConvention;

  /** What capabilities does this app declare? */
  readonly capabilities: AppCapabilities;

  // ── Navigation ─────────────────────────────────────────
  /** Navigate to and open the transfer screen. */
  openTransferScreen(page: Page): Promise<void>;

  /** Connect the local test wallet. */
  connectWallet(page: Page): Promise<void>;

  // ── Input actions ───────────────────────────────────────
  /** Select the synthetic stock-like test token from the asset selector. */
  selectToken(page: Page, mintAddress: string): Promise<void>;

  /** Enter the recipient address into the recipient field. */
  enterRecipient(page: Page, recipientAddress: string): Promise<void>;

  /**
   * Enter an amount string into the amount field.
   * The string is in the adapter's declared inputConvention units.
   */
  enterAmount(page: Page, amount: string): Promise<void>;

  /**
   * Click the Max button. Only call if capabilities.supportsMax is true.
   * After clicking, the amount field should reflect the source account's full balance.
   */
  clickMax(page: Page): Promise<void>;

  // ── Review ──────────────────────────────────────────────
  /** Click the Review button. The review panel should then be visible. */
  clickReview(page: Page): Promise<void>;

  /**
   * Read the review panel's visible DOM state.
   * The checker will compare this with the actual transaction.
   *
   * IMPORTANT: Read the ACTUAL DOM text — do not derive from expected values.
   */
  captureReview(page: Page): Promise<{
    displayedAmount: string;
    displayedUnit: string;
    displayedRecipient: string;
    displayedMint?: string;
  }>;

  // ── Confirm ─────────────────────────────────────────────
  /**
   * Click Confirm and wait for the receipt to appear.
   * Returns the transaction signature displayed in the receipt, or null
   * if no signature is shown (→ NOT_TESTED).
   */
  clickConfirmAndWaitForReceipt(page: Page): Promise<string | null>;

  // ── Receipt ─────────────────────────────────────────────
  /**
   * Read the transaction signature from the receipt screen.
   * Returns null if the receipt is not showing a valid signature.
   */
  readReceiptSignature(page: Page): Promise<string | null>;
}

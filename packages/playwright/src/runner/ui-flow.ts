/**
 * @stockcheck/playwright — UI interaction flow executor
 *
 * Drives the application under test through the standard transfer lifecycle:
 * open → connect → select token → enter recipient & amount → review → confirm.
 */

import type { Page } from "@playwright/test";
import type { AppAdapter } from "../adapter.js";
import type { MintState } from "@stockcheck/core";

export interface TransferFlowOptions {
  mintAddress: string;
  mintState: MintState;
  recipientAddress: string;
  amountToEnter: string;
  isMax?: boolean;
}

export interface TransferFlowResult {
  capturedReview: {
    displayedAmount: string;
    displayedUnit: string;
    displayedRecipient: string;
    displayedMint?: string;
  };
  signature: string | null;
}

/**
 * Executes the complete UI interaction flow for a token transfer using the configured adapter.
 */
export async function executeTransferFlow(
  page: Page,
  adapter: AppAdapter,
  opts: TransferFlowOptions
): Promise<TransferFlowResult> {
  const { mintAddress, mintState, recipientAddress, amountToEnter, isMax = false } = opts;

  // Inject mint state for the test scenario
  const mintPayload = {
    currentMultiplier: mintState.currentMultiplier,
    newMultiplier: mintState.newMultiplier,
    newMultiplierEffectiveTimestamp: mintState.newMultiplierEffectiveTimestamp.toString(),
  };

  await page.addInitScript((state) => {
    (globalThis as unknown as { __STOCKCHECK_MINT_STATE__?: unknown }).__STOCKCHECK_MINT_STATE__ = state;
  }, mintPayload);

  // Operate the UI via adapter
  await adapter.openTransferScreen(page);
  await page
    .evaluate((state) => {
      (globalThis as unknown as { __STOCKCHECK_MINT_STATE__?: unknown }).__STOCKCHECK_MINT_STATE__ = state;
    }, mintPayload)
    .catch(() => {});

  await adapter.connectWallet(page);
  await adapter.selectToken(page, mintAddress);
  await adapter.enterRecipient(page, recipientAddress);

  if (isMax) {
    await adapter.clickMax(page);
  } else {
    await adapter.enterAmount(page, amountToEnter);
  }

  await adapter.clickReview(page);
  const capturedReview = await adapter.captureReview(page);
  const signature = await adapter.clickConfirmAndWaitForReceipt(page);

  return { capturedReview, signature };
}

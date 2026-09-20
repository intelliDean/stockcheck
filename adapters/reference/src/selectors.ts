/**
 * adapters/reference/src/selectors.ts
 *
 * Centralized DOM testids and query selectors for the StockCheck reference application.
 */

export const REFERENCE_SELECTORS = {
  TRANSFER_FORM: "transfer-form",
  WALLET_ADDRESS: "wallet-address",
  ASSET_SELECTOR: "asset-selector",
  ASSET_OPTION_PREFIX: "asset-option-",
  RECIPIENT_FIELD: "recipient-field",
  AMOUNT_FIELD: "amount-field",
  MAX_BUTTON: "max-button",
  REVIEW_BUTTON: "review-button",
  REVIEW_PANEL: "review-panel",
  REVIEW_AMOUNT: "review-amount",
  REVIEW_UNIT: "review-unit",
  REVIEW_RECIPIENT: "review-recipient",
  REVIEW_MINT: "review-mint",
  CONFIRM_BUTTON: "confirm-button",
  RECEIPT_SIGNATURE: "receipt-signature",
  NEW_TRANSFER_BUTTON: "new-transfer-button",
} as const;

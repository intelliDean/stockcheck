/**
 * @stockcheck/core — quantity types
 *
 * All raw token amounts MUST be BigInt.
 * Never pass rawBaseUnits through JavaScript Number.
 * Serialize large integers as decimal strings in reports.
 */

/**
 * Integer amount stored and transferred by the Token-2022 program.
 * This is the only quantity that moves on-chain.
 */
export type RawBaseUnits = bigint;

/**
 * Human-readable token quantity BEFORE applying a multiplier.
 * unscaledTokenUnits = rawBaseUnits / 10^decimals
 */
export type UnscaledTokenUnits = number;

/**
 * Multiplier-adjusted displayed quantity shown to the user.
 * scaledUnits = unscaledTokenUnits * multiplier
 * This is what the UI shows; NOT what the program transfers.
 */
export type ScaledUnits = number;

/** Unit convention the application uses for user input */
export type InputConvention = "scaled" | "unscaled";

export interface MintState {
  /** The mint address (base58) */
  mintAddress: string;
  /** Token program owner — must be Token-2022 */
  tokenProgram: string;
  /** Number of decimal places */
  decimals: number;
  /** Currently active multiplier */
  currentMultiplier: number;
  /** Pending new multiplier (may be same as current if no update scheduled) */
  newMultiplier: number;
  /** Unix timestamp (seconds) when newMultiplier activates; 0 = immediate */
  newMultiplierEffectiveTimestamp: bigint;
  /** Raw mint account bytes hash — used to prove no mint write occurred at activation */
  mintBytesHash: string;
}

export interface AccountSnapshot {
  /** Token account address (base58) */
  address: string;
  /** Raw token balance at this snapshot */
  rawBalance: RawBaseUnits;
  /** Snapshot taken at block height */
  slot: bigint;
  /** Unix timestamp of snapshot (seconds) */
  timestamp: bigint;
}

/** What the adapter captured from the review panel */
export interface CapturedReviewState {
  /** Displayed amount string as shown in the DOM (e.g. "2") */
  displayedAmount: string;
  /** Displayed unit label (e.g. "AAPL", "scaled units") */
  displayedUnit: string;
  /** Displayed recipient address */
  displayedRecipient: string;
  /** Displayed mint address (if shown) */
  displayedMint?: string;
}

/** Full evidence bundle for one test case */
export interface TestEvidence {
  /** Unique scenario ID (e.g. Q01) */
  scenarioId: string;
  /** Human-readable scenario description */
  scenarioDescription: string;
  /** Reference app/adapter version */
  adapterVersion: string;
  /** Fixture identity string */
  fixtureIdentity: string;
  /** Surfpool / Token-2022 program identity */
  runtimeIdentity: string;
  /** ISO timestamp of evaluation */
  evaluatedAt: string;
  /** Captured review panel state */
  capturedReview: CapturedReviewState;
  /** Mint state at evaluation time */
  mintStateAtEvaluation: MintState;
  /** Source account before transfer */
  sourceBefore: AccountSnapshot;
  /** Source account after transfer */
  sourceAfter: AccountSnapshot;
  /** Destination account before transfer */
  destinationBefore: AccountSnapshot;
  /** Destination account after transfer */
  destinationAfter: AccountSnapshot;
  /** The transaction signature */
  transactionSignature: string;
  /** Base64-encoded transaction message (for verification) */
  transactionMessage: string;
  /** Expected raw amount from independent UiAmountToAmount simulation */
  expectedRawAmount: RawBaseUnits;
  /** Observed sender debit (sourceBefore.rawBalance - sourceAfter.rawBalance) */
  observedSenderDebit: RawBaseUnits;
  /** Observed recipient credit (destinationAfter.rawBalance - destinationBefore.rawBalance) */
  observedRecipientCredit: RawBaseUnits;
  /** Scaled equivalent of actual movement (for report) */
  observedScaledEquivalent: ScaledUnits;
}

/** Possible verdict statuses */
export type VerdictStatus = "PASS" | "FAIL" | "UNSUPPORTED" | "NOT_TESTED";

/** Failure reason codes */
export type FailureCode =
  | "DISPLAYED_QUANTITY_MISMATCH"
  | "SENDER_DEBIT_RECIPIENT_CREDIT_MISMATCH"
  | "MAX_RESIDUAL_BALANCE"
  | "WRONG_MINT"
  | "WRONG_RECIPIENT"
  | "UNEXPECTED_INSTRUCTION"
  | "SIMULATION_FAILED"
  | "MISSING_EVIDENCE";

export interface Verdict {
  status: VerdictStatus;
  failureCode?: FailureCode;
  /** Human-readable summary */
  summary: string;
}

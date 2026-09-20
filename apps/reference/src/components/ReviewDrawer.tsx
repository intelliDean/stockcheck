import React from "react";
import type { ReviewState, TxStatus } from "../utils/conversion.js";

interface ReviewDrawerProps {
  review: ReviewState;
  txStatus: TxStatus;
  txError: string | null;
  onConfirm: () => void;
}

export const ReviewDrawer: React.FC<ReviewDrawerProps> = ({
  review,
  txStatus,
  txError,
  onConfirm,
}) => {
  return (
    <div className="review-panel" data-testid="review-panel">
      <div className="review-title">Review</div>

      {/* Separate DOM elements for StockCheck auditor to inspect (§6 requirement) */}
      <div className="review-amount-display" data-testid="review-amount">
        {review.amount}
      </div>
      <div className="review-unit-display" data-testid="review-unit">
        {review.unit}
      </div>

      <div className="review-row">
        <span className="review-row-label">Recipient</span>
        <span className="review-row-value" data-testid="review-recipient">
          {review.recipient}
        </span>
      </div>
      <div className="review-row">
        <span className="review-row-label">Mint</span>
        <span
          className="review-row-value"
          data-testid="review-mint"
          style={{ fontSize: "10px" }}
        >
          {review.mint}
        </span>
      </div>

      <button
        className="confirm-btn"
        data-testid="confirm-button"
        onClick={onConfirm}
        disabled={txStatus === "pending"}
      >
        {txStatus === "pending" ? (
          <>
            <span className="spinner" />
            Confirming…
          </>
        ) : (
          "Confirm Transfer"
        )}
      </button>

      {txStatus === "error" && txError && (
        <div className="error-box">{txError}</div>
      )}
    </div>
  );
};

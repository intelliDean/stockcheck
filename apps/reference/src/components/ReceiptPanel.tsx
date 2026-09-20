import React from "react";

interface ReceiptPanelProps {
  txSignature: string;
  onNewTransfer: () => void;
}

export const ReceiptPanel: React.FC<ReceiptPanelProps> = ({
  txSignature,
  onNewTransfer,
}) => {
  return (
    <div className="receipt-panel">
      <div className="receipt-success">
        <div className="receipt-icon">✓</div>
        <div className="receipt-status">Transfer Confirmed</div>
      </div>
      <div className="sig-box">
        <div className="sig-label">Transaction Signature</div>
        <div className="sig-value" data-testid="receipt-signature">
          {txSignature}
        </div>
      </div>
      <button
        className="review-btn"
        data-testid="new-transfer-button"
        style={{ marginTop: "16px" }}
        onClick={onNewTransfer}
      >
        Start Another Transfer
      </button>
    </div>
  );
};

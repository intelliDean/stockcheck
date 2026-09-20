import React from "react";
import type { MintInfo } from "../utils/conversion.js";

interface AssetSelectorProps {
  mint: MintInfo;
  effectiveMultiplier: number;
  displayedBalance: string;
  unitLabel: string;
  isOpen: boolean;
  onToggle: () => void;
  onSelect: () => void;
}

export const AssetSelector: React.FC<AssetSelectorProps> = ({
  mint,
  effectiveMultiplier,
  displayedBalance,
  unitLabel,
  isOpen,
  onToggle,
  onSelect,
}) => {
  return (
    <div className="field-group">
      <div className="field-label">
        <span>Asset</span>
        <span className="balance-hint">
          Balance:{" "}
          <span data-testid="balance-display">
            {displayedBalance} {unitLabel}
          </span>
        </span>
      </div>
      <div
        data-testid="asset-selector"
        onClick={onToggle}
        style={{
          background: "var(--bg-input)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-sm)",
          padding: "12px 16px",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "14px" }}>
          {mint.symbol}
        </span>
        <span
          style={{
            fontSize: "11px",
            color: "var(--text-muted)",
            fontFamily: "'JetBrains Mono', monospace",
          }}
        >
          ×{effectiveMultiplier} ▾
        </span>
      </div>
      {isOpen && (
        <div
          data-testid={`asset-option-${mint.address}`}
          onClick={onSelect}
          style={{
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
            padding: "10px 14px",
            borderRadius: "var(--radius-sm)",
            marginTop: "4px",
            cursor: "pointer",
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: "13px",
          }}
        >
          ✓ {mint.symbol} — {mint.address.slice(0, 6)}…{mint.address.slice(-4)}
        </div>
      )}
    </div>
  );
};

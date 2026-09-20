import React from "react";

interface WalletSectionProps {
  connected: boolean;
  walletAddress: string;
}

export const WalletSection: React.FC<WalletSectionProps> = ({
  connected,
  walletAddress,
}) => {
  return (
    <div className="wallet-section">
      <span className="wallet-label">Test Wallet</span>
      {connected ? (
        <span
          className="wallet-address"
          data-testid="wallet-address"
          title={walletAddress}
        >
          {walletAddress.slice(0, 6)}…{walletAddress.slice(-4)}
        </span>
      ) : (
        <span className="wallet-address" style={{ color: "var(--text-muted)" }}>
          Not connected
        </span>
      )}
    </div>
  );
};

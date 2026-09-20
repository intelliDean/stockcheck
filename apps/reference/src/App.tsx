/**
 * StockCheck Reference Transfer Application
 *
 * Three modes (set via ?mode=... URL param):
 *   correct          — uses the effective multiplier and correct Max handling
 *   ignore-activation — deliberately uses the old multiplier after activation (seeded defect Q06)
 *   max-roundtrip     — deliberately reconstructs Max from a rounded displayed balance (seeded defect Q07)
 */

import { useState, useEffect, useCallback } from "react";
import "./index.css";
import {
  getAppMode,
  getAppConvention,
  resolveMultiplier,
  scaledToRaw,
  rawToScaled,
  type MintInfo,
  type TestWallet,
  type ReviewState,
  type TxStatus,
} from "./utils/conversion.js";
import {
  getSourceTokenBalance,
  fetchMintExtensionState,
  executeTokenTransfer,
} from "./services/solana.js";
import { Header } from "./components/Header.js";
import { WalletSection } from "./components/WalletSection.js";
import { AssetSelector } from "./components/AssetSelector.js";
import { ReviewDrawer } from "./components/ReviewDrawer.js";
import { ReceiptPanel } from "./components/ReceiptPanel.js";
import mintFixture from "../../../fixtures/synthetic/mint.json";

export default function App() {
  const mode = getAppMode();
  const convention = getAppConvention();

  // Test wallet injected by Playwright fixture
  const testWallet: TestWallet | null =
    typeof window !== "undefined" &&
    (window as unknown as { __TEST_WALLET__?: TestWallet }).__TEST_WALLET__
      ? (window as unknown as { __TEST_WALLET__: TestWallet }).__TEST_WALLET__
      : null;

  // App State
  const [connected, setConnected] = useState(false);
  const [walletAddress, setWalletAddress] = useState<string>("");
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [review, setReview] = useState<ReviewState | null>(null);
  const [txStatus, setTxStatus] = useState<TxStatus>("idle");
  const [txSignature, setTxSignature] = useState<string | null>(null);
  const [txError, setTxError] = useState<string | null>(null);
  const [rawBalance, setRawBalance] = useState<bigint>(0n);
  const [assetDropdownOpen, setAssetDropdownOpen] = useState(false);
  const [isMaxClicked, setIsMaxClicked] = useState(false);
  const [, setTick] = useState(0);

  // Synthetic mint info — loaded from fixture and refreshed from on-chain state
  const [mint, setMint] = useState<MintInfo>({
    address: mintFixture.mintAddress || "SYNTHETIC_MINT_ADDRESS_REPLACE_WITH_FIXTURE",
    decimals: mintFixture.decimals || 6,
    currentMultiplier: mintFixture.initialMultiplier || 1,
    newMultiplier: 2,
    newMultiplierEffectiveTimestamp: 0n,
    symbol: "xSTOCK",
  });

  // Sync on-chain mint extension state
  useEffect(() => {
    async function syncMint() {
      const injected = (
        window as unknown as {
          __STOCKCHECK_MINT_STATE__?: unknown;
        }
      ).__STOCKCHECK_MINT_STATE__;
      if (injected) return;

      const onchain = await fetchMintExtensionState(mint.address);
      if (onchain) {
        setMint((prev) => ({
          ...prev,
          currentMultiplier: onchain.multiplier,
          newMultiplier: onchain.newMultiplier,
          newMultiplierEffectiveTimestamp: onchain.newMultiplierEffectiveTimestamp,
        }));
      }
    }
    syncMint();
  }, [mint.address]);

  // Auto-connect test wallet if injected
  useEffect(() => {
    if (testWallet && !connected) {
      setConnected(true);
      setWalletAddress(testWallet.publicKey);
    }
  }, [testWallet, connected]);

  // Load raw balance when connected
  useEffect(() => {
    if (!connected || !walletAddress) return;
    getSourceTokenBalance(walletAddress, mint.address).then((bal) => {
      setRawBalance(bal);
    });
  }, [connected, walletAddress, mint.address]);

  // Check injected test mint state from Playwright runner
  useEffect(() => {
    function checkInjectedMint() {
      const injected = (
        window as unknown as {
          __STOCKCHECK_MINT_STATE__?: {
            currentMultiplier: number;
            newMultiplier: number;
            newMultiplierEffectiveTimestamp: string;
          };
        }
      ).__STOCKCHECK_MINT_STATE__;
      if (injected) {
        setMint((prev) => {
          const ts = BigInt(injected.newMultiplierEffectiveTimestamp);
          if (
            prev.currentMultiplier === injected.currentMultiplier &&
            prev.newMultiplier === injected.newMultiplier &&
            prev.newMultiplierEffectiveTimestamp === ts
          ) {
            return prev;
          }
          return {
            ...prev,
            currentMultiplier: injected.currentMultiplier,
            newMultiplier: injected.newMultiplier,
            newMultiplierEffectiveTimestamp: ts,
          };
        });
      }
    }
    checkInjectedMint();
    const interval = setInterval(checkInjectedMint, 200);
    return () => clearInterval(interval);
  }, []);

  // Tick timer for schedule re-evaluations
  useEffect(() => {
    const interval = setInterval(() => {
      setTick((t) => t + 1);
    }, 500);
    return () => clearInterval(interval);
  }, []);

  const effectiveMultiplier = convention === "unscaled" ? 1 : resolveMultiplier(mint, mode);
  const displayedBalance = rawToScaled(rawBalance, mint.decimals, effectiveMultiplier);
  const unitLabel = convention === "unscaled" ? "unscaled units" : "scaled units";

  // Max button handler
  const handleMax = useCallback(() => {
    setIsMaxClicked(true);
    if (mode === "max-roundtrip") {
      // Seeded defect Q07: truncate to 2 decimal places from displayed balance, leaving residual raw tokens
      const truncated = (Math.floor(parseFloat(displayedBalance) * 100) / 100).toString();
      setAmount(truncated);
    } else {
      // Correct: use scaled equivalent of full raw balance
      setAmount(rawToScaled(rawBalance, mint.decimals, effectiveMultiplier));
    }
  }, [mode, rawBalance, mint.decimals, effectiveMultiplier, displayedBalance]);

  // Review button handler
  const handleReview = useCallback(() => {
    if (!amount || !recipient) return;

    let rawToTransfer = scaledToRaw(amount, mint.decimals, effectiveMultiplier);
    if (isMaxClicked && mode !== "max-roundtrip") {
      rawToTransfer = rawBalance;
    }

    setReview({
      amount: parseFloat(amount).toString(),
      unit: unitLabel,
      recipient: recipient.trim(),
      mint: mint.address,
      rawAmountToTransfer: rawToTransfer,
    });
    setTxStatus("idle");
    setTxSignature(null);
    setTxError(null);
  }, [amount, recipient, mint, effectiveMultiplier, unitLabel, isMaxClicked, mode, rawBalance]);

  // Confirm transfer handler
  const handleConfirm = useCallback(async () => {
    if (!review || !testWallet) return;

    setTxStatus("pending");
    setTxError(null);

    try {
      const sig = await executeTokenTransfer({
        walletSecretKey: testWallet.secretKey,
        walletPublicKey: testWallet.publicKey,
        recipientAddress: review.recipient,
        mintAddress: mint.address,
        decimals: mint.decimals,
        rawAmount: review.rawAmountToTransfer,
      });

      setTxSignature(sig);
      setTxStatus("confirmed");

      // Refresh on-chain balance
      const updatedBal = await getSourceTokenBalance(testWallet.publicKey, mint.address);
      setRawBalance(updatedBal);
    } catch (err: unknown) {
      setTxStatus("error");
      setTxError(err instanceof Error ? err.message : String(err));
    }
  }, [review, testWallet, mint.address, mint.decimals]);

  // Reset transfer form
  const handleStartNewTransfer = useCallback(() => {
    setAmount("");
    setRecipient("");
    setReview(null);
    setTxStatus("idle");
    setTxSignature(null);
    setTxError(null);
    setIsMaxClicked(false);
    if (walletAddress) {
      getSourceTokenBalance(walletAddress, mint.address).then(setRawBalance);
    }
  }, [walletAddress, mint.address]);

  return (
    <div className="app-container">
      <Header mode={mode} />

      <main className="card" data-testid="transfer-form">
        <WalletSection connected={connected} walletAddress={walletAddress} />

        <AssetSelector
          mint={mint}
          effectiveMultiplier={effectiveMultiplier}
          displayedBalance={displayedBalance}
          unitLabel={unitLabel}
          isOpen={assetDropdownOpen}
          onToggle={() => setAssetDropdownOpen((prev) => !prev)}
          onSelect={() => setAssetDropdownOpen(false)}
        />

        {/* Recipient Input */}
        <div className="field-group">
          <label className="field-label" htmlFor="recipient-input">
            Recipient
          </label>
          <input
            id="recipient-input"
            className="input-field mono"
            data-testid="recipient-field"
            type="text"
            placeholder="Enter recipient address..."
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            disabled={txStatus === "pending"}
          />
        </div>

        {/* Amount Input with MAX Button */}
        <div className="field-group">
          <label className="field-label" htmlFor="amount-input">
            Amount
          </label>
          <div className="input-row">
            <input
              id="amount-input"
              className="input-field mono"
              data-testid="amount-field"
              type="text"
              placeholder="0.000000"
              value={amount}
              onChange={(e) => {
                setIsMaxClicked(false);
                setAmount(e.target.value);
              }}
              disabled={txStatus === "pending"}
            />
            <button
              className="max-btn"
              data-testid="max-button"
              type="button"
              onClick={handleMax}
              disabled={!connected || rawBalance === 0n || txStatus === "pending"}
            >
              MAX
            </button>
          </div>
          <div className="amount-hint">
            Input: {convention} units ({convention === "unscaled" ? "unscaled" : `multiplier × ${effectiveMultiplier}`})
          </div>
        </div>

        {/* Review Button */}
        <button
          className="review-btn"
          data-testid="review-button"
          onClick={handleReview}
          disabled={!connected || !amount || !recipient}
        >
          Review Transfer
        </button>

        {/* Review Drawer Panel */}
        {review && txStatus !== "confirmed" && (
          <ReviewDrawer
            review={review}
            txStatus={txStatus}
            txError={txError}
            onConfirm={handleConfirm}
          />
        )}

        {/* Transaction Receipt Panel */}
        {txStatus === "confirmed" && txSignature && (
          <ReceiptPanel
            txSignature={txSignature}
            onNewTransfer={handleStartNewTransfer}
          />
        )}
      </main>
    </div>
  );
}

/**
 * StockCheck Reference Transfer Application
 *
 * Three modes (set via ?mode=... URL param):
 *   correct          — uses the effective multiplier and correct Max handling
 *   ignore-activation — deliberately uses the old multiplier after activation (seeded defect Q06)
 *   max-roundtrip     — deliberately reconstructs Max from a rounded displayed balance (seeded defect Q07)
 *
 * Mode differences are REAL application behavior differences — not flags in the checker.
 * The checker identifies errors independently from the actual transaction.
 */

import { useState, useEffect, useCallback } from "react";
import "./index.css";

// ──────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────

type AppMode = "correct" | "ignore-activation" | "max-roundtrip";

interface MintInfo {
  address: string;
  decimals: number;
  currentMultiplier: number;
  newMultiplier: number;
  newMultiplierEffectiveTimestamp: bigint;
  symbol: string;
}

interface TestWallet {
  publicKey: string;
  secretKey: Uint8Array;
  isTestWallet: boolean;
}

interface ReviewState {
  amount: string;
  unit: string;
  recipient: string;
  mint: string;
  rawAmountToTransfer: bigint;
}

type TxStatus = "idle" | "pending" | "confirmed" | "error";

// ──────────────────────────────────────────────────────────
// App mode detection
// ──────────────────────────────────────────────────────────

function getAppMode(): AppMode {
  const params = new URLSearchParams(window.location.search);
  const mode = params.get("mode");
  if (mode === "ignore-activation" || mode === "max-roundtrip") return mode;
  return "correct";
}

// ──────────────────────────────────────────────────────────
// Multiplier resolution (mirrors Token-2022's reference impl)
// ──────────────────────────────────────────────────────────

function resolveMultiplier(mint: MintInfo, mode: AppMode): number {
  if (mode === "ignore-activation") {
    // Defect: always use currentMultiplier, ignore activation timestamp
    return mint.currentMultiplier;
  }
  // Correct: check effective timestamp against current time
  const nowSeconds = BigInt(Math.floor(Date.now() / 1000));
  if (
    mint.newMultiplierEffectiveTimestamp > 0n &&
    nowSeconds >= mint.newMultiplierEffectiveTimestamp
  ) {
    return mint.newMultiplier;
  }
  return mint.currentMultiplier;
}

// ──────────────────────────────────────────────────────────
// Amount conversion
// ──────────────────────────────────────────────────────────

function scaledToRaw(
  scaledAmount: string,
  decimals: number,
  multiplier: number
): bigint {
  const scaled = parseFloat(scaledAmount);
  if (isNaN(scaled) || scaled <= 0) return 0n;
  // scaledUnits → unscaledUnits → rawBaseUnits
  const unscaled = scaled / multiplier;
  const rawFloat = unscaled * Math.pow(10, decimals);
  return BigInt(Math.floor(rawFloat));
}

function rawToScaled(raw: bigint, decimals: number, multiplier: number): string {
  const unscaled = Number(raw) / Math.pow(10, decimals);
  const scaled = unscaled * multiplier;
  return scaled.toFixed(6).replace(/\.?0+$/, "");
}

import {
  createSolanaRpc,
  createKeyPairSignerFromBytes,
  createTransactionMessage,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  appendTransactionMessageInstructions,
  signTransactionMessageWithSigners,
  getBase64EncodedWireTransaction,
  address,
} from "@solana/kit";
import {
  findAssociatedTokenPda,
  getCreateAssociatedTokenIdempotentInstruction,
  getTransferCheckedInstruction,
  fetchMint,
  fetchToken,
  TOKEN_2022_PROGRAM_ADDRESS,
} from "@solana-program/token-2022";
import mintFixture from "../../../fixtures/synthetic/mint.json";

// ──────────────────────────────────────────────────────────
// RPC helpers & On-Chain state
// ──────────────────────────────────────────────────────────

const SURFPOOL_RPC = "http://127.0.0.1:8899";

async function getSourceTokenBalance(walletPubkey: string, mintAddress: string): Promise<bigint> {
  try {
    const rpc = createSolanaRpc(SURFPOOL_RPC);
    const [ata] = await findAssociatedTokenPda({
      mint: address(mintAddress),
      owner: address(walletPubkey),
      tokenProgram: TOKEN_2022_PROGRAM_ADDRESS,
    });
    const tokenAccount = await fetchToken(rpc, ata);
    return tokenAccount.data.amount;
  } catch {
    return 0n;
  }
}

// ──────────────────────────────────────────────────────────
// Main App component
// ──────────────────────────────────────────────────────────

export default function App() {
  const mode = getAppMode();

  // Test wallet injected by Playwright fixture
  const testWallet: TestWallet | null =
    typeof window !== "undefined" && (window as unknown as { __TEST_WALLET__?: TestWallet }).__TEST_WALLET__
      ? (window as unknown as { __TEST_WALLET__: TestWallet }).__TEST_WALLET__
      : null;

  // App state
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

  // Synthetic mint info — loaded from fixture and refreshed from on-chain state
  const [mint, setMint] = useState<MintInfo>({
    address: mintFixture.mintAddress || "SYNTHETIC_MINT_ADDRESS_REPLACE_WITH_FIXTURE",
    decimals: mintFixture.decimals || 6,
    currentMultiplier: mintFixture.initialMultiplier || 1,
    newMultiplier: 2,
    newMultiplierEffectiveTimestamp: 0n,
    symbol: "xSTOCK",
  });

  // Sync on-chain mint extension state if running
  useEffect(() => {
    async function syncMint() {
      try {
        const rpc = createSolanaRpc(SURFPOOL_RPC);
        const onchain = await fetchMint(rpc, address(mint.address));
        if (onchain?.data?.extensions?.__option === "Some") {
          const scaledExt = (onchain.data.extensions.value as Array<{ __kind: string; multiplier?: number; newMultiplier?: number; newMultiplierEffectiveTimestamp?: bigint }>).find(
            (e) => e.__kind === "ScaledUiAmountConfig"
          );
          if (scaledExt) {
            setMint((prev) => ({
              ...prev,
              currentMultiplier: scaledExt.multiplier ?? 1,
              newMultiplier: scaledExt.newMultiplier ?? 2,
              newMultiplierEffectiveTimestamp: BigInt(scaledExt.newMultiplierEffectiveTimestamp ?? 0n),
            }));
          }
        }
      } catch {
        // Use local defaults if node not responding
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

  const effectiveMultiplier = resolveMultiplier(mint, mode);
  const displayedBalance = rawToScaled(rawBalance, mint.decimals, effectiveMultiplier);
  const unitLabel = "scaled units";

  // ── Max button ──────────────────────────────────────────
  const [isMaxClicked, setIsMaxClicked] = useState(false);

  const handleMax = useCallback(() => {
    setIsMaxClicked(true);
    if (mode === "max-roundtrip") {
      // Defect: truncate to 2 decimal places from displayed balance, leaving residual raw tokens
      const truncated = (Math.floor(parseFloat(displayedBalance) * 100) / 100).toString();
      setAmount(truncated);
    } else {
      // Correct: use scaled equivalent of full raw balance
      setAmount(rawToScaled(rawBalance, mint.decimals, effectiveMultiplier));
    }
  }, [mode, rawBalance, mint.decimals, effectiveMultiplier, displayedBalance]);

  // ── Review ──────────────────────────────────────────────
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

  // ── Confirm / Execute ───────────────────────────────────
  const handleConfirm = useCallback(async () => {
    if (!review || !testWallet) return;

    setTxStatus("pending");
    setTxError(null);

    try {
      const rpc = createSolanaRpc(SURFPOOL_RPC);
      const payerSigner = await createKeyPairSignerFromBytes(testWallet.secretKey);

      // Derive source ATA
      const [sourceAta] = await findAssociatedTokenPda({
        mint: address(mint.address),
        owner: address(testWallet.publicKey),
        tokenProgram: TOKEN_2022_PROGRAM_ADDRESS,
      });

      // Derive recipient ATA
      const [recipientAta] = await findAssociatedTokenPda({
        mint: address(mint.address),
        owner: address(review.recipient),
        tokenProgram: TOKEN_2022_PROGRAM_ADDRESS,
      });

      // Ensure recipient ATA exists
      const createRecipientAtaIx = getCreateAssociatedTokenIdempotentInstruction({
        payer: payerSigner,
        ata: recipientAta,
        owner: address(review.recipient),
        mint: address(mint.address),
        tokenProgram: TOKEN_2022_PROGRAM_ADDRESS,
      });

      // Build real Token-2022 TransferChecked instruction
      const transferCheckedIx = getTransferCheckedInstruction({
        source: sourceAta,
        mint: address(mint.address),
        destination: recipientAta,
        authority: payerSigner,
        amount: review.rawAmountToTransfer,
        decimals: mint.decimals,
      });

      const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();

      const message = createTransactionMessage({ version: 0 });
      const withPayer = setTransactionMessageFeePayerSigner(payerSigner, message);
      const withLifetime = setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, withPayer);
      const withIxs = appendTransactionMessageInstructions(
        [createRecipientAtaIx, transferCheckedIx],
        withLifetime
      );

      const signedTx = await signTransactionMessageWithSigners(withIxs);
      const base64WireTx = getBase64EncodedWireTransaction(signedTx);
      const sig = await rpc.sendTransaction(base64WireTx, { encoding: "base64" }).send();

      setTxSignature(sig);
      setTxStatus("confirmed");

      // Refresh on-chain balance
      const updatedBal = await getSourceTokenBalance(testWallet.publicKey, mint.address);
      setRawBalance(updatedBal);
    } catch (e) {
      console.error("[StockCheck] Transfer execution error:", e);
      setTxError(e instanceof Error ? e.message : "Transaction failed");
      setTxStatus("error");
    }
  }, [review, testWallet, mint]);

  // ──────────────────────────────────────────────────────────
  // Render
  // ──────────────────────────────────────────────────────────

  const isFaulty = mode !== "correct";

  return (
    <>
      {/* Environment banner — MUST be prominently displayed */}
      <div className="environment-banner">
        ⚠️ Local test environment — synthetic assets — not real money
      </div>

      <header className="app-header">
        <h1 className="app-title">StockCheck</h1>
        <span className={`mode-badge ${isFaulty ? "faulty" : "correct"}`}>
          {mode}
        </span>
      </header>

      <main className="card" data-testid="transfer-form">
        {/* Wallet section */}
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

        {/* Asset selector */}
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
            onClick={() => setAssetDropdownOpen((prev) => !prev)}
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
            <span style={{ fontSize: "11px", color: "var(--text-muted)", fontFamily: "'JetBrains Mono', monospace" }}>
              ×{effectiveMultiplier} ▾
            </span>
          </div>
          {assetDropdownOpen && (
            <div
              data-testid={`asset-option-${mint.address}`}
              onClick={() => setAssetDropdownOpen(false)}
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

        {/* Recipient */}
        <div className="field-group">
          <div className="field-label">Recipient</div>
          <input
            className="field-input"
            data-testid="recipient-field"
            placeholder="Enter recipient address…"
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
        </div>

        {/* Amount */}
        <div className="field-group">
          <div className="field-label">Amount</div>
          <div className="amount-wrapper">
            <input
              className="field-input"
              data-testid="amount-field"
              placeholder="0.000000"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputMode="decimal"
              autoComplete="off"
            />
            <button
              className="max-btn"
              data-testid="max-button"
              onClick={handleMax}
              disabled={!connected}
            >
              MAX
            </button>
          </div>
          <div className="unit-convention">
            Input: {unitLabel} (multiplier × {effectiveMultiplier})
          </div>
        </div>

        {/* Review button */}
        <button
          className="review-btn"
          data-testid="review-button"
          onClick={handleReview}
          disabled={!connected || !amount || !recipient}
        >
          Review Transfer
        </button>

        {/* Review panel */}
        {review && txStatus !== "confirmed" && (
          <div className="review-panel" data-testid="review-panel">
            <div className="review-title">Review</div>

            {/* Separate DOM elements for StockCheck to inspect (§6 requirement) */}
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
              onClick={handleConfirm}
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
        )}

        {/* Receipt */}
        {txStatus === "confirmed" && txSignature && (
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
          </div>
        )}
      </main>
    </>
  );
}

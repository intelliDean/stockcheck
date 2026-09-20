/**
 * apps/reference/src/services/solana.ts
 *
 * Solana RPC service for account derivation, mint state synchronization,
 * and on-chain Token-2022 TransferChecked transaction submission.
 */

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

export const SURFPOOL_RPC = "http://127.0.0.1:8899";

/**
 * Fetch raw token account balance for a wallet owner.
 */
export async function getSourceTokenBalance(
  walletPubkey: string,
  mintAddress: string,
  rpcUrl = SURFPOOL_RPC
): Promise<bigint> {
  try {
    const rpc = createSolanaRpc(rpcUrl);
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

/**
 * Fetch on-chain ScaledUiAmountConfig extension state from mint.
 */
export async function fetchMintExtensionState(
  mintAddress: string,
  rpcUrl = SURFPOOL_RPC
): Promise<{
  multiplier: number;
  newMultiplier: number;
  newMultiplierEffectiveTimestamp: bigint;
} | null> {
  try {
    const rpc = createSolanaRpc(rpcUrl);
    const onchain = await fetchMint(rpc, address(mintAddress));
    if (onchain?.data?.extensions?.__option === "Some") {
      const extensions = onchain.data.extensions.value as Array<{
        __kind: string;
        multiplier?: number;
        newMultiplier?: number;
        newMultiplierEffectiveTimestamp?: bigint;
      }>;
      const scaledExt = extensions.find((e) => e.__kind === "ScaledUiAmountConfig");
      if (scaledExt) {
        return {
          multiplier: scaledExt.multiplier ?? 1,
          newMultiplier: scaledExt.newMultiplier ?? 2,
          newMultiplierEffectiveTimestamp: BigInt(scaledExt.newMultiplierEffectiveTimestamp ?? 0n),
        };
      }
    }
  } catch {
    // Return null if offline or not found
  }
  return null;
}

export interface ExecuteTransferParams {
  walletSecretKey: Uint8Array;
  walletPublicKey: string;
  recipientAddress: string;
  mintAddress: string;
  decimals: number;
  rawAmount: bigint;
  rpcUrl?: string;
}

/**
 * Build, sign, and broadcast an on-chain Token-2022 TransferChecked transaction.
 */
export async function executeTokenTransfer(
  params: ExecuteTransferParams
): Promise<string> {
  const {
    walletSecretKey,
    walletPublicKey,
    recipientAddress,
    mintAddress,
    decimals,
    rawAmount,
    rpcUrl = SURFPOOL_RPC,
  } = params;

  const rpc = createSolanaRpc(rpcUrl);
  const payerSigner = await createKeyPairSignerFromBytes(walletSecretKey);

  // Derive source ATA
  const [sourceAta] = await findAssociatedTokenPda({
    mint: address(mintAddress),
    owner: address(walletPublicKey),
    tokenProgram: TOKEN_2022_PROGRAM_ADDRESS,
  });

  // Derive recipient ATA
  const [recipientAta] = await findAssociatedTokenPda({
    mint: address(mintAddress),
    owner: address(recipientAddress),
    tokenProgram: TOKEN_2022_PROGRAM_ADDRESS,
  });

  // Ensure recipient ATA exists
  const createRecipientAtaIx = getCreateAssociatedTokenIdempotentInstruction({
    payer: payerSigner,
    ata: recipientAta,
    owner: address(recipientAddress),
    mint: address(mintAddress),
    tokenProgram: TOKEN_2022_PROGRAM_ADDRESS,
  });

  // Build real Token-2022 TransferChecked instruction
  const transferCheckedIx = getTransferCheckedInstruction({
    source: sourceAta,
    mint: address(mintAddress),
    destination: recipientAta,
    authority: payerSigner,
    amount: rawAmount,
    decimals,
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
  const signature = await rpc.sendTransaction(base64WireTx, { encoding: "base64" }).send();

  return signature;
}

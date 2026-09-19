/**
 * @stockcheck/runtime — Mint management
 *
 * Helpers to create and inspect ScaledUiAmount Token-2022 mints
 * on the local Surfpool environment.
 */

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
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
  getCreateAssociatedTokenIdempotentInstruction,
  getMintToInstruction,
  findAssociatedTokenPda,
  TOKEN_2022_PROGRAM_ADDRESS,
} from "@solana-program/token-2022";

export interface SyntheticMintConfig {
  /** Mint address (base58) */
  mintAddress: string;
  /** Token program: always Token-2022 for ScaledUiAmount */
  tokenProgram: string;
  /** Decimal places — 6 for the primary synthetic fixture */
  decimals: number;
  /** Initial multiplier at mint creation */
  initialMultiplier: number;
  /** Base58 keypair path used to create the mint */
  mintKeypairPath?: string;
  /** SHA-256 hash of raw mint account bytes at creation (hex) */
  mintBytesHashAtCreation: string;
}

/**
 * Compute a SHA-256 hash of raw mint account data bytes.
 * Used to prove the mint was NOT written during a time-activation test.
 */
export function hashMintBytes(data: Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}

/**
 * Load a pre-existing synthetic mint config from fixtures/synthetic/mint.json.
 * Returns null if the fixture does not exist yet.
 */
export function loadSyntheticMintConfig(
  fixturePath: string
): SyntheticMintConfig | null {
  try {
    const raw = readFileSync(fixturePath, "utf-8");
    return JSON.parse(raw) as SyntheticMintConfig;
  } catch {
    return null;
  }
}

/** Save the synthetic mint config to fixtures/synthetic/mint.json */
export function saveSyntheticMintConfig(
  fixturePath: string,
  config: SyntheticMintConfig
): void {
  writeFileSync(fixturePath, JSON.stringify(config, null, 2));
}

/**
 * Mint synthetic Token-2022 ScaledUiAmount tokens directly to any recipient wallet.
 * Creates the recipient ATA idempotently if it does not already exist.
 */
export async function mintTokensTo(
  recipientOwnerAddress: string,
  rawAmount: bigint,
  fixtureDir?: string,
  rpcUrl = "http://127.0.0.1:8899"
): Promise<string> {
  const dir =
    fixtureDir ??
    resolve(dirname(fileURLToPath(import.meta.url)), "../../../fixtures/synthetic");
  const mintJson = JSON.parse(readFileSync(resolve(dir, "mint.json"), "utf-8"));
  const authJson = JSON.parse(readFileSync(resolve(dir, "mint-authority.json"), "utf-8"));

  const rpc = createSolanaRpc(rpcUrl);
  const authoritySigner = await createKeyPairSignerFromBytes(
    new Uint8Array(authJson.secretKeyArray)
  );
  const mintAddr = address(mintJson.mintAddress);
  const recipientAddr = address(recipientOwnerAddress);

  const [recipientAta] = await findAssociatedTokenPda({
    mint: mintAddr,
    owner: recipientAddr,
    tokenProgram: TOKEN_2022_PROGRAM_ADDRESS,
  });

  const createAtaIx = getCreateAssociatedTokenIdempotentInstruction({
    payer: authoritySigner,
    ata: recipientAta,
    owner: recipientAddr,
    mint: mintAddr,
    tokenProgram: TOKEN_2022_PROGRAM_ADDRESS,
  });

  const mintToIx = getMintToInstruction({
    mint: mintAddr,
    token: recipientAta,
    mintAuthority: authoritySigner.address,
    amount: rawAmount,
  });

  const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();
  const message = createTransactionMessage({ version: 0 });
  const withPayer = setTransactionMessageFeePayerSigner(authoritySigner, message);
  const withLifetime = setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, withPayer);
  const withIxs = appendTransactionMessageInstructions([createAtaIx, mintToIx], withLifetime);

  const signedTx = await signTransactionMessageWithSigners(withIxs);
  const wireTx = getBase64EncodedWireTransaction(signedTx);
  const sig = await rpc.sendTransaction(wireTx, { encoding: "base64" }).send();
  return sig;
}

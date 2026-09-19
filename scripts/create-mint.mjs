#!/usr/bin/env node
/**
 * scripts/create-mint.mjs
 *
 * Creates the synthetic ScaledUiAmount Token-2022 mint on Surfpool using @solana/kit.
 * Saves the mint config to fixtures/synthetic/mint.json for use by the reference app and tests.
 * Computes and saves the SHA-256 hash of the initial mint bytes.
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createSolanaRpc,
  generateKeyPairSigner,
  createTransactionMessage,
  addSignersToInstruction,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  appendTransactionMessageInstructions,
  signTransactionMessageWithSigners,
  getBase64EncodedWireTransaction,
  getAddressEncoder,
  address,
  AccountRole,
} from "@solana/kit";
import {
  getInitializeScaledUiAmountMintInstruction,
  getInitializeMintInstruction,
  TOKEN_2022_PROGRAM_ADDRESS,
  fetchMint,
} from "@solana-program/token-2022";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = resolve(__dirname, "../fixtures/synthetic");
const FIXTURE_PATH = resolve(FIXTURE_DIR, "mint.json");
const KEYPAIR_PATH = resolve(FIXTURE_DIR, "mint-keypair.json");
const SURFPOOL_RPC = process.env.SURFPOOL_RPC_URL || "http://127.0.0.1:8899";

async function main() {
  console.log("🔧 StockCheck — Creating synthetic ScaledUiAmount Token-2022 mint...");

  const rpc = createSolanaRpc(SURFPOOL_RPC);

  // Check health
  const healthRes = await fetch(SURFPOOL_RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getHealth", params: [] }),
  }).catch(() => null);

  if (!healthRes || !healthRes.ok) {
    console.error("❌ Surfpool is not running at " + SURFPOOL_RPC + ". Start it first: surfpool start");
    process.exit(1);
  }

  // 1. Generate payer and airdrop
  const payer = await generateKeyPairSigner();
  console.log(`👤 Payer generated: ${payer.address}`);

  const airdropRes = await fetch(SURFPOOL_RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "requestAirdrop",
      params: [payer.address, 10_000_000_000],
    }),
  });
  await airdropRes.json();
  await new Promise((r) => setTimeout(r, 500));

  // 2. Generate mint keypair
  const mint = await generateKeyPairSigner();
  console.log(`🪙 Mint generated: ${mint.address}`);

  // System createAccount data for 226-byte mint with ScaledUiAmountConfig
  const space = 226n;
  const rent = 3_000_000n;
  const createAccountData = new Uint8Array(4 + 8 + 8 + 32);
  const view = new DataView(createAccountData.buffer);
  view.setUint32(0, 0, true);
  view.setBigUint64(4, rent, true);
  view.setBigUint64(12, space, true);
  createAccountData.set(getAddressEncoder().encode(TOKEN_2022_PROGRAM_ADDRESS), 20);

  const createAccountIx = addSignersToInstruction([mint], {
    programAddress: address("11111111111111111111111111111111"),
    accounts: [
      { address: payer.address, role: AccountRole.WRITABLE_SIGNER, signer: payer },
      { address: mint.address, role: AccountRole.WRITABLE_SIGNER, signer: mint },
    ],
    data: createAccountData,
  });

  // ScaledUiAmount extension init: initial multiplier = 1.0
  const initScaledIx = getInitializeScaledUiAmountMintInstruction({
    mint: mint.address,
    authority: payer.address,
    multiplier: 1.0,
  });

  // Mint init: 6 decimals
  const initMintIx = getInitializeMintInstruction({
    mint: mint.address,
    decimals: 6,
    mintAuthority: payer.address,
  });

  const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();

  const message = createTransactionMessage({ version: 0 });
  const withPayer = setTransactionMessageFeePayerSigner(payer, message);
  const withLifetime = setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, withPayer);
  const withIxs = appendTransactionMessageInstructions(
    [createAccountIx, initScaledIx, initMintIx],
    withLifetime
  );

  const signedTx = await signTransactionMessageWithSigners(withIxs);
  const base64WireTx = getBase64EncodedWireTransaction(signedTx);
  const txSig = await rpc.sendTransaction(base64WireTx, { encoding: "base64" }).send();
  console.log(`✅ Mint initialized on-chain. Tx: ${txSig}`);

  // Fetch mint account raw bytes for SHA-256 hash tracking
  const rawInfo = await rpc.getAccountInfo(mint.address, { encoding: "base64" }).send();
  const rawBytes = rawInfo.value.data[0];
  const mintBytesHash = createHash("sha256")
    .update(Buffer.from(rawBytes, "base64"))
    .digest("hex");

  // Verify decoded mint
  const decoded = await fetchMint(rpc, mint.address);
  console.log(`🔒 Mint SHA-256 hash: ${mintBytesHash}`);
  console.log(`📊 Decoded decimals: ${decoded.data.decimals}, supply: ${decoded.data.supply}`);

  mkdirSync(FIXTURE_DIR, { recursive: true });

  const fixture = {
    mintAddress: mint.address,
    tokenProgram: TOKEN_2022_PROGRAM_ADDRESS,
    decimals: 6,
    initialMultiplier: 1.0,
    authorityAddress: payer.address,
    mintBytesHashAtCreation: mintBytesHash,
    createdAt: new Date().toISOString(),
    rpcUrl: SURFPOOL_RPC,
    note: "Synthetic token — LOCAL TEST ENVIRONMENT ONLY. Not real money.",
  };

  writeFileSync(FIXTURE_PATH, JSON.stringify(fixture, null, 2));
  console.log(`📄 Mint fixture saved to: ${FIXTURE_PATH}`);
}

main().catch((err) => {
  console.error("Fatal error in create-mint:", err);
  process.exit(1);
});

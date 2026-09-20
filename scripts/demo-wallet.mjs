#!/usr/bin/env node
/**
 * scripts/demo-wallet.mjs
 *
 * Generates and funds a test wallet on local Surfpool for interactive browser testing.
 * Prints out the wallet address, recipient address, and ready-to-paste DevTools snippet.
 */

import { generateTestKeypair, buildWalletInjectionScript } from "../packages/test-wallet/dist/index.js";
import { airdropSol, mintTokensTo, readAccountSnapshot } from "../packages/runtime/dist/index.js";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = resolve(__dirname, "../fixtures/synthetic/mint.json");

if (!existsSync(FIXTURE_PATH)) {
  console.error("❌ Mint fixture not found at " + FIXTURE_PATH + ". Run 'node scripts/create-mint.mjs' first.");
  process.exit(1);
}

const mintData = JSON.parse(readFileSync(FIXTURE_PATH, "utf-8"));
const mintAddress = mintData.mintAddress;

console.log("⚡ Creating and funding interactive test wallet on Surfpool...\n");

const sender = await generateTestKeypair();
const recipient = await generateTestKeypair();

try {
  // Airdrop 10 SOL for fees
  await airdropSol(sender.publicKey, 10_000_000_000n);
  // Mint 5.0 xSTOCK (5,000,000 raw units, 6 decimals)
  await mintTokensTo(sender.publicKey, 5_000_000n);
} catch (err) {
  console.error("❌ Failed to fund wallet on Surfpool (is Surfpool running on http://127.0.0.1:8899?):", err);
  process.exit(1);
}

const snap = await readAccountSnapshot(sender.publicKey, mintAddress);
const formattedBal = (Number(snap.rawBalance) / 1_000_000).toFixed(6);

console.log("═══════════════════════════════════════════════════════════════════════════");
console.log("  STOCKCHECK INTERACTIVE BROWSER TEST CREDENTIALS");
console.log("═══════════════════════════════════════════════════════════════════════════");
console.log("  Token Mint:        " + mintAddress + " (xSTOCK)");
console.log("  Test Wallet:       " + sender.publicKey);
console.log("  Funded Balance:    " + formattedBal + " xSTOCK (" + snap.rawBalance + " raw base units)");
console.log("  Sample Recipient:  " + recipient.publicKey);
console.log("───────────────────────────────────────────────────────────────────────────");
console.log("  HOW TO USE IN BROWSER:");
console.log("  1. Open http://localhost:5173 in Google Chrome or any browser.");
console.log("  2. Open DevTools (F12 or Cmd+Option+I) -> Console tab.");
console.log("  3. Paste the following snippet and hit Enter:\n");
console.log(buildWalletInjectionScript(sender));
console.log("\n  4. The Test Wallet box will immediately connect with your balance!");
console.log("  5. Paste the Sample Recipient above into the Recipient field.");
console.log("═══════════════════════════════════════════════════════════════════════════\n");

#!/usr/bin/env node
/**
 * scripts/create-mint.js
 *
 * Creates the synthetic ScaledUiAmount Token-2022 mint for local testing.
 * Run this once after starting Surfpool: node scripts/create-mint.js
 *
 * Saves the mint config to fixtures/synthetic/mint.json for use by tests.
 * Also saves a SHA-256 hash of the mint bytes at creation — used in Q03 to
 * prove that no mint write occurred during time-based multiplier activation.
 *
 * THIS IS DEV TOOLING — outputs synthetic tokens only.
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = resolve(__dirname, "../fixtures/synthetic");
const FIXTURE_PATH = resolve(FIXTURE_DIR, "mint.json");
const SURFPOOL_RPC = "http://127.0.0.1:8899";

async function rpc(method, params = []) {
  const response = await fetch(SURFPOOL_RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const json = await response.json();
  if (json.error) throw new Error(`RPC ${method}: ${json.error.message}`);
  return json.result;
}

async function main() {
  console.log("🔧 StockCheck — Creating synthetic mint...");

  // Check Surfpool is running
  const health = await rpc("getHealth").catch(() => null);
  if (!health) {
    console.error("❌ Surfpool is not running. Start it first: surfpool start");
    process.exit(1);
  }

  // For the hackathon submission, we use spl-token CLI to create the mint
  // This ensures we're using the official Token-2022 program path
  const { execSync } = await import("node:child_process");

  console.log("📦 Creating 6-decimal ScaledUiAmount Token-2022 mint...");

  // Generate a mint keypair
  const mintKeypairPath = resolve(FIXTURE_DIR, "mint-keypair.json");
  mkdirSync(FIXTURE_DIR, { recursive: true });

  try {
    // Create the mint with ScaledUiAmount extension, multiplier=1
    execSync(
      [
        "spl-token",
        "--program-id", "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
        "--url", SURFPOOL_RPC,
        "create-token",
        "--decimals", "6",
        "--ui-amount-multiplier", "1",
        "--mint-authority", "$(solana-keygen pubkey)",
        "--output", "json",
        "--output-path", mintKeypairPath,
      ].join(" "),
      { stdio: "pipe" }
    );
  } catch (err) {
    console.warn(
      "⚠️  spl-token CLI not found or failed — using placeholder mint config for now."
    );
    console.warn("   Install spl-token: cargo install spl-token-cli");
    
    // Write a placeholder so tests can import the fixture shape
    const placeholder = {
      mintAddress: "PLACEHOLDER_MINT_ADDRESS_RUN_SCRIPTS_CREATE_MINT",
      tokenProgram: "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
      decimals: 6,
      initialMultiplier: 1,
      mintKeypairPath,
      mintBytesHashAtCreation: "pending",
      note: "Run: node scripts/create-mint.js after installing spl-token CLI",
    };
    mkdirSync(FIXTURE_DIR, { recursive: true });
    writeFileSync(FIXTURE_PATH, JSON.stringify(placeholder, null, 2));
    console.log(`📄 Placeholder fixture written to: ${FIXTURE_PATH}`);
    return;
  }

  // Read the created mint address from keypair
  const mintAddress = execSync(
    `solana-keygen pubkey ${mintKeypairPath}`
  ).toString().trim();

  // Read raw mint account bytes for hash
  const accountInfo = await rpc("getAccountInfo", [
    mintAddress,
    { encoding: "base64" },
  ]);
  const rawBytes = accountInfo?.value?.data?.[0] ?? "";
  const mintBytesHash = createHash("sha256")
    .update(Buffer.from(rawBytes, "base64"))
    .digest("hex");

  const config = {
    mintAddress,
    tokenProgram: "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
    decimals: 6,
    initialMultiplier: 1,
    mintKeypairPath,
    mintBytesHashAtCreation: mintBytesHash,
    createdAt: new Date().toISOString(),
    note: "Synthetic token — LOCAL TEST ENVIRONMENT ONLY. Not real money.",
  };

  writeFileSync(FIXTURE_PATH, JSON.stringify(config, null, 2));
  console.log(`✅ Mint created: ${mintAddress}`);
  console.log(`📄 Config written to: ${FIXTURE_PATH}`);
  console.log(`🔒 Mint bytes hash: ${mintBytesHash}`);
  console.log("");
  console.log("⚠️  LOCAL TEST ENVIRONMENT — synthetic assets only.");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});

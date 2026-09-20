/**
 * @stockcheck/test-wallet
 *
 * Generates a disposable keypair for use in the local Surfpool environment.
 * Provides a browser-injection script so the reference app can access the
 * test wallet without requiring a real browser extension.
 *
 * SECURITY NOTE: This is ONLY for local test environments. Never use
 * generated keypairs with real funds. Keys are kept out of Git (see .gitignore).
 */

import { webcrypto } from "node:crypto";

/** A disposable test keypair */
export interface TestKeypair {
  /** Base58-encoded public key */
  publicKey: string;
  /** Raw 64-byte secret key (32-byte seed + 32-byte public key) */
  secretKey: Uint8Array;
  /** Secret key as a JSON number array for localStorage / injection */
  secretKeyArray: number[];
}

/**
 * Generate a new random Ed25519 keypair for test use.
 * Uses the Web Crypto API — no external dependencies.
 */
export async function generateTestKeypair(): Promise<TestKeypair> {
  const keyPair = await webcrypto.subtle.generateKey(
    { name: "Ed25519" } as any,
    true,
    ["sign", "verify"]
  );

  const rawPrivate = await webcrypto.subtle.exportKey(
    "pkcs8",
    keyPair.privateKey
  );
  const rawPublic = await webcrypto.subtle.exportKey("raw", keyPair.publicKey);

  // Ed25519 PKCS8 is 48 bytes; seed is the last 32
  const seed = new Uint8Array(rawPrivate).slice(-32);
  const pubBytes = new Uint8Array(rawPublic); // 32 bytes

  // Full secret key = seed || pubkey (matches @solana/kit convention)
  const secretKey = new Uint8Array(64);
  secretKey.set(seed, 0);
  secretKey.set(pubBytes, 32);

  return {
    publicKey: toBase58(pubBytes),
    secretKey,
    secretKeyArray: Array.from(secretKey),
  };
}

/**
 * Build the browser init script that injects the test wallet into window.
 * Call this with page.addInitScript() BEFORE page.goto().
 *
 * The reference app checks for window.__TEST_WALLET__ in test mode and
 * uses it as its signer — no real wallet extension needed.
 */
export function buildWalletInjectionScript(keypair: TestKeypair): string {
  return `
(function() {
  const secretKey = new Uint8Array(${JSON.stringify(keypair.secretKeyArray)});
  window.__TEST_WALLET__ = {
    publicKey: ${JSON.stringify(keypair.publicKey)},
    secretKey: secretKey,
    isTestWallet: true,
  };
  console.log('[StockCheck] Test wallet injected:', ${JSON.stringify(keypair.publicKey)});
})();
`.trim();
}

// ──────────────────────────────────────────────────────────
// Minimal Base58 (no external dep required for keypairs)
// ──────────────────────────────────────────────────────────

const BASE58_ALPHABET =
  "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function toBase58(bytes: Uint8Array): string {
  let hex = "";
  for (const b of bytes) {
    hex += b.toString(16).padStart(2, "0");
  }
  let num = BigInt("0x" + (hex || "0"));
  const result: string[] = [];

  while (num > 0n) {
    const rem = num % 58n;
    num = num / 58n;
    result.unshift(BASE58_ALPHABET[Number(rem)] as string);
  }

  // Leading zeros
  for (const b of bytes) {
    if (b !== 0) break;
    result.unshift("1");
  }

  return result.join("");
}

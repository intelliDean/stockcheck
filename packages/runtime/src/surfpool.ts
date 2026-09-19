/**
 * @stockcheck/runtime — Surfpool wrapper
 *
 * Provides helpers to:
 *  - Start/stop a local Surfpool instance
 *  - Fund test wallets (SOL + token accounts)
 *  - Execute time-travel cheatcodes
 *  - Read the Solana Clock sysvar
 *
 * IMPORTANT: surfnet_timeTravel takes milliseconds.
 *            The Solana Clock sysvar reports seconds.
 *            All public APIs here use SECONDS unless explicitly named *Ms.
 */

const SURFPOOL_RPC_URL = "http://127.0.0.1:8899";

// ──────────────────────────────────────────────────────────
// RPC helpers
// ──────────────────────────────────────────────────────────

async function rpc(
  method: string,
  params: unknown[] = []
): Promise<unknown> {
  const response = await fetch(SURFPOOL_RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method,
      params,
    }),
  });

  if (!response.ok) {
    throw new Error(
      `Surfpool RPC ${method} failed: HTTP ${response.status} ${response.statusText}`
    );
  }

  const json = (await response.json()) as { result?: unknown; error?: { message: string } };

  if (json.error != null) {
    throw new Error(`Surfpool RPC ${method} error: ${json.error.message}`);
  }

  return json.result;
}

// ──────────────────────────────────────────────────────────
// Clock cheatcodes
// ──────────────────────────────────────────────────────────

/**
 * Travel to an absolute Unix timestamp (in seconds).
 * Internally converts to milliseconds for the surfnet_timeTravel RPC.
 *
 * @param timestampSeconds - Target time in seconds (must be > current chain time)
 */
export async function timeTravelTo(timestampSeconds: bigint): Promise<void> {
  const timestampMs = Number(timestampSeconds) * 1000;
  await rpc("surfnet_timeTravel", [{ absoluteTimestamp: timestampMs }]);
}

/** Pause block production. */
export async function pauseClock(): Promise<void> {
  await rpc("surfnet_pauseClock", []);
}

/** Resume block production. */
export async function resumeClock(): Promise<void> {
  await rpc("surfnet_resumeClock", []);
}

/**
 * Read the current unix timestamp from the Solana Clock sysvar.
 * Returns seconds (bigint) matching the on-chain representation.
 */
export async function getClockTimestampSeconds(): Promise<bigint> {
  // Use standard Solana getSlot + getBlockTime approach
  const slot = (await rpc("getSlot", [])) as number;
  const blockTime = (await rpc("getBlockTime", [slot])) as number | null;

  if (blockTime === null) {
    throw new Error(
      "getClockTimestampSeconds: getBlockTime returned null — is Surfpool running?"
    );
  }

  return BigInt(blockTime);
}

// ──────────────────────────────────────────────────────────
// Account / balance cheatcodes
// ──────────────────────────────────────────────────────────

/**
 * Airdrop lamports to a wallet address using the surfnet_setAccount cheatcode.
 * Funds a plain system account with the given lamports.
 */
export async function airdropSol(
  address: string,
  lamports: bigint
): Promise<void> {
  try {
    await rpc("requestAirdrop", [address, Number(lamports)]);
  } catch {
    await rpc("surfnet_setAccount", [
      address,
      {
        lamports: Number(lamports),
        owner: "11111111111111111111111111111111",
        executable: false,
        data: "",
      },
    ]);
  }
}

/**
 * Set a token account's raw balance using the surfnet_setTokenAccount cheatcode.
 *
 * @param mintAddress - Mint address
 * @param ownerAddress - Token account owner address
 * @param rawAmount - Raw base units (bigint)
 */
export async function setTokenBalance(
  mintAddress: string,
  ownerAddress: string,
  rawAmount: bigint
): Promise<void> {
  await rpc("surfnet_setTokenAccount", [
    mintAddress,
    ownerAddress,
    { amount: Number(rawAmount) },
  ]);
}

// ──────────────────────────────────────────────────────────
// Health check
// ──────────────────────────────────────────────────────────

/**
 * Check whether Surfpool is reachable. Returns false instead of throwing.
 */
export async function isSurfpoolRunning(): Promise<boolean> {
  try {
    await rpc("getHealth", []);
    return true;
  } catch {
    return false;
  }
}

// ──────────────────────────────────────────────────────────
// On-chain Account Snapshot
// ──────────────────────────────────────────────────────────

import { createSolanaRpc, address } from "@solana/kit";
import { findAssociatedTokenPda, fetchToken, TOKEN_2022_PROGRAM_ADDRESS } from "@solana-program/token-2022";
import type { AccountSnapshot } from "@stockcheck/core";

/**
 * Read the current on-chain token balance for an owner & mint.
 * Returns an AccountSnapshot with slot and timestamp.
 */
export async function readAccountSnapshot(
  ownerAddress: string,
  mintAddress: string,
  rpcUrl = SURFPOOL_RPC_URL
): Promise<AccountSnapshot> {
  const rpcClient = createSolanaRpc(rpcUrl);
  let slot = 0n;
  let timestamp = BigInt(Math.floor(Date.now() / 1000));
  try {
    const slotNum = await rpcClient.getSlot().send();
    slot = BigInt(slotNum);
    const bt = await rpcClient.getBlockTime(slotNum).send();
    if (bt) timestamp = BigInt(bt);
  } catch {
    // Non-fatal if clock cannot be read
  }

  try {
    const [ata] = await findAssociatedTokenPda({
      mint: address(mintAddress),
      owner: address(ownerAddress),
      tokenProgram: TOKEN_2022_PROGRAM_ADDRESS,
    });
    const token = await fetchToken(rpcClient, ata);
    return {
      address: ata,
      rawBalance: token.data.amount,
      slot,
      timestamp,
    };
  } catch {
    return {
      address: ownerAddress,
      rawBalance: 0n,
      slot,
      timestamp,
    };
  }
}

/**
 * @stockcheck/runtime — Surfpool testnet cheatcodes
 *
 * Provides control over Solana clock, state mutations, and airdrops
 * for high-speed local integration testing.
 */

import { rpc } from "./rpc-client.js";

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
  const slot = await rpc<number>("getSlot", []);
  const blockTime = await rpc<number | null>("getBlockTime", [slot]);

  if (blockTime === null) {
    throw new Error(
      "getClockTimestampSeconds: getBlockTime returned null — is Surfpool running?"
    );
  }

  return BigInt(blockTime);
}

// ──────────────────────────────────────────────────────────
// Account & balance cheatcodes
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

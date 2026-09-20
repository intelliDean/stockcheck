/**
 * @stockcheck/runtime — On-chain Account Snapshot extraction
 *
 * Derives Associated Token Accounts and captures atomic balance snapshots
 * along with slot number and block time.
 */

import { createSolanaRpc, address } from "@solana/kit";
import { findAssociatedTokenPda, fetchToken, TOKEN_2022_PROGRAM_ADDRESS } from "@solana-program/token-2022";
import type { AccountSnapshot } from "@stockcheck/core";
import { DEFAULT_SURFPOOL_RPC_URL } from "./rpc-client.js";

/**
 * Read the current on-chain token balance for an owner & mint.
 * Returns an AccountSnapshot with slot and timestamp.
 *
 * @param ownerAddress - Base58 public key of wallet owner
 * @param mintAddress - Base58 public key of token mint
 * @param rpcUrl - RPC URL (defaults to Surfpool default)
 */
export async function readAccountSnapshot(
  ownerAddress: string,
  mintAddress: string,
  rpcUrl = DEFAULT_SURFPOOL_RPC_URL
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

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
  await rpc("surfnet_setAccount", [
    {
      address,
      lamports: Number(lamports),
      owner: "11111111111111111111111111111111", // System program
      executable: false,
      data: "base64:",
    },
  ]);
}

/**
 * Set a token account's raw balance using the surfnet_setTokenBalance cheatcode.
 *
 * @param tokenAccount - Token account address
 * @param rawAmount - Raw base units (bigint)
 */
export async function setTokenBalance(
  tokenAccount: string,
  rawAmount: bigint
): Promise<void> {
  await rpc("surfnet_setTokenBalance", [
    {
      account: tokenAccount,
      amount: rawAmount.toString(10), // decimal string — never Number
    },
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

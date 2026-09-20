# `@stockcheck/runtime`

The **Solana testnet runtime layer** for StockCheck — connects the test suite to a live [Surfpool](https://surfpool.dev) local validator and provides cheatcodes for deterministic on-chain state manipulation.

---

## Modules

| Module | Description |
|---|---|
| [`rpc-client.ts`](./src/rpc-client.ts) | Generic JSON-RPC transport with typed unwrapping and error handling |
| [`cheatcodes.ts`](./src/cheatcodes.ts) | Surfpool-specific state mutation: clock control, airdrops, token balance overrides |
| [`snapshots.ts`](./src/snapshots.ts) | `@solana/kit` ATA derivation and atomic on-chain balance capture |
| [`mint.ts`](./src/mint.ts) | `mintTokensTo` — helper to top up test token balances during fixture setup |

---

## Prerequisites

Surfpool must be running locally before any runtime calls are made:

```bash
surfpool start
```

Use `isSurfpoolRunning()` to check availability before gating tests:

```ts
import { isSurfpoolRunning } from "@stockcheck/runtime";

const alive = await isSurfpoolRunning(); // false → skip, not fail
```

---

## Cheatcodes

Surfpool exposes JSON-RPC cheatcodes that give the test suite surgical control over validator state. All cheatcodes are async and resolve when the state mutation is confirmed.

### Clock Control

```ts
import { timeTravelTo, pauseClock, resumeClock, getClockTimestampSeconds } from "@stockcheck/runtime";

// Jump the on-chain clock to a specific Unix timestamp (seconds)
await timeTravelTo(1_750_000_000n);

// Pause and resume block production
await pauseClock();
// ... set up state ...
await resumeClock();

// Read current on-chain time
const now: bigint = await getClockTimestampSeconds();
```

> **Why this matters:** Token-2022 `InterestBearingConfig` multiplier activation is timestamp-gated. `timeTravelTo` lets tests verify pre- and post-activation behavior without waiting.

### SOL Airdrops

```ts
import { airdropSol } from "@stockcheck/runtime";

await airdropSol(walletAddress, 10_000_000_000n); // 10 SOL in lamports
```

Falls back to `surfnet_setAccount` if the standard `requestAirdrop` RPC is unavailable.

### Token Balance Override

```ts
import { setTokenBalance } from "@stockcheck/runtime";

await setTokenBalance(mintAddress, ownerAddress, 3_456_789n); // raw base units
```

---

## Account Snapshots

`readAccountSnapshot` derives the Associated Token Account (ATA) for an owner/mint pair and returns an atomic `AccountSnapshot` with slot and timestamp — used to calculate `observedSenderDebit` and `observedRecipientCredit` in the evidence bundle.

```ts
import { readAccountSnapshot } from "@stockcheck/runtime";
import type { AccountSnapshot } from "@stockcheck/core";

const before: AccountSnapshot = await readAccountSnapshot(ownerAddress, mintAddress);
// ... trigger transfer ...
const after: AccountSnapshot = await readAccountSnapshot(ownerAddress, mintAddress);

const debit = before.rawBalance - after.rawBalance; // bigint
```

---

## RPC URL

All calls target `http://127.0.0.1:8899` by default (Surfpool default). Override per-call where needed:

```ts
import { readAccountSnapshot } from "@stockcheck/runtime";

const snapshot = await readAccountSnapshot(owner, mint, "http://localhost:8899");
```

# StockCheck

**An open-source regression-testing package for Solana stock-transfer interfaces.**

StockCheck runs browser E2E actions against a real local Solana environment and compares what the UI *shows* the user with what the application's transaction actually transferred — specifically across **ScaledUiAmount Token-2022 multiplier** changes.

> ⚠️ **This is development tooling.** All test events and balances are synthetic. StockCheck is not a mainnet safety certification.

---

## What it tests

When a Token-2022 mint uses the `ScaledUiAmount` extension, the displayed balance differs from the raw amount stored on-chain by a multiplier factor. Applications must handle this distinction correctly when:

- **Displaying** balances (use scaled/multiplied value)
- **Building transactions** (use the raw amount derived from the effective multiplier at evaluation time)
- **Handling Max** (use the full raw source account balance — never reconstruct from a rounded display)

StockCheck detects bugs in any of these three areas.

---

## Quick start

```bash
# 1. Install dependencies
pnpm install --frozen-lockfile

# 2. Install Playwright browser
pnpm exec playwright install --with-deps chromium

# 3. Start Surfpool local runtime
surfpool start

# 4. Create the synthetic test token
node scripts/create-mint.js

# 5. Run the demo
pnpm demo
```

---

## Commands

| Command | Description |
|---|---|
| `pnpm demo` | Start the reference app + run all scenarios + open report |
| `pnpm test:unit` | Run core quantity math unit tests |
| `pnpm test:e2e` | Run required E2E scenarios Q01–Q08 |
| `pnpm test:specimens` | Assert checker correctly detects seeded defects |
| `pnpm report` | Open the Playwright HTML report |

---

## Test scenarios

| ID | Scenario | Expected |
|---|---|---|
| Q01 | Multiplier=1; enter 2 scaled units | Transfer 2,000,000 raw |
| Q02 | Active multiplier=2; enter 2 scaled units | Transfer 1,000,000 raw |
| Q03 | Page open across scheduled 1→2 activation | Post-activation input consistent |
| Q04 | Max with fractional balance | Transfer full raw balance |
| Q05 | Unscaled input at multiplier=2 | Enter 2 unscaled → 2,000,000 raw |
| Q06 | Seeded old-multiplier defect | FAIL — DISPLAYED_QUANTITY_MISMATCH |
| Q07 | Seeded Max round-trip defect | FAIL — MAX_RESIDUAL_BALANCE |
| Q08 | Missing RPC / receipt | NOT_TESTED (not PASS) |

---

## Architecture

```
Playwright test + AppAdapter
         │
         ▼
Actual browser transfer interface (apps/reference)
         │
         ▼
Application's own transaction builder
         │
         ▼
Local test wallet: capture, sign, submit
         │
         ▼
Local Solana / Token-2022 execution (Surfpool)
         │
         ▼
Independent quantity checks (packages/core)
         │
         ▼
Verdict + evidence JSON + browser trace
```

**Key invariant:** The checker never decides which amount the application transfers. The application builds its transaction. StockCheck observes and checks it.

---

## Repository structure

```
stockcheck/
├── apps/reference/          # React + Vite transfer interface
├── packages/core/           # Independent checker engine
├── packages/playwright/     # AppAdapter interface + shared fixtures
├── packages/runtime/        # Surfpool wrapper + cheatcode helpers
├── packages/test-wallet/    # Disposable keypair + browser injection
├── adapters/reference/      # Adapter for apps/reference
├── fixtures/synthetic/      # Pinned synthetic mint config
├── tests/unit/              # Core math unit tests
├── tests/e2e/               # Required scenarios Q01–Q08
├── tests/specimens/         # Seeded defect tests (Q06, Q07)
└── .github/workflows/ci.yml # CI pipeline
```

---

## Reference app modes

The reference app implements three real behavior differences, selectable via `?mode=`:

| Mode | Behavior |
|---|---|
| `correct` | Uses effective multiplier; correct Max |
| `ignore-activation` | Retains old multiplier after activation (seeded defect Q06) |
| `max-roundtrip` | Derives Max from rounded displayed balance (seeded defect Q07) |

---

## Technology stack

| Component | Choice |
|---|---|
| Language | TypeScript |
| Reference interface | React + Vite |
| Browser testing | Playwright with Chromium |
| Local Solana runtime | `@solana/surfpool` |
| Transaction clients | Solana Kit + `@solana-program/token-2022` |
| Workspace | pnpm |
| Reports | Playwright HTML report + traces + attached JSON |

---

## Limitations

- Supports one explicitly selected source token account per transfer
- "Max" means that account's full raw token balance — not every account associated with the wallet
- Local test environment only; no mainnet support
- CI targets Linux x86-64
- Signing-before-activation / landing-after-activation edge case is outside declared coverage

---

## License

MIT — see [LICENSE](LICENSE)

See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for reused component disclosures.

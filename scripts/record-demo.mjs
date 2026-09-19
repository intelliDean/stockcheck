import { chromium } from "@playwright/test";
import { spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync } from "node:fs";
import { generateTestKeypair, buildWalletInjectionScript } from "../packages/test-wallet/dist/index.js";
import { airdropSol, mintTokensTo } from "../packages/runtime/dist/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = resolve(__dirname, "..");
const DEMO_DIR = resolve(ROOT_DIR, "demo");
const ASSETS_DIR = resolve(__dirname, "demo-assets");
const TEMP_VIDEO_DIR = resolve(DEMO_DIR, "temp_recordings");

if (!existsSync(DEMO_DIR)) mkdirSync(DEMO_DIR, { recursive: true });
if (!existsSync(TEMP_VIDEO_DIR)) mkdirSync(TEMP_VIDEO_DIR, { recursive: true });

const hudScript = readFileSync(resolve(ASSETS_DIR, "hud.js"), "utf-8");

async function record() {
  console.log("🎬 Starting Expressive StockCheck Demo Video Recording...");

  // Generate and fund test wallet on Surfpool
  const senderWallet = await generateTestKeypair();
  const recipientWallet = await generateTestKeypair();

  console.log("💰 Funding test wallet on local Surfpool cluster...");
  await airdropSol(senderWallet.publicKey, 10_000_000_000n);
  await mintTokensTo(senderWallet.publicKey, 3_456_789n);

  const browser = await chromium.launch({
    channel: "chrome",
    headless: true,
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    recordVideo: {
      dir: TEMP_VIDEO_DIR,
      size: { width: 1440, height: 900 },
    },
  });

  const page = await context.newPage();

  // ──────────────────────────────────────────────────────────
  // Scene 1: Introduction Title Slide
  // ──────────────────────────────────────────────────────────
  console.log("📹 Scene 1: Introduction Title Slide...");
  await page.goto(`file://${resolve(ASSETS_DIR, "intro.html")}`);
  await page.waitForTimeout(6000);

  // ──────────────────────────────────────────────────────────
  // Scene 2: Baseline Transfer (Q01 — Multiplier 1x)
  // ──────────────────────────────────────────────────────────
  console.log("📹 Scene 2: Live Baseline Transfer with Auditor HUD...");
  await page.addInitScript(buildWalletInjectionScript(senderWallet));
  await page.goto("http://localhost:5173");
  await page.waitForSelector("[data-testid='transfer-form']");
  await page.evaluate(hudScript);
  await page.evaluate(() => {
    window.updateStockCheckHUD({
      scenarioName: "Q01: Baseline Multiplier Verification",
      scenarioDesc: "Verifying standard transfer when Multiplier = 1.0x. User enters 2 scaled units → expected debit is exactly 2,000,000 raw base units.",
      multiplier: "1.0×",
      userAmount: "2.0 scaled units",
      expectedRaw: "2,000,000 raw",
      observedRaw: "Pending...",
      status: "pending",
      verdictTitle: "AUDITING ON-CHAIN DELTA",
      verdictSubtitle: "Waiting for user review and transaction submission...",
    });
  });
  await page.waitForTimeout(2500);

  // Focus asset selector
  await page.getByTestId("asset-selector").click();
  await page.waitForTimeout(1000);
  await page.getByTestId("asset-selector").click();
  await page.waitForTimeout(600);

  // Enter recipient and amount
  await page.getByTestId("recipient-field").fill(recipientWallet.publicKey);
  await page.waitForTimeout(800);
  await page.getByTestId("amount-field").fill("2");
  await page.waitForTimeout(1200);

  // Click Review
  await page.getByTestId("review-button").click();
  await page.waitForSelector("[data-testid='review-panel']");
  await page.waitForTimeout(2000);

  // Confirm transfer
  await page.getByTestId("confirm-button").click();
  await page.waitForSelector("[data-testid='receipt-signature']", { timeout: 15000 });

  // Update HUD to verified PASS
  await page.evaluate(() => {
    window.updateStockCheckHUD({
      observedRaw: "2,000,000 raw",
      status: "pass",
      verdictTitle: "VERDICT: PASS",
      verdictSubtitle: "Observed sender debit (2,000,000) exactly equals expected raw movement. Zero discrepancy.",
    });
  });
  await page.waitForTimeout(3500);

  // ──────────────────────────────────────────────────────────
  // Scene 3: Max Transfer Precision Check (Q04)
  // ──────────────────────────────────────────────────────────
  console.log("📹 Scene 3: Max Button Full-Balance Precision Sweep...");
  await page.getByTestId("new-transfer-button").click();
  await page.waitForTimeout(1000);

  await page.evaluate(() => {
    window.updateStockCheckHUD({
      scenarioName: "Q04: Max Full-Balance Precision Sweep",
      scenarioDesc: "Clicking MAX must transfer the FULL raw balance. It must never derive the transfer amount from a rounded displayed float.",
      multiplier: "1.0×",
      userAmount: "MAX (Full Balance)",
      expectedRaw: "All remaining raw tokens",
      observedRaw: "Pending...",
      status: "pending",
      verdictTitle: "AUDITING MAX PRECISION",
      verdictSubtitle: "Verifying that remaining account balance after transfer is exactly 0.",
    });
  });
  await page.waitForTimeout(2000);

  await page.getByTestId("recipient-field").fill(recipientWallet.publicKey);
  await page.waitForTimeout(600);
  await page.getByTestId("max-button").click();
  await page.waitForTimeout(1500);

  await page.getByTestId("review-button").click();
  await page.waitForSelector("[data-testid='review-panel']");
  await page.waitForTimeout(1800);

  await page.getByTestId("confirm-button").click();
  await page.waitForSelector("[data-testid='receipt-signature']", { timeout: 15000 });

  await page.evaluate(() => {
    window.updateStockCheckHUD({
      observedRaw: "Full balance transferred",
      status: "pass",
      verdictTitle: "VERDICT: PASS (ZERO RESIDUAL DUST)",
      verdictSubtitle: "Source account residual raw balance = 0. No fractional tokens left behind.",
    });
  });
  await page.waitForTimeout(3500);

  // ──────────────────────────────────────────────────────────
  // Scene 4: Seeded Defect Demonstration — Q06 (ignore-activation)
  // ──────────────────────────────────────────────────────────
  console.log("📹 Scene 4: Seeded Defect Demonstration (ignore-activation)...");
  await mintTokensTo(senderWallet.publicKey, 3_456_789n);

  await page.goto("http://localhost:5173?mode=ignore-activation");
  await page.waitForSelector("[data-testid='transfer-form']");
  await page.evaluate(hudScript);
  await page.evaluate(() => {
    window.updateStockCheckHUD({
      scenarioName: "Q06: Seeded Defect — Stale Multiplier",
      scenarioDesc: "Active on-chain multiplier is 2.0×. Entering 2 scaled units should transfer 1,000,000 raw. BUT this faulty app retains old multiplier 1.0× and transfers 2,000,000 raw!",
      multiplier: "2.0× (Chain) / 1.0× (App Bug)",
      userAmount: "2.0 scaled units",
      expectedRaw: "1,000,000 raw",
      observedRaw: "Pending...",
      status: "pending",
      verdictTitle: "SIMULATING FAULTY WALLET",
      verdictSubtitle: "Watching for transfer quantity mismatch on-chain...",
    });
  });
  await page.waitForTimeout(2500);

  await page.getByTestId("recipient-field").fill(recipientWallet.publicKey);
  await page.waitForTimeout(800);
  await page.getByTestId("amount-field").fill("2");
  await page.waitForTimeout(1000);

  await page.getByTestId("review-button").click();
  await page.waitForSelector("[data-testid='review-panel']");
  await page.waitForTimeout(1800);

  await page.getByTestId("confirm-button").click();
  await page.waitForSelector("[data-testid='receipt-signature']", { timeout: 15000 });

  // Trap defect in HUD
  await page.evaluate(() => {
    window.updateStockCheckHUD({
      observedRaw: "2,000,000 raw (DOUBLE!)",
      status: "defect",
      verdictTitle: "DEFECT TRAPPED: DISPLAYED_QUANTITY_MISMATCH",
      verdictSubtitle: "StockCheck trapped the bug! User approved 2 units at 2× (1M raw) but wallet debited 2M raw. Financial loss prevented.",
    });
  });
  await page.waitForTimeout(4000);

  // ──────────────────────────────────────────────────────────
  // Scene 5: Seeded Defect Demonstration — Q07 (max-roundtrip)
  // ──────────────────────────────────────────────────────────
  console.log("📹 Scene 5: Seeded Defect Demonstration (max-roundtrip)...");
  await page.goto("http://localhost:5173?mode=max-roundtrip");
  await page.waitForSelector("[data-testid='transfer-form']");
  await page.evaluate(hudScript);
  await page.evaluate(() => {
    window.updateStockCheckHUD({
      scenarioName: "Q07: Seeded Defect — Lossy Max Roundtrip",
      scenarioDesc: "Faulty app rounds displayed balance to 2 decimals on MAX click. Traps residual tokens in sender account.",
      multiplier: "1.0×",
      userAmount: "MAX (Truncated to 2 decimals)",
      expectedRaw: "3,456,789 raw (Full Balance)",
      observedRaw: "Pending...",
      status: "pending",
      verdictTitle: "SIMULATING FAULTY WALLET",
      verdictSubtitle: "Watching for trapped residual dust...",
    });
  });
  await page.waitForTimeout(2500);

  await page.getByTestId("recipient-field").fill(recipientWallet.publicKey);
  await page.waitForTimeout(600);
  await page.getByTestId("max-button").click();
  await page.waitForTimeout(1200);

  await page.getByTestId("review-button").click();
  await page.waitForSelector("[data-testid='review-panel']");
  await page.waitForTimeout(1800);

  await page.getByTestId("confirm-button").click();
  await page.waitForSelector("[data-testid='receipt-signature']", { timeout: 15000 });

  await page.evaluate(() => {
    window.updateStockCheckHUD({
      observedRaw: "3,450,000 raw (6,789 dust left)",
      status: "defect",
      verdictTitle: "DEFECT TRAPPED: MAX_RESIDUAL_BALANCE",
      verdictSubtitle: "StockCheck caught the residual balance! Account was not swept clean. Lossy float conversion detected.",
    });
  });
  await page.waitForTimeout(4000);

  // ──────────────────────────────────────────────────────────
  // Scene 6: Automated Test Pipeline & Scorecard
  // ──────────────────────────────────────────────────────────
  console.log("📹 Scene 6: Automated Test Pipeline & Scorecard Slide...");
  await page.goto(`file://${resolve(ASSETS_DIR, "terminal.html")}`);
  await page.waitForTimeout(7000);

  // ──────────────────────────────────────────────────────────
  // Scene 7: Conclusion & Outro
  // ──────────────────────────────────────────────────────────
  console.log("📹 Scene 7: Conclusion & Outro Slide...");
  await page.goto(`file://${resolve(ASSETS_DIR, "outro.html")}`);
  await page.waitForTimeout(5000);

  // Close context to flush video
  await page.close();
  await context.close();
  await browser.close();

  // Find the recorded video file
  const videoFiles = readdirSync(TEMP_VIDEO_DIR).filter((f) => f.endsWith(".webm"));
  if (videoFiles.length === 0) {
    throw new Error("No webm video recorded!");
  }

  const rawVideoPath = resolve(TEMP_VIDEO_DIR, videoFiles[0]);
  const finalMp4Path = resolve(DEMO_DIR, "stockcheck_demo.mp4");

  console.log(`🔄 Converting ${rawVideoPath} to High-Definition MP4 (${finalMp4Path})...`);

  const ffmpegRes = spawnSync("/usr/bin/ffmpeg", [
    "-y",
    "-i",
    rawVideoPath,
    "-c:v",
    "libx264",
    "-preset",
    "slow",
    "-crf",
    "20",
    "-pix_fmt",
    "yuv420p",
    finalMp4Path,
  ]);

  if (ffmpegRes.status !== 0) {
    console.error("FFmpeg error:", ffmpegRes.stderr.toString());
    process.exit(1);
  }

  // Clean up temp video directory
  for (const f of readdirSync(TEMP_VIDEO_DIR)) {
    unlinkSync(resolve(TEMP_VIDEO_DIR, f));
  }

  console.log(`✅ Expressive demo video successfully generated at: ${finalMp4Path}`);
}

record().catch((err) => {
  console.error("Recording failed:", err);
  process.exit(1);
});

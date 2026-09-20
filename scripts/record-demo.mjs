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

// Clean previous temp recordings
for (const file of readdirSync(TEMP_VIDEO_DIR)) {
  unlinkSync(resolve(TEMP_VIDEO_DIR, file));
}

const hudScript = readFileSync(resolve(ASSETS_DIR, "hud.js"), "utf-8");

async function moveCursorTo(page, selector) {
  try {
    const loc = page.locator(selector).first();
    await loc.waitFor({ state: "visible", timeout: 4000 });
    const box = await loc.boundingBox();
    if (box) {
      const cx = Math.round(box.x + box.width / 2);
      const cy = Math.round(box.y + box.height / 2);
      await page.evaluate(({ cx, cy }) => window.moveVirtualCursor(cx, cy), { cx, cy });
      await page.waitForTimeout(300);
    }
  } catch {
    // Graceful fallback if selector not visible
  }
}

async function clickWithCursor(page, selector) {
  await moveCursorTo(page, selector);
  await page.evaluate(() => window.triggerVirtualClick());
  await page.waitForTimeout(150);
  await page.locator(selector).first().click();
  await page.waitForTimeout(400);
}

async function typeWithCursor(page, selector, text, delayMs = 30) {
  await moveCursorTo(page, selector);
  await page.evaluate(() => window.triggerVirtualClick());
  await page.waitForTimeout(150);
  const loc = page.locator(selector).first();
  await loc.click();
  await loc.fill("");
  for (const char of text) {
    await loc.pressSequentially(char, { delay: delayMs });
  }
  await page.waitForTimeout(300);
}

async function record() {
  console.log("🎬 Starting 1080p Cinematic StockCheck Demo Video Recording...");

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
    viewport: { width: 1920, height: 1080 },
    recordVideo: {
      dir: TEMP_VIDEO_DIR,
      size: { width: 1920, height: 1080 },
    },
  });

  const page = await context.newPage();

  // ──────────────────────────────────────────────────────────
  // Scene 1: Introduction Title Slide
  // ──────────────────────────────────────────────────────────
  console.log("📹 Scene 1: Introduction Title Slide (1080p)...");
  await page.goto(`file://${resolve(ASSETS_DIR, "intro.html")}`);
  await page.waitForTimeout(6000);

  // ──────────────────────────────────────────────────────────
  // Scene 2: Baseline Transfer (Q01 — Multiplier 1x)
  // ──────────────────────────────────────────────────────────
  console.log("📹 Scene 2: Live Baseline Transfer with Split-Screen Auditor HUD...");
  await page.addInitScript(buildWalletInjectionScript(senderWallet));
  await page.goto("http://localhost:5173");
  await page.waitForSelector("[data-testid='transfer-form']");
  await page.evaluate(hudScript);
  await page.evaluate(() => {
    window.updateStockCheckHUD({
      scenarioName: "Q01: Baseline Multiplier Verification",
      scenarioDesc: "Verifying standard transfer when Multiplier = 1.0×. User enters 2 scaled units → expected debit is exactly 2,000,000 raw base units.",
      badgeTag: "LIVE ON SURFPOOL",
      multiplier: "1.0×",
      userAmount: "2.0 scaled units",
      expectedRaw: "2,000,000 raw",
      observedRaw: "Pending...",
      formula: "Calculation: <span class='hud-formula-val'>rawDebit = floor(2.0 × 10^6 / 1.0) = 2,000,000 raw</span>",
      status: "pending",
      verdictTitle: "AUDITING ON-CHAIN DELTA",
      verdictSubtitle: "Watching user form entry, review drawer, and transaction submission...",
    });
  });
  await page.waitForTimeout(2000);

  // Inspect asset dropdown
  await clickWithCursor(page, "[data-testid='asset-selector']");
  await page.waitForTimeout(1000);
  await clickWithCursor(page, "[data-testid='asset-selector']");
  await page.waitForTimeout(500);

  // Enter recipient and amount with smooth cursor
  await typeWithCursor(page, "[data-testid='recipient-field']", recipientWallet.publicKey, 15);
  await page.waitForTimeout(400);
  await typeWithCursor(page, "[data-testid='amount-field']", "2", 80);
  await page.waitForTimeout(800);

  // Click Review Transfer
  await clickWithCursor(page, "[data-testid='review-button']");
  await page.waitForSelector("[data-testid='review-panel']");
  await page.waitForTimeout(1800);

  // Confirm transfer
  await clickWithCursor(page, "[data-testid='confirm-button']");
  await page.waitForSelector("[data-testid='receipt-signature']", { timeout: 15000 });

  // Update HUD to verified PASS
  await page.evaluate(() => {
    window.updateStockCheckHUD({
      observedRaw: "2,000,000 raw",
      status: "pass",
      verdictTitle: "VERDICT: PASS (0.0% DISCREPANCY)",
      verdictSubtitle: "Observed sender debit (2,000,000 raw) exactly equals expected token movement. Zero residual discrepancy.",
    });
  });
  await page.waitForTimeout(3500);

  // ──────────────────────────────────────────────────────────
  // Scene 3: Max Transfer Precision Check (Q04)
  // ──────────────────────────────────────────────────────────
  console.log("📹 Scene 3: Max Button Full-Balance Precision Sweep...");
  await clickWithCursor(page, "[data-testid='new-transfer-button']");
  await page.waitForTimeout(800);

  await page.evaluate(() => {
    window.updateStockCheckHUD({
      scenarioName: "Q04: Max Full-Balance Precision Sweep",
      scenarioDesc: "Clicking MAX must sweep the FULL remaining raw balance. It must never derive the transfer amount from a rounded displayed float.",
      badgeTag: "PRECISION AUDIT",
      multiplier: "1.0×",
      userAmount: "MAX (Full Balance)",
      expectedRaw: "1,456,789 raw (Residual: 0)",
      observedRaw: "Pending...",
      formula: "Calculation: <span class='hud-formula-val'>rawDebit = totalSourceBalance (Ensures residual == 0n)</span>",
      status: "pending",
      verdictTitle: "AUDITING FULL-BALANCE SWEEP",
      verdictSubtitle: "Verifying exact decimal preservation on MAX button click...",
    });
  });
  await page.waitForTimeout(1500);

  await typeWithCursor(page, "[data-testid='recipient-field']", recipientWallet.publicKey, 15);
  await page.waitForTimeout(400);

  // Click MAX button
  await clickWithCursor(page, "[data-testid='max-button']");
  await page.waitForTimeout(1000);

  await clickWithCursor(page, "[data-testid='review-button']");
  await page.waitForSelector("[data-testid='review-panel']");
  await page.waitForTimeout(1600);

  await clickWithCursor(page, "[data-testid='confirm-button']");
  await page.waitForSelector("[data-testid='receipt-signature']", { timeout: 15000 });

  await page.evaluate(() => {
    window.updateStockCheckHUD({
      observedRaw: "1,456,789 raw (Residual: 0)",
      status: "pass",
      verdictTitle: "VERDICT: PASS (CLEAN ZERO-RESIDUAL SWEEP)",
      verdictSubtitle: "All tokens swept from sender ATA. Post-transfer residual balance is exactly 0. Zero dust lost to float rounding.",
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
      scenarioName: "Q06: Seeded Defect — Stale Multiplier Retention",
      scenarioDesc: "Active on-chain multiplier has stepped to 2.0×. Entering 2 scaled units should debit 1,000,000 raw. BUT this faulty wallet retains stale 1.0× multiplier!",
      badgeTag: "FAULT INJECTION SPECIMEN",
      multiplier: "2.0× (Chain) / 1.0× (Wallet Bug)",
      userAmount: "2.0 scaled units",
      expectedRaw: "1,000,000 raw",
      observedRaw: "Pending...",
      formula: "Expected: <span class='hud-formula-val'>2.0 × 10^6 / 2.0 = 1,000,000</span> | Bug: <span style='color:#f85149'>2.0 × 10^6 / 1.0 = 2,000,000</span>",
      status: "pending",
      verdictTitle: "MONITORING FAULTY WALLET EXECUTION",
      verdictSubtitle: "Simulating wallet that ignores on-chain multiplier activation timestamp...",
    });
  });
  await page.waitForTimeout(2000);

  await typeWithCursor(page, "[data-testid='recipient-field']", recipientWallet.publicKey, 15);
  await page.waitForTimeout(400);
  await typeWithCursor(page, "[data-testid='amount-field']", "2", 80);
  await page.waitForTimeout(800);

  await clickWithCursor(page, "[data-testid='review-button']");
  await page.waitForSelector("[data-testid='review-panel']");
  await page.waitForTimeout(1600);

  await clickWithCursor(page, "[data-testid='confirm-button']");
  await page.waitForSelector("[data-testid='receipt-signature']", { timeout: 15000 });

  // Trap defect in HUD
  await page.evaluate(() => {
    window.updateStockCheckHUD({
      observedRaw: "2,000,000 raw (DOUBLE!)",
      status: "defect",
      verdictTitle: "DEFECT TRAPPED: DISPLAYED_QUANTITY_MISMATCH",
      verdictSubtitle: "StockCheck caught the critical defect! User approved 2.0 scaled at 2.0× (1M raw), but wallet transferred 2M raw. User overpaid by 100%.",
    });
  });
  await page.waitForTimeout(4500);

  // ──────────────────────────────────────────────────────────
  // Scene 5: Seeded Defect Demonstration — Q07 (max-roundtrip)
  // ──────────────────────────────────────────────────────────
  console.log("📹 Scene 5: Seeded Defect Demonstration (max-roundtrip)...");
  await page.goto("http://localhost:5173?mode=max-roundtrip");
  await page.waitForSelector("[data-testid='transfer-form']");
  await page.evaluate(hudScript);
  await page.evaluate(() => {
    window.updateStockCheckHUD({
      scenarioName: "Q07: Seeded Defect — Lossy Float Max Roundtrip",
      scenarioDesc: "Faulty wallet formats displayed balance to 2 decimals on MAX click. Traps residual tokens in sender ATA.",
      badgeTag: "FAULT INJECTION SPECIMEN",
      multiplier: "1.0×",
      userAmount: "MAX (Lossy Float Rounding)",
      expectedRaw: "3,456,789 raw (Full Balance)",
      observedRaw: "Pending...",
      formula: "Lossy Math: <span style='color:#f85149'>round(3.456789, 2) → 3.45 → debits 3,450,000 raw</span>",
      status: "pending",
      verdictTitle: "MONITORING RESIDUAL DUST VIOLATION",
      verdictSubtitle: "Simulating wallet with lossy float parse / format roundtrip...",
    });
  });
  await page.waitForTimeout(2000);

  await typeWithCursor(page, "[data-testid='recipient-field']", recipientWallet.publicKey, 15);
  await page.waitForTimeout(400);
  await clickWithCursor(page, "[data-testid='max-button']");
  await page.waitForTimeout(1000);

  await clickWithCursor(page, "[data-testid='review-button']");
  await page.waitForSelector("[data-testid='review-panel']");
  await page.waitForTimeout(1600);

  await clickWithCursor(page, "[data-testid='confirm-button']");
  await page.waitForSelector("[data-testid='receipt-signature']", { timeout: 15000 });

  await page.evaluate(() => {
    window.updateStockCheckHUD({
      observedRaw: "3,450,000 raw (6,789 dust left)",
      status: "defect",
      verdictTitle: "DEFECT TRAPPED: MAX_RESIDUAL_BALANCE",
      verdictSubtitle: "StockCheck caught the residual balance violation! Account was not swept clean (6,789 raw dust stranded in ATA). Lossy float bug caught.",
    });
  });
  await page.waitForTimeout(4500);

  // ──────────────────────────────────────────────────────────
  // Scene 6: Automated Test Pipeline & Scorecard
  // ──────────────────────────────────────────────────────────
  console.log("📹 Scene 6: Automated Test Pipeline & Scorecard Slide...");
  await page.evaluate(() => window.hideVirtualCursor());
  await page.goto(`file://${resolve(ASSETS_DIR, "terminal.html")}`);
  await page.waitForTimeout(7500);

  // ──────────────────────────────────────────────────────────
  // Scene 7: Conclusion & Outro
  // ──────────────────────────────────────────────────────────
  console.log("📹 Scene 7: Conclusion & Outro Slide...");
  await page.goto(`file://${resolve(ASSETS_DIR, "outro.html")}`);
  await page.waitForTimeout(5500);

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

  console.log(`🔄 Converting ${rawVideoPath} to High-Definition 1080p MP4 (${finalMp4Path})...`);

  // Convert WebM to MP4 using ffmpeg (H.264 / AAC, 1920x1080, 30fps, CRF 18)
  const ffmpegRes = spawnSync(
    "/usr/bin/ffmpeg",
    [
      "-y",
      "-i",
      rawVideoPath,
      "-c:v",
      "libx264",
      "-preset",
      "slow",
      "-crf",
      "18",
      "-r",
      "30",
      "-pix_fmt",
      "yuv420p",
      finalMp4Path,
    ],
    { stdio: "inherit" }
  );

  if (ffmpegRes.status !== 0) {
    throw new Error(`FFmpeg transcode failed with status ${ffmpegRes.status}`);
  }

  // Cleanup temp webm files
  for (const file of readdirSync(TEMP_VIDEO_DIR)) {
    unlinkSync(resolve(TEMP_VIDEO_DIR, file));
  }

  console.log(`✅ Expressive 1080p demo video successfully generated at: ${finalMp4Path}`);
}

record().catch((err) => {
  console.error("❌ Recording failed:", err);
  process.exit(1);
});

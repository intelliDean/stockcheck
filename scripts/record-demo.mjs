import { chromium } from "@playwright/test";
import { spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, mkdirSync, readdirSync, renameSync, unlinkSync } from "node:fs";
import { generateTestKeypair, buildWalletInjectionScript } from "../packages/test-wallet/dist/index.js";
import { airdropSol, mintTokensTo, timeTravelTo, getClockTimestampSeconds } from "../packages/runtime/dist/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = resolve(__dirname, "..");
const DEMO_DIR = resolve(ROOT_DIR, "demo");
const TEMP_VIDEO_DIR = resolve(DEMO_DIR, "temp_recordings");

if (!existsSync(DEMO_DIR)) mkdirSync(DEMO_DIR, { recursive: true });
if (!existsSync(TEMP_VIDEO_DIR)) mkdirSync(TEMP_VIDEO_DIR, { recursive: true });

async function record() {
  console.log("🎬 Starting StockCheck Demo Video Recording...");

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
    viewport: { width: 1280, height: 800 },
    recordVideo: {
      dir: TEMP_VIDEO_DIR,
      size: { width: 1280, height: 800 },
    },
  });

  const page = await context.newPage();

  // Inject wallet
  await page.addInitScript(buildWalletInjectionScript(senderWallet));

  console.log("📹 Scene 1: Baseline Transfer (Multiplier 1)...");
  await page.goto("http://localhost:5173");
  await page.waitForSelector("[data-testid='transfer-form']");
  await page.waitForTimeout(1500);

  // Focus and select token
  await page.getByTestId("asset-selector").click();
  await page.waitForTimeout(1000);
  await page.getByTestId("asset-selector").click();
  await page.waitForTimeout(800);

  // Fill recipient
  await page.getByTestId("recipient-field").fill(recipientWallet.publicKey);
  await page.waitForTimeout(1000);

  // Enter amount: 2 scaled units
  await page.getByTestId("amount-field").fill("2");
  await page.waitForTimeout(1200);

  // Click Review
  await page.getByTestId("review-button").click();
  await page.waitForSelector("[data-testid='review-panel']");
  await page.waitForTimeout(2000);

  // Confirm transfer
  await page.getByTestId("confirm-button").click();
  await page.waitForSelector("[data-testid='receipt-signature']", { timeout: 15000 });
  await page.waitForTimeout(2500);

  console.log("📹 Scene 2: Max Button Precision Check...");
  // Return to transfer form
  await page.getByTestId("new-transfer-button").click();
  await page.waitForTimeout(1200);

  // Enter recipient
  await page.getByTestId("recipient-field").fill(recipientWallet.publicKey);
  await page.waitForTimeout(800);

  // Click MAX button
  await page.getByTestId("max-button").click();
  await page.waitForTimeout(1500);

  // Review Max transfer
  await page.getByTestId("review-button").click();
  await page.waitForSelector("[data-testid='review-panel']");
  await page.waitForTimeout(2000);

  // Confirm Max transfer
  await page.getByTestId("confirm-button").click();
  await page.waitForSelector("[data-testid='receipt-signature']", { timeout: 15000 });
  await page.waitForTimeout(2500);

  console.log("📹 Scene 3: Seeded Defect Demonstration (ignore-activation)...");
  // Refill sender wallet for defect demo
  await mintTokensTo(senderWallet.publicKey, 3_456_789n);

  // Navigate to faulty mode
  await page.goto("http://localhost:5173?mode=ignore-activation");
  await page.waitForSelector("[data-testid='transfer-form']");
  await page.waitForTimeout(1500);

  await page.getByTestId("recipient-field").fill(recipientWallet.publicKey);
  await page.waitForTimeout(800);
  await page.getByTestId("amount-field").fill("2");
  await page.waitForTimeout(1000);

  await page.getByTestId("review-button").click();
  await page.waitForSelector("[data-testid='review-panel']");
  await page.waitForTimeout(2000);

  await page.getByTestId("confirm-button").click();
  await page.waitForSelector("[data-testid='receipt-signature']", { timeout: 15000 });
  await page.waitForTimeout(2500);

  console.log("📹 Scene 4: Seeded Defect Demonstration (max-roundtrip)...");
  await page.goto("http://localhost:5173?mode=max-roundtrip");
  await page.waitForSelector("[data-testid='transfer-form']");
  await page.waitForTimeout(1500);

  await page.getByTestId("recipient-field").fill(recipientWallet.publicKey);
  await page.waitForTimeout(800);
  await page.getByTestId("max-button").click();
  await page.waitForTimeout(1200);

  await page.getByTestId("review-button").click();
  await page.waitForSelector("[data-testid='review-panel']");
  await page.waitForTimeout(2000);

  await page.getByTestId("confirm-button").click();
  await page.waitForSelector("[data-testid='receipt-signature']", { timeout: 15000 });
  await page.waitForTimeout(3000);

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

  console.log(`🔄 Converting ${rawVideoPath} to MP4 (${finalMp4Path})...`);

  const ffmpegRes = spawnSync("/usr/bin/ffmpeg", [
    "-y",
    "-i",
    rawVideoPath,
    "-c:v",
    "libx264",
    "-preset",
    "medium",
    "-crf",
    "22",
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

  console.log(`✅ Demo video successfully generated at: ${finalMp4Path}`);
}

record().catch((err) => {
  console.error("Recording failed:", err);
  process.exit(1);
});

/**
 * Injected HUD for StockCheck Demo Recording
 * Creates a split-screen layout with an interactive live auditor panel
 */

window.initStockCheckHUD = function () {
  if (document.getElementById("stockcheck-hud")) return;

  // Add styles
  const style = document.createElement("style");
  style.innerHTML = `
    body {
      display: flex !important;
      margin: 0 !important;
      padding: 0 !important;
      width: 1440px !important;
      height: 900px !important;
      background: #0b0e14 !important;
      overflow: hidden !important;
    }
    #root {
      width: 58% !important;
      height: 100vh !important;
      overflow-y: auto !important;
      padding: 30px !important;
      box-sizing: border-box !important;
      border-right: 1px solid rgba(255, 255, 255, 0.1) !important;
    }
    #stockcheck-hud {
      width: 42% !important;
      height: 100vh !important;
      background: #0f141c !important;
      padding: 32px !important;
      color: #f0f6fc !important;
      font-family: 'Inter', system-ui, sans-serif !important;
      display: flex !important;
      flex-direction: column !important;
      gap: 20px !important;
      box-sizing: border-box !important;
      overflow-y: auto !important;
    }
    .hud-header {
      display: flex;
      align-items: center;
      gap: 10px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
      padding-bottom: 16px;
    }
    .hud-tag {
      background: rgba(20, 241, 149, 0.15);
      border: 1px solid rgba(20, 241, 149, 0.4);
      color: #14f195;
      font-size: 11px;
      font-weight: 700;
      padding: 4px 10px;
      border-radius: 9999px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .hud-title {
      font-size: 18px;
      font-weight: 700;
      color: #ffffff;
    }
    .hud-card {
      background: rgba(22, 27, 34, 0.8);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 12px;
      padding: 16px;
      box-shadow: 0 4px 16px rgba(0,0,0,0.3);
    }
    .hud-card-label {
      font-size: 11px;
      font-weight: 700;
      color: #8b949e;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 8px;
    }
    .hud-scenario-name {
      font-size: 16px;
      font-weight: 700;
      color: #58a6ff;
      margin-bottom: 6px;
    }
    .hud-scenario-desc {
      font-size: 13px;
      color: #94a3b8;
      line-height: 1.5;
    }
    .hud-math-row {
      display: flex;
      justify-content: space-between;
      font-family: 'JetBrains Mono', monospace;
      font-size: 13px;
      padding: 6px 0;
      border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    }
    .hud-math-row:last-child {
      border-bottom: none;
    }
    .hud-math-val {
      font-weight: 700;
      color: #f0f6fc;
    }
    .hud-verdict-box {
      border-radius: 12px;
      padding: 18px;
      text-align: center;
      transition: all 0.3s ease;
    }
    .verdict-pending {
      background: rgba(88, 166, 255, 0.1);
      border: 1px solid rgba(88, 166, 255, 0.3);
      color: #58a6ff;
    }
    .verdict-pass {
      background: rgba(20, 241, 149, 0.15);
      border: 1px solid rgba(20, 241, 149, 0.4);
      color: #14f195;
    }
    .verdict-defect {
      background: rgba(248, 81, 73, 0.15);
      border: 1px solid rgba(248, 81, 73, 0.5);
      color: #f85149;
    }
    .verdict-title {
      font-size: 16px;
      font-weight: 800;
      margin-bottom: 4px;
      letter-spacing: 0.5px;
    }
    .verdict-subtitle {
      font-size: 12px;
      opacity: 0.9;
      line-height: 1.4;
    }
  `;
  document.head.appendChild(style);

  // Add HUD container
  const hud = document.createElement("div");
  hud.id = "stockcheck-hud";
  hud.innerHTML = `
    <div class="hud-header">
      <span class="hud-tag">Live Auditor</span>
      <div class="hud-title">StockCheck Engine</div>
    </div>

    <div class="hud-card">
      <div class="hud-card-label">Active Test Scenario</div>
      <div class="hud-scenario-name" id="hud-scenario-name">Initializing...</div>
      <div class="hud-scenario-desc" id="hud-scenario-desc">Preparing test suite...</div>
    </div>

    <div class="hud-card">
      <div class="hud-card-label">Mathematical Verification</div>
      <div class="hud-math-row">
        <span>Mint Multiplier:</span>
        <span class="hud-math-val" id="hud-multiplier">1.0×</span>
      </div>
      <div class="hud-math-row">
        <span>User Approved:</span>
        <span class="hud-math-val" id="hud-user-amount">--</span>
      </div>
      <div class="hud-math-row">
        <span>Expected Raw Debit:</span>
        <span class="hud-math-val" id="hud-expected-raw">--</span>
      </div>
      <div class="hud-math-row">
        <span>Observed Chain Debit:</span>
        <span class="hud-math-val" id="hud-observed-raw">--</span>
      </div>
    </div>

    <div id="hud-verdict" class="hud-verdict-box verdict-pending">
      <div class="verdict-title" id="hud-verdict-title">STANDBY</div>
      <div class="verdict-subtitle" id="hud-verdict-subtitle">Awaiting transaction execution on Surfpool...</div>
    </div>
  `;
  document.body.appendChild(hud);
};

window.updateStockCheckHUD = function ({
  scenarioName,
  scenarioDesc,
  multiplier,
  userAmount,
  expectedRaw,
  observedRaw,
  status, // 'pending' | 'pass' | 'defect'
  verdictTitle,
  verdictSubtitle,
}) {
  window.initStockCheckHUD();
  if (scenarioName) document.getElementById("hud-scenario-name").innerText = scenarioName;
  if (scenarioDesc) document.getElementById("hud-scenario-desc").innerText = scenarioDesc;
  if (multiplier) document.getElementById("hud-multiplier").innerText = multiplier;
  if (userAmount) document.getElementById("hud-user-amount").innerText = userAmount;
  if (expectedRaw) document.getElementById("hud-expected-raw").innerText = expectedRaw;
  if (observedRaw) document.getElementById("hud-observed-raw").innerText = observedRaw;

  const box = document.getElementById("hud-verdict");
  if (status) {
    box.className = `hud-verdict-box verdict-${status}`;
  }
  if (verdictTitle) document.getElementById("hud-verdict-title").innerText = verdictTitle;
  if (verdictSubtitle) document.getElementById("hud-verdict-subtitle").innerText = verdictSubtitle;
};

/**
 * StockCheck Demo — Live Split-Screen HUD & Virtual Cursor Engine (1920x1080)
 */

window.initStockCheckHUD = function () {
  if (document.getElementById("stockcheck-hud")) return;

  // Add styles
  const style = document.createElement("style");
  style.id = "stockcheck-hud-style";
  style.innerHTML = `
    /* Force 2-Column Split Screen Layout */
    html, body {
      width: 1920px !important;
      height: 1080px !important;
      margin: 0 !important;
      padding: 0 !important;
      overflow: hidden !important;
      background: #080a11 !important;
      display: grid !important;
      grid-template-columns: 54% 46% !important;
      font-family: 'Inter', system-ui, sans-serif !important;
    }

    #root {
      width: 100% !important;
      height: 1080px !important;
      display: flex !important;
      flex-direction: column !important;
      align-items: center !important;
      justify-content: center !important;
      padding: 30px !important;
      box-sizing: border-box !important;
      border-right: 1px solid rgba(255, 255, 255, 0.08) !important;
      background: radial-gradient(circle at 50% 25%, rgba(79, 110, 247, 0.08) 0%, #090b12 85%) !important;
      overflow-y: auto !important;
    }

    #root .card {
      width: 100% !important;
      max-width: 520px !important;
      margin: 0 !important;
      box-shadow: 0 12px 40px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.06) !important;
    }

    /* StockCheck Auditor Dashboard Column */
    #stockcheck-hud {
      width: 100% !important;
      height: 1080px !important;
      background: #0d111a !important;
      padding: 48px 44px !important;
      color: #f0f6fc !important;
      display: flex !important;
      flex-direction: column !important;
      justify-content: center !important;
      gap: 22px !important;
      box-sizing: border-box !important;
      border-left: 1px solid rgba(255, 255, 255, 0.06) !important;
    }

    .hud-top-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      padding-bottom: 20px;
    }

    .hud-brand {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .hud-pulse {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: #14f195;
      box-shadow: 0 0 14px #14f195;
      animation: pulse 2s infinite;
    }

    @keyframes pulse {
      0% { transform: scale(0.95); opacity: 0.8; }
      50% { transform: scale(1.2); opacity: 1; }
      100% { transform: scale(0.95); opacity: 0.8; }
    }

    .hud-brand-title {
      font-size: 20px;
      font-weight: 800;
      color: #ffffff;
      letter-spacing: -0.5px;
    }

    .hud-pill {
      font-size: 11px;
      font-weight: 700;
      padding: 5px 12px;
      border-radius: 9999px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      background: rgba(153, 69, 255, 0.15);
      border: 1px solid rgba(153, 69, 255, 0.4);
      color: #c084fc;
    }

    .hud-panel {
      background: rgba(22, 27, 36, 0.7);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 14px;
      padding: 20px 24px;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
    }

    .hud-panel-title {
      font-size: 11px;
      font-weight: 700;
      color: #8b949e;
      text-transform: uppercase;
      letter-spacing: 1px;
      margin-bottom: 12px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .hud-scenario-id {
      font-size: 20px;
      font-weight: 800;
      color: #58a6ff;
      margin-bottom: 8px;
    }

    .hud-scenario-desc {
      font-size: 14px;
      color: #94a3b8;
      line-height: 1.5;
    }

    .hud-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
      margin-top: 14px;
    }

    .hud-metric-box {
      background: rgba(15, 19, 28, 0.8);
      border: 1px solid rgba(255, 255, 255, 0.05);
      border-radius: 10px;
      padding: 12px 16px;
    }

    .hud-metric-lbl {
      font-size: 11px;
      color: #8b949e;
      text-transform: uppercase;
      margin-bottom: 4px;
    }

    .hud-metric-val {
      font-family: 'JetBrains Mono', monospace;
      font-size: 15px;
      font-weight: 700;
      color: #f0f6fc;
    }

    .hud-formula-box {
      background: rgba(11, 14, 22, 0.9);
      border: 1px solid rgba(255, 255, 255, 0.06);
      border-radius: 10px;
      padding: 14px 18px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 13px;
      color: #8b949e;
      line-height: 1.6;
      margin-top: 10px;
    }

    .hud-formula-val {
      color: #58a6ff;
      font-weight: 600;
    }

    /* Big Verdict Banner */
    .hud-verdict {
      border-radius: 14px;
      padding: 24px;
      text-align: center;
      transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    }

    .verdict-pending {
      background: rgba(88, 166, 255, 0.08);
      border: 1px solid rgba(88, 166, 255, 0.3);
      color: #58a6ff;
    }

    .verdict-pass {
      background: rgba(20, 241, 149, 0.12);
      border: 1px solid rgba(20, 241, 149, 0.5);
      box-shadow: 0 0 24px rgba(20, 241, 149, 0.15);
      color: #14f195;
    }

    .verdict-defect {
      background: rgba(248, 81, 73, 0.15);
      border: 1px solid rgba(248, 81, 73, 0.6);
      box-shadow: 0 0 30px rgba(248, 81, 73, 0.25);
      color: #f85149;
    }

    .verdict-title {
      font-size: 19px;
      font-weight: 800;
      letter-spacing: 0.5px;
      margin-bottom: 6px;
    }

    .verdict-msg {
      font-size: 13px;
      opacity: 0.92;
      line-height: 1.5;
    }

    /* Virtual Mouse Cursor */
    #virtual-cursor {
      position: fixed;
      top: 0;
      left: 0;
      width: 22px;
      height: 22px;
      pointer-events: none;
      z-index: 99999;
      transition: transform 0.4s cubic-bezier(0.2, 0.8, 0.2, 1), opacity 0.2s ease;
      opacity: 0;
    }
    #virtual-cursor svg {
      filter: drop-shadow(0 4px 8px rgba(0,0,0,0.6));
    }
    .cursor-click-ripple {
      position: absolute;
      width: 36px;
      height: 36px;
      border-radius: 50%;
      background: rgba(79, 110, 247, 0.4);
      top: -7px;
      left: -7px;
      animation: ripple 0.5s ease-out forwards;
      pointer-events: none;
    }
    @keyframes ripple {
      0% { transform: scale(0.2); opacity: 1; }
      100% { transform: scale(1.8); opacity: 0; }
    }
  `;
  document.head.appendChild(style);

  // Add HUD container
  const hud = document.createElement("div");
  hud.id = "stockcheck-hud";
  hud.innerHTML = `
    <div class="hud-top-bar">
      <div class="hud-brand">
        <span class="hud-pulse"></span>
        <span class="hud-brand-title">StockCheck Auditor</span>
      </div>
      <span class="hud-pill">Colosseum Hackathon 2026</span>
    </div>

    <div class="hud-panel">
      <div class="hud-panel-title">
        <span>Test Specimen & Scenario</span>
        <span id="hud-badge-tag" style="font-family:'JetBrains Mono'; color:#58a6ff;">SURFPOOL LOCAL</span>
      </div>
      <div class="hud-scenario-id" id="hud-scenario-name">Scenario Standby</div>
      <div class="hud-scenario-desc" id="hud-scenario-desc">Initializing automated auditor hook...</div>
    </div>

    <div class="hud-panel">
      <div class="hud-panel-title">On-Chain Mathematical Proof</div>
      
      <div class="hud-grid">
        <div class="hud-metric-box">
          <div class="hud-metric-lbl">Active Multiplier</div>
          <div class="hud-metric-val" id="hud-multiplier">1.0×</div>
        </div>
        <div class="hud-metric-box">
          <div class="hud-metric-lbl">User Intended</div>
          <div class="hud-metric-val" id="hud-user-amount">--</div>
        </div>
        <div class="hud-metric-box">
          <div class="hud-metric-lbl">Expected Raw Debit</div>
          <div class="hud-metric-val" id="hud-expected-raw">--</div>
        </div>
        <div class="hud-metric-box">
          <div class="hud-metric-lbl">Observed On-Chain</div>
          <div class="hud-metric-val" id="hud-observed-raw">--</div>
        </div>
      </div>

      <div class="hud-formula-box" id="hud-formula">
        Calculation: <span class="hud-formula-val">rawDebit = floor(uiAmount × 10^decimals / multiplier)</span>
      </div>
    </div>

    <div id="hud-verdict" class="hud-verdict verdict-pending">
      <div class="verdict-title" id="hud-verdict-title">AUDITOR STANDBY</div>
      <div class="verdict-msg" id="hud-verdict-msg">Awaiting user interaction and transaction execution...</div>
    </div>
  `;
  document.body.appendChild(hud);

  // Add Virtual Cursor
  const cursor = document.createElement("div");
  cursor.id = "virtual-cursor";
  cursor.innerHTML = `
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <path d="M5.5 3.5L18.5 10.5L12 13L9.5 19.5L5.5 3.5Z" fill="#ffffff" stroke="#131722" stroke-width="1.8" stroke-linejoin="round"/>
    </svg>
  `;
  document.body.appendChild(cursor);
};

window.moveVirtualCursor = function (x, y) {
  const cursor = document.getElementById("virtual-cursor");
  if (!cursor) return;
  cursor.style.opacity = "1";
  cursor.style.transform = `translate3d(${x}px, ${y}px, 0)`;
};

window.triggerVirtualClick = function () {
  const cursor = document.getElementById("virtual-cursor");
  if (!cursor) return;
  const ripple = document.createElement("div");
  ripple.className = "cursor-click-ripple";
  cursor.appendChild(ripple);
  setTimeout(() => ripple.remove(), 600);
};

window.hideVirtualCursor = function () {
  const cursor = document.getElementById("virtual-cursor");
  if (cursor) cursor.style.opacity = "0";
};

window.updateStockCheckHUD = function ({
  scenarioName,
  scenarioDesc,
  badgeTag,
  multiplier,
  userAmount,
  expectedRaw,
  observedRaw,
  formula,
  status, // 'pending' | 'pass' | 'defect'
  verdictTitle,
  verdictSubtitle,
}) {
  window.initStockCheckHUD();
  if (scenarioName) document.getElementById("hud-scenario-name").innerText = scenarioName;
  if (scenarioDesc) document.getElementById("hud-scenario-desc").innerText = scenarioDesc;
  if (badgeTag) document.getElementById("hud-badge-tag").innerText = badgeTag;
  if (multiplier) document.getElementById("hud-multiplier").innerText = multiplier;
  if (userAmount) document.getElementById("hud-user-amount").innerText = userAmount;
  if (expectedRaw) document.getElementById("hud-expected-raw").innerText = expectedRaw;
  if (observedRaw) document.getElementById("hud-observed-raw").innerText = observedRaw;
  if (formula) document.getElementById("hud-formula").innerHTML = formula;

  const box = document.getElementById("hud-verdict");
  if (status) {
    box.className = `hud-verdict verdict-${status}`;
  }
  if (verdictTitle) document.getElementById("hud-verdict-title").innerText = verdictTitle;
  if (verdictSubtitle) document.getElementById("hud-verdict-msg").innerText = verdictSubtitle;
};

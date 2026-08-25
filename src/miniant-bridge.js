const SDK_WAIT_MS = 8000;
const PROGRESS_INTERVAL_MS = 30000;
const SCORE_POLL_INTERVAL_MS = 500;
const LOCAL_STORAGE_KEYS = ["NutsAndBolts"];

const embedded = window.parent !== window;
const statusEl = document.getElementById("miniant-status");

let miniantActive = false;
let readySent = false;
let resultSent = false;
let terminated = false;
let startedAt = Date.now();
let progressTimer = 0;
let scoreTimer = 0;
let latestLevel = 1;

function setStatus(text) {
  if (statusEl) {
    statusEl.textContent = text;
  }
}

function hideStatus() {
  if (statusEl) {
    statusEl.hidden = true;
  }
}

function installStorageFallback() {
  const storage = navigator.storage || {};
  storage.persisted ||= async () => false;
  storage.persist ||= async () => false;
  try {
    Object.defineProperty(navigator, "storage", {
      value: storage,
      configurable: true,
    });
  } catch {
    // Construct can continue if the browser exposes navigator.storage as read-only.
  }
}

function applySafeAreaInsets(context) {
  const safeAreaInsets = context?.ui?.safeAreaInsets || {};
  const root = document.documentElement;
  root.style.setProperty("--miniant-safe-top", `${Number(safeAreaInsets.top || 0)}px`);
  root.style.setProperty("--miniant-safe-right", `${Number(safeAreaInsets.right || 0)}px`);
  root.style.setProperty("--miniant-safe-bottom", `${Number(safeAreaInsets.bottom || 0)}px`);
  root.style.setProperty("--miniant-safe-left", `${Number(safeAreaInsets.left || 0)}px`);
}

function getRuntime() {
  try {
    return window.c3_runtimeInterface?._GetLocalRuntime?.() || null;
  } catch {
    return null;
  }
}

function getConstructInterfaces() {
  const runtime = getRuntime();
  const iRuntime = runtime?.GetIRuntime?.() || null;
  return { runtime, iRuntime };
}

function readCurrentLevel() {
  const { iRuntime } = getConstructInterfaces();
  const globalLevel = Number(iRuntime?.globalVars?.Game_level);
  const storedLevel = Number(window.localStorage.getItem("NutsAndBolts"));
  latestLevel = Math.max(
    latestLevel,
    Number.isFinite(globalLevel) && globalLevel > 0 ? globalLevel : 0,
    Number.isFinite(storedLevel) && storedLevel > 0 ? storedLevel : 0,
  );
  return latestLevel;
}

function readGameStatus() {
  const { runtime, iRuntime } = getConstructInterfaces();
  const globals = iRuntime?.globalVars || {};
  return {
    layoutName: runtime?.GetMainRunningLayout?.()?.GetName?.() || "",
    level: readCurrentLevel(),
    totalLevel: Number(globals.Game_totalLevel) || 100,
    isPaused: Number(globals.Game_isPause) === 1,
  };
}

function monitorEndState() {
  if (!miniantActive || terminated || resultSent) {
    return;
  }
  const status = readGameStatus();
  window.__miniantNutsAndBoltsStatus = status;
  if (status.level > status.totalLevel) {
    void reportResultOnce("completed");
  }
}

function setRuntimePaused(isPaused) {
  document.documentElement.classList.toggle("miniant-paused", isPaused);
  try {
    getRuntime()?.SetTimeScale?.(isPaused ? 0 : 1);
  } catch {
    // Construct internals vary by export mode; the visual pause class still blocks input.
  }
}

function stopTimers() {
  if (progressTimer) {
    window.clearInterval(progressTimer);
    progressTimer = 0;
  }
  if (scoreTimer) {
    window.clearInterval(scoreTimer);
    scoreTimer = 0;
  }
}

function durationMs() {
  return Math.max(0, Date.now() - startedAt);
}

async function reportResultOnce(outcome = "abandoned") {
  if (!miniantActive || resultSent || !window.MiniAnt?.reportResult) {
    return;
  }
  resultSent = true;
  await window.MiniAnt.reportResult({
    outcome,
    score: readCurrentLevel(),
    durationMs: durationMs(),
    detail: {
      source: "construct-export-wrapper",
      scoreSource: "Construct globalVars.Game_level",
    },
  });
}

function reportProgress() {
  if (!miniantActive || terminated || !window.MiniAnt?.reportProgress) {
    return;
  }
  void window.MiniAnt.reportProgress({
    checkpoint: "active_session",
    score: readCurrentLevel(),
    tick: Math.floor(durationMs() / 1000),
  });
}

function waitForMiniAnt() {
  if (window.MiniAnt) {
    return Promise.resolve(window.MiniAnt);
  }
  return new Promise((resolve) => {
    const started = Date.now();
    const tick = () => {
      if (window.MiniAnt) {
        resolve(window.MiniAnt);
        return;
      }
      if (Date.now() - started >= SDK_WAIT_MS) {
        resolve(null);
        return;
      }
      window.setTimeout(tick, 50);
    };
    tick();
  });
}

function loadScript(src, options = {}) {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.async = false;
    if (options.type) {
      script.type = options.type;
    }
    script.addEventListener("load", resolve, { once: true });
    script.addEventListener("error", () => reject(new Error(`Failed to load ${src}`)), {
      once: true,
    });
    document.body.appendChild(script);
  });
}

async function startConstructRuntime() {
  installStorageFallback();
  await loadScript("scripts/supportcheck.js");
  await loadScript("scripts/offlineclient.js", { type: "module" });
  await loadScript("scripts/main.js", { type: "module" });
  waitForFirstFrame();
}

function waitForFirstFrame() {
  const tick = () => {
    const canvas = document.querySelector("canvas");
    const visible =
      canvas &&
      canvas.offsetWidth > 0 &&
      canvas.offsetHeight > 0 &&
      getComputedStyle(canvas).display !== "none";
    if (visible) {
      hideStatus();
      if (miniantActive && !readySent && window.MiniAnt?.ready) {
        readySent = true;
        void window.MiniAnt.ready().then(reportProgress);
      }
      return;
    }
    window.requestAnimationFrame(tick);
  };
  window.requestAnimationFrame(tick);
}

async function bootMiniAnt() {
  const MiniAnt = await waitForMiniAnt();
  if (!MiniAnt) {
    setStatus("Unable to connect to MiniAnt.");
    return;
  }

  const context = await MiniAnt.init({ sdkVersion: 1 });
  miniantActive = true;
  startedAt = Date.now();
  applySafeAreaInsets(context);

  MiniAnt.on?.("pause", () => setRuntimePaused(true));
  MiniAnt.on?.("resume", () => {
    if (!terminated) {
      setRuntimePaused(false);
    }
  });
  MiniAnt.on?.("settings_changed", (settings) => {
    window.__miniantSettings = settings;
  });
  MiniAnt.on?.("terminate", () => {
    terminated = true;
    void reportResultOnce("abandoned").finally(() => {
      setRuntimePaused(true);
      stopTimers();
      document.documentElement.classList.add("miniant-terminated");
    });
  });

  progressTimer = window.setInterval(reportProgress, PROGRESS_INTERVAL_MS);
  scoreTimer = window.setInterval(monitorEndState, SCORE_POLL_INTERVAL_MS);
  await startConstructRuntime();
}

async function bootStandalone() {
  miniantActive = false;
  applySafeAreaInsets(null);
  await startConstructRuntime();
}

window.addEventListener("pagehide", () => {
  if (miniantActive && !terminated) {
    void reportResultOnce("abandoned");
  }
});

if (embedded) {
  void bootMiniAnt();
} else {
  void bootStandalone();
}

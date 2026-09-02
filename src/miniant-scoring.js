const PROGRESS_KEY = "NutsAndBoltsMiniAntScore";
const LEVEL_LAYOUT_PREFIX = /^Layout/;
const COMPLETE_VISIBLE_MIN_X = -100;
const COMPLETE_VISIBLE_MAX_X = 820;

let progress = loadProgress();
let levelState = null;
let scoringTimer = 0;
let completionScore = 0;
let lastCompleteLevel = 0;
let pointerStart = null;

function loadProgress() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(PROGRESS_KEY) || "{}");
    return {
      totalScore: Math.max(0, Number(parsed.totalScore) || 0),
      bestScore: Math.max(0, Number(parsed.bestScore) || 0),
      completedLevels: Array.isArray(parsed.completedLevels)
        ? parsed.completedLevels.filter((level) => Number.isSafeInteger(level))
        : [],
    };
  } catch {
    return { totalScore: 0, bestScore: 0, completedLevels: [] };
  }
}

function saveProgress() {
  window.localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
}

function getRuntime() {
  try {
    return window.c3_runtimeInterface?._GetLocalRuntime?.() || null;
  } catch {
    return null;
  }
}

function getRuntimeInfo() {
  const runtime = getRuntime();
  const iRuntime = runtime?.GetIRuntime?.() || null;
  return {
    runtime,
    globals: iRuntime?.globalVars || {},
    layoutName: runtime?.GetMainRunningLayout?.()?.GetName?.() || "",
  };
}

function getObjectClass(runtime, name) {
  if (!runtime?.GetAllObjectClasses) {
    return null;
  }
  for (const objectClass of runtime.GetAllObjectClasses()) {
    if (objectClass.GetName?.() === name) {
      return objectClass;
    }
  }
  return null;
}

function objectInstances(objectClass) {
  if (!objectClass) {
    return [];
  }
  if (typeof objectClass.GetInstances === "function") {
    return objectClass.GetInstances() || [];
  }
  if (typeof objectClass.instances === "function") {
    return objectClass.instances() || [];
  }
  return [];
}

function firstWorldInfo(runtime, name) {
  const objectClass = getObjectClass(runtime, name);
  const first = objectInstances(objectClass)[0] || objectClass?.GetFirstPicked?.() || null;
  return first?.GetWorldInfo?.() || null;
}

function visibleInstanceCount(runtime, prefix) {
  if (!runtime?.GetAllObjectClasses) {
    return 0;
  }
  let count = 0;
  for (const objectClass of runtime.GetAllObjectClasses()) {
    if (!objectClass.GetName?.().startsWith(prefix)) {
      continue;
    }
    for (const instance of objectInstances(objectClass)) {
      const worldInfo = instance.GetWorldInfo?.();
      if (worldInfo?.IsVisible?.() && worldInfo.GetX?.() > -100 && worldInfo.GetX?.() < 820) {
        count += 1;
      }
    }
  }
  return count;
}

function distinctVisibleNutTypes(runtime) {
  if (!runtime?.GetAllObjectClasses) {
    return 1;
  }
  let count = 0;
  for (const objectClass of runtime.GetAllObjectClasses()) {
    if (!/^nut\d+$/.test(objectClass.GetName?.() || "")) {
      continue;
    }
    const hasVisible = objectInstances(objectClass).some((instance) => {
      const worldInfo = instance.GetWorldInfo?.();
      return worldInfo?.IsVisible?.() && worldInfo.GetX?.() > -100 && worldInfo.GetX?.() < 820;
    });
    if (hasVisible) {
      count += 1;
    }
  }
  return Math.max(1, count);
}

function layoutPointFromClient(clientX, clientY) {
  const canvas = document.querySelector("canvas");
  if (!canvas) {
    return null;
  }
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((clientX - rect.left) / rect.width) * 720,
    y: ((clientY - rect.top) / rect.height) * 1280,
  };
}

function calculateLevelScore(input) {
  const base = 500 + input.displayLevel * 60 + input.colorCount * 120;
  const movePenalty = Math.max(0, input.moves - input.targetMoves) * 12;
  const undoPenalty = input.undoCount * 18;
  const restartPenalty = input.restarts * 75;
  const timePenalty = Math.floor(input.activeMs / 1000) * 2;
  return Math.max(100, base - movePenalty - undoPenalty - restartPenalty - timePenalty);
}

function ensureScoringUi() {
  if (document.getElementById("miniant-score-hud")) {
    return;
  }

  const hud = document.createElement("div");
  hud.id = "miniant-score-hud";
  hud.innerHTML = `
    <span>Score</span>
    <strong>0</strong>
  `;

  document.body.append(hud);
  updateHud();
}

function updateHud() {
  const hud = document.getElementById("miniant-score-hud");
  const score = hud?.querySelector("strong");
  if (!hud || !score) {
    return;
  }
  hud.hidden = !levelState;
  if (hud.hidden) {
    return;
  }
  score.textContent = String(progress.totalScore);
  positionHud(hud);
}

function positionHud(hud) {
  const canvas = document.querySelector("canvas");
  if (!canvas) {
    return;
  }
  const rect = canvas.getBoundingClientRect();
  hud.style.left = `${rect.left + rect.width * 0.5}px`;
  hud.style.top = `${rect.top + rect.height * 0.082}px`;
}

function startLevelIfNeeded(info) {
  const level = Number(info.globals.Game_level) || Number(window.localStorage.getItem("NutsAndBolts")) || 1;
  if (!LEVEL_LAYOUT_PREFIX.test(info.layoutName)) {
    levelState = null;
    return;
  }
  if (levelState?.level === level) {
    return;
  }
  levelState = {
    level,
    startedAt: Date.now(),
    moves: 0,
    undoStart: Number(info.globals.Game_numUndo) || 0,
    undoCount: 0,
    restarts: 0,
    colorCount: distinctVisibleNutTypes(info.runtime),
    targetMoves: Math.max(1, visibleInstanceCount(info.runtime, "nut")),
  };
  completionScore = 0;
  lastCompleteLevel = 0;
  updateHud();
}

function completePanelVisible(runtime) {
  const worldInfo = firstWorldInfo(runtime, "Complete_Container");
  if (!worldInfo) {
    return false;
  }
  const x = worldInfo.GetX?.() ?? 9999;
  return worldInfo.IsVisible?.() && x > COMPLETE_VISIBLE_MIN_X && x < COMPLETE_VISIBLE_MAX_X;
}

function maybeCompleteLevel(info) {
  if (!levelState || lastCompleteLevel === levelState.level) {
    return;
  }
  if (!completePanelVisible(info.runtime)) {
    return;
  }

  levelState.undoCount = Math.max(
    levelState.undoCount,
    Math.max(0, levelState.undoStart - (Number(info.globals.Game_numUndo) || 0)),
  );

  const activeMs = Math.max(0, Date.now() - levelState.startedAt);
  completionScore = calculateLevelScore({
    displayLevel: levelState.level,
    colorCount: levelState.colorCount,
    moves: levelState.moves,
    targetMoves: levelState.targetMoves,
    undoCount: levelState.undoCount,
    restarts: levelState.restarts,
    activeMs,
  });
  progress = {
    totalScore: progress.totalScore + completionScore,
    bestScore: Math.max(progress.bestScore, progress.totalScore + completionScore),
    completedLevels: [...progress.completedLevels, levelState.level],
  };
  saveProgress();
  lastCompleteLevel = levelState.level;
  updateHud();
  reportLevelProgress(activeMs);
}

function reportLevelProgress(activeMs) {
  if (!window.__miniantNutsAndBolts?.active || !window.MiniAnt?.reportProgress || !levelState) {
    return;
  }
  const payload = {
    checkpoint: `level_${levelState.level}_complete`,
    score: progress.totalScore,
    tick: progress.completedLevels.length,
    detail: {
      levelScore: completionScore,
      moves: levelState.moves,
      activeMs,
      source: "miniant-scoring-wrapper",
    },
  };
  window.__miniantNutsAndBoltsScoringLastReport = payload;
  void window.MiniAnt.reportProgress(payload).catch(() => {});
}

function onPointerDown(event) {
  pointerStart = layoutPointFromClient(event.clientX, event.clientY);
}

function onPointerUp(event) {
  if (!levelState || lastCompleteLevel === levelState.level) {
    return;
  }
  const point = layoutPointFromClient(event.clientX, event.clientY);
  if (!point || !pointerStart) {
    return;
  }
  const moved = Math.hypot(point.x - pointerStart.x, point.y - pointerStart.y);
  pointerStart = null;
  if (point.y < 145) {
    return;
  }
  if (moved < 4) {
    levelState.moves += 1;
  } else {
    levelState.moves += 1;
  }
}

function tickScoring() {
  ensureScoringUi();
  const info = getRuntimeInfo();
  startLevelIfNeeded(info);
  if (levelState) {
    levelState.undoCount = Math.max(
      levelState.undoCount,
      Math.max(0, levelState.undoStart - (Number(info.globals.Game_numUndo) || 0)),
    );
  }
  maybeCompleteLevel(info);
  updateHud();
}

function startScoring() {
  if (scoringTimer) {
    return;
  }
  ensureScoringUi();
  window.addEventListener("pointerdown", onPointerDown, { capture: true });
  window.addEventListener("pointerup", onPointerUp, { capture: true });
  scoringTimer = window.setInterval(tickScoring, 250);
  tickScoring();
}

window.__miniantNutsAndBoltsScoring = {
  start: startScoring,
  progress: () => progress,
  currentLevel: () => levelState,
  calculateLevelScore,
};

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", startScoring, { once: true });
} else {
  startScoring();
}

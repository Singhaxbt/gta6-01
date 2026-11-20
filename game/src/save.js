// save.js — progress persistence in localStorage: cash, missions done,
// hidden packages found, best race/taxi times, weapon unlocks.
const KEY = 'solmar-sunset-save-v2';

export function loadSave() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data !== 'object' || !data) return null;
    return data;
  } catch (e) { return null; }
}

export function writeSave(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify({
      cash: Math.round(state.cash),
      missionsDone: state.missionsDone.slice(),
      packages: state.packagesFound.slice(),
      bestRaceMs: state.bestRaceMs,
      bestTaxi: state.bestTaxi,
      totalEarned: Math.round(state.totalEarned || 0),
      savedAt: Date.now(),
    }));
  } catch (e) { /* storage unavailable (private mode) — game still plays */ }
}

export function applySave(state, data) {
  if (!data) return;
  if (typeof data.cash === 'number') state.cash = data.cash;
  if (Array.isArray(data.missionsDone)) state.missionsDone = data.missionsDone.slice(0, 5);
  if (Array.isArray(data.packages)) state.packagesFound = data.packages.slice();
  if (typeof data.bestRaceMs === 'number') state.bestRaceMs = data.bestRaceMs;
  if (typeof data.bestTaxi === 'number') state.bestTaxi = data.bestTaxi;
  if (typeof data.totalEarned === 'number') state.totalEarned = data.totalEarned;
}

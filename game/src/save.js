// save.js — localStorage persistence for money, missions and best result.
import { WORLD } from './palette.js';

const KEY = 'solmar-sunset-save-v1';

export function defaultSave() {
  return { money: WORLD.startMoney, missionsDone: [false, false, false], best: 0 };
}

export function loadSave() {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return defaultSave();
    const parsed = JSON.parse(raw);
    const save = defaultSave();
    if (typeof parsed.money === 'number' && Number.isFinite(parsed.money)) {
      save.money = Math.max(0, Math.round(parsed.money));
    }
    if (Array.isArray(parsed.missionsDone)) {
      for (let i = 0; i < 3; i++) save.missionsDone[i] = parsed.missionsDone[i] === true;
    }
    if (typeof parsed.best === 'number' && Number.isFinite(parsed.best)) {
      save.best = Math.max(0, Math.round(parsed.best));
    }
    return save;
  } catch {
    return defaultSave();
  }
}

export function storeSave(save) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(save));
  } catch {
    /* storage unavailable (private mode, headless): progress just isn't kept */
  }
}

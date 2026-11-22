// Aurora Falls — saves and progression: localStorage, garage upgrades,
// district standing and respect ranks.
// One clear job: what the player keeps between sessions.
import { GARAGE_UPGRADES, DISTRICTS } from './config.js';

const KEY = 'aurora-falls-save-v1';

export function defaultSave() {
  return {
    money: 400,
    health: 100,
    missionsDone: [],
    standing: Object.fromEntries(DISTRICTS.map((d) => [d.id, 0])),
    respect: 0,
    upgrades: { engine: 0, tires: 0, armor: 0, paint: 0 },
    radio: 0,
    racesWon: 0,
    taxisDone: 0,
    deliveriesDone: 0,
  };
}

export function loadSave() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultSave();
    const parsed = JSON.parse(raw);
    const base = defaultSave();
    return { ...base, ...parsed, standing: { ...base.standing, ...(parsed.standing ?? {}) } };
  } catch {
    return defaultSave();
  }
}

export function storeSave(save) {
  try { localStorage.setItem(KEY, JSON.stringify(save)); } catch { /* storage full or blocked */ }
}

export function respectRank(respect) {
  if (respect >= 9000) return 'Aurora Legend';
  if (respect >= 5000) return 'Mountain King';
  if (respect >= 2500) return 'Ice Road Pro';
  if (respect >= 1000) return 'Wheelman';
  if (respect >= 300) return 'Runner';
  return 'Nobody';
}

export function buyUpgrade(save, id) {
  const def = GARAGE_UPGRADES.find((u) => u.id === id);
  if (!def) return { ok: false, reason: 'no such upgrade' };
  const level = save.upgrades[id] ?? 0;
  if (level >= def.levels) return { ok: false, reason: 'maxed' };
  const cost = def.costs[level];
  if (save.money < cost) return { ok: false, reason: 'not enough money' };
  save.money -= cost;
  save.upgrades[id] = level + 1;
  storeSave(save);
  return { ok: true, level: level + 1, cost };
}

export function addStanding(save, districtId, amount) {
  save.standing[districtId] = (save.standing[districtId] ?? 0) + amount;
  storeSave(save);
}

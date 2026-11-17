// missions.js — Marisol Vega's three jobs for Dario. Gold pillar + diamond
// mark the objective; timers, phases and payouts live here.
import * as THREE from 'three';
import { PALETTE, WORLD } from './palette.js';

export const MISSION_NAMES = ['First Run', 'Hot Property', 'Heat Run'];
export const MISSION_BRIEFS = [
  'Deliver the package to the Marina drop.',
  'Steal the red Cometa GT, then deliver it to the Chop Shop.',
  'Deliver the package to Solmar Tower — while the heat is on.',
];

export function createMissions(scene) {
  const pillarMat = new THREE.MeshBasicMaterial({
    color: PALETTE.gold, transparent: true, opacity: 0.28, side: THREE.DoubleSide,
    depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const pillar = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.6, 34, 20, 1, true), pillarMat);
  pillar.visible = false;
  scene.add(pillar);
  const diamond = new THREE.Mesh(
    new THREE.OctahedronGeometry(1.5),
    new THREE.MeshBasicMaterial({ color: PALETTE.gold }),
  );
  diamond.visible = false;
  scene.add(diamond);
  return {
    pillar,
    diamond,
    index: -1,
    phase: 'A',
    active: false,
    timeLeft: 0,
    target: { x: 0, z: 0 },
    spin: 0,
  };
}

function setTarget(G, x, z) {
  const m = G.missions;
  m.target.x = x;
  m.target.z = z;
  m.pillar.position.set(x, 17, z);
  m.pillar.visible = true;
  m.diamond.position.set(x, 7, z);
  m.diamond.visible = true;
}

export function startMission(G, i) {
  const m = G.missions;
  if (m.active) return { ok: false, reason: 'A mission is already running.' };
  if (i > 0 && !G.save.missionsDone[i - 1]) {
    return { ok: false, reason: `Finish "${MISSION_NAMES[i - 1]}" first.` };
  }
  if (G.save.missionsDone[i]) return { ok: false, reason: `"${MISSION_NAMES[i]}" is already done.` };
  if (G.mode !== 'playing') return { ok: false, reason: 'Start the game first.' };
  m.index = i;
  m.phase = 'A';
  m.active = true;
  m.timeLeft = WORLD.missionTimes[i];
  if (i === 0) {
    const t = G.city.landmarks.marina;
    setTarget(G, t.x, t.z);
  } else if (i === 1) {
    setTarget(G, G.cometa.pos.x, G.cometa.pos.z);
  } else {
    // Deliver to the tower's plaza side (south of the tower): the objective
    // must sit outside the tower's footprint, or the collision push-out
    // would keep Dario from ever reaching it.
    const t = G.city.landmarks.tower;
    setTarget(G, t.x, t.z + 20);
    G.wanted = 3;
    G.quietTime = 0;
    G.heatFrozen = true;
    G.hud.toast('The heat is on — 3 stars!');
  }
  G.audio.missionStart();
  G.hud.toast(`Mission ${i + 1}: ${MISSION_NAMES[i]} — ${MISSION_BRIEFS[i]}`);
  return { ok: true };
}

export function failMission(G, reason) {
  const m = G.missions;
  if (!m.active) return;
  m.active = false;
  m.index = -1;
  m.pillar.visible = false;
  m.diamond.visible = false;
  G.heatFrozen = false;
  G.audio.fail();
  G.hud.toast(`Mission failed: ${reason}`);
}

function completeMission(G) {
  const m = G.missions;
  const i = m.index;
  const payout = WORLD.missionPayouts[i];
  m.active = false;
  m.index = -1;
  m.pillar.visible = false;
  m.diamond.visible = false;
  G.heatFrozen = false;
  G.save.money += payout;
  G.save.missionsDone[i] = true;
  G.save.best = Math.max(G.save.best, G.save.money);
  G.storeSave();
  G.audio.fanfare();
  G.hud.toast(`Mission complete! +$${payout} — ${MISSION_NAMES[i]}`);
}

function playerPos(G) {
  return G.car ? G.car.pos : G.player.pos;
}

export function updateMissions(G, dt) {
  const m = G.missions;
  if (m.pillar.visible) {
    m.spin += dt;
    m.diamond.rotation.y = m.spin * 1.6;
    m.diamond.position.y = 7 + Math.sin(m.spin * 2) * 0.7;
  }
  if (!m.active) return;
  m.timeLeft -= dt;
  if (m.timeLeft <= 0) {
    failMission(G, 'Out of time.');
    return;
  }
  const p = playerPos(G);
  if (m.index === 1 && m.phase === 'A') {
    // Phase A ends the moment Dario takes the Cometa.
    if (G.car === G.cometa) {
      m.phase = 'B';
      // Deliver to the Chop Shop's forecourt (south of the building): the
      // target must sit OUTSIDE the building's footprint, or the collision
      // push-out would keep the car from ever reaching it.
      const t = G.city.landmarks.chopShop;
      setTarget(G, t.x, t.z - 20);
      G.hud.toast('Got the Cometa! Now deliver it to the Chop Shop.');
    }
    return;
  }
  const radius = m.index === 1 ? 10 : 8;
  const d = Math.hypot(p.x - m.target.x, p.z - m.target.z);
  if (d <= radius) {
    if (m.index === 1 && G.car !== G.cometa) {
      // Must arrive in the Cometa, not on foot or in another car.
      return;
    }
    completeMission(G);
  }
}

/** One-line objective text for the HUD ('' when no mission is active). */
export function objectiveText(G) {
  const m = G.missions;
  if (!m.active) {
    const next = G.save.missionsDone.findIndex((d) => !d);
    if (next === -1) return 'All missions complete — Solmar is yours.';
    return `Press M for Mission ${next + 1}: ${MISSION_NAMES[next]}`;
  }
  let label = `Mission ${m.index + 1}: ${MISSION_NAMES[m.index]}`;
  if (m.index === 1 && m.phase === 'A') label += ' — steal the Cometa GT';
  if (m.index === 1 && m.phase === 'B') label += ' — deliver to the Chop Shop';
  return label;
}

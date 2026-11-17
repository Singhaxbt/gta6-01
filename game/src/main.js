// main.js — SOLMAR SUNSET boot + game loop. Wires every system together,
// runs the fixed-timestep simulation, and exposes window.__game for
// play-testing (and the ?shot= staging hook for screenshots).
import * as THREE from 'three';
import { WORLD } from './palette.js';
import { mulberry32, clamp } from './util.js';
import { Input } from './input.js';
import { AudioEngine } from './audio.js';
import { loadSave, storeSave } from './save.js';
import { buildCity } from './city.js';
import { createParkedCars, stepCarPhysics } from './vehicles.js';
import {
  createPlayerMesh, makePlayer, stepPlayerOnFoot, updateCamera,
  enterCar, exitCar, respawnAtHospital,
} from './player.js';
import {
  createTraffic, stepTraffic, createPedestrians, stepPedestrians,
} from './traffic.js';
import { createPolicePool, syncPolice, stepPolice } from './police.js';
import { createCombat, shoot, stepCombat } from './combat.js';
import {
  createMissions, startMission, updateMissions, objectiveText, failMission,
} from './missions.js';
import { createHud } from './hud.js';

// ---------------------------------------------------------------- boot

const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'low-power' });
renderer.setPixelRatio(1);
renderer.setSize(window.innerWidth, window.innerHeight);
document.getElementById('game-canvas').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 900);
camera.position.set(10, 4, 26);

const G = {
  scene,
  camera,
  renderer,
  rng: mulberry32(WORLD.seed),
  time: 0,
  timeScale: 1,
  acc: 0,
  mode: 'menu', // menu | playing | paused | wasted | busted
  ready: false,
  wanted: 0,
  quietTime: 0,
  heatFrozen: false,
  decayAcc: 0,
  busted: false,
  shotPos: null,
};

G.city = buildCity(scene);
G.save = loadSave();
G.input = new Input();
G.input.attach();
G.audio = new AudioEngine();
G.player = makePlayer(createPlayerMesh());
scene.add(G.player.mesh);
G.player.mesh.position.set(G.player.pos.x, 0, G.player.pos.z);
const parked = createParkedCars(scene, G.rng);
G.parked = parked.parked;
G.cometa = parked.cometa;
G.traffic = createTraffic(scene, G.rng);
G.peds = createPedestrians(scene, G.rng);
G.police = createPolicePool(scene);
G.combat = createCombat(scene);
G.missions = createMissions(scene);
G.car = null;

G.storeSave = () => storeSave(G.save);
G.objectiveText = () => objectiveText(G);
G.addWanted = (n) => {
  if (G.mode !== 'playing') return;
  G.wanted = Math.min(WORLD.maxWanted, G.wanted + n);
  G.quietTime = 0;
  G.decayAcc = 0;
};

G.startGame = () => {
  G.audio.unlock();
  G.mode = 'playing';
  G.hud.showOnly(null);
  G.hud.toast('Welcome to Solmar. Marisol is waiting — press M for work.');
};
G.resumeGame = () => {
  G.mode = 'playing';
  G.hud.showOnly(null);
};
G.quitToMenu = () => {
  G.mode = 'menu';
  G.hud.showOnly('start');
};
G.respawn = () => {
  if (G.missions.active) failMission(G, 'Dario went down.');
  respawnAtHospital(G);
  G.hud.showOnly(null);
  G.hud.toast('Solmar General patched you up. -$200.');
};

G.hud = createHud(G);
G.hud.showOnly('start');

const unlockOnce = () => G.audio.unlock();
window.addEventListener('pointerdown', unlockOnce);
window.addEventListener('keydown', unlockOnce);
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------------------------------------------------------------- actions

function nearestParkedCar(maxDist) {
  let best = null;
  let bestD = maxDist;
  for (const car of G.parked) {
    if (car === G.car) continue;
    const d = Math.hypot(car.pos.x - G.player.pos.x, car.pos.z - G.player.pos.z);
    if (d < bestD) {
      bestD = d;
      best = car;
    }
  }
  return best;
}

function tryEnterCar() {
  const car = nearestParkedCar(3.6);
  if (!car) {
    G.hud.toast('No car close by.');
    return;
  }
  enterCar(G, car);
  if (!car.stolenOnce) {
    car.stolenOnce = true;
    G.addWanted(1);
    G.hud.toast(car.isCometa ? 'You stole the Cometa GT! Wanted: 1 star.' : 'You stole a car! Wanted: 1 star.');
  }
}

function startNextMission() {
  const next = G.save.missionsDone.findIndex((d) => !d);
  if (next === -1) {
    G.hud.toast('All missions complete — Solmar is yours.');
    return;
  }
  const res = startMission(G, next);
  if (!res.ok) G.hud.toast(res.reason);
}

function tick(dt) {
  G.time += dt;
  const input = G.input;

  // --- one-shot keys ---
  if (input.takePressed('KeyE')) {
    if (G.car) exitCar(G);
    else tryEnterCar();
  }
  if (input.takePressed('KeyM')) startNextMission();
  if (input.takePressed('KeyN')) {
    G.audio.setMuted(!G.audio.muted);
    G.hud.toast(G.audio.muted ? 'Sound muted.' : 'Sound on.');
  }
  if (input.down('KeyF') || input.mouseDown) {
    const report = shoot(G);
    if (report) G.shotPos = { x: G.player.pos.x, z: G.player.pos.z };
  }

  // --- player / car ---
  if (G.car) {
    const throttle = (input.down('KeyW') ? 1 : 0) - (input.down('KeyS') ? 1 : 0);
    const steer = (input.down('KeyD') ? 1 : 0) - (input.down('KeyA') ? 1 : 0);
    stepCarPhysics(
      G.car,
      { throttle, steer, handbrake: input.down('Space') },
      dt,
      G.city.colliders,
      (speed) => {
        G.hud.toast('Crash! The car is taking damage.');
        G.audio.blip();
      },
    );
    if (G.car.dead) {
      const wreck = G.car;
      exitCar(G);
      G.player.health -= 25;
      G.hud.toast('Your car is wrecked!');
      wreck.mesh.visible = true; // the wreck stays where it died
    }
  } else {
    stepPlayerOnFoot(G, dt);
  }

  // --- world ---
  stepTraffic(G.traffic, dt, G.city.colliders);
  stepPedestrians(G.peds, dt, G.time, G.city.colliders, G.shotPos);
  G.shotPos = null;
  syncPolice(G, dt);
  stepPolice(G, dt);
  stepCombat(G, dt);
  updateMissions(G, dt);
  G.city.update(dt, G.time);

  // --- wanted heat decay: 30s quiet, then -1 star every 8s ---
  if (G.wanted > 0 && !G.heatFrozen) {
    G.quietTime += dt;
    if (G.quietTime > WORLD.heatQuietSeconds) {
      G.decayAcc += dt;
      if (G.decayAcc >= 8) {
        G.decayAcc = 0;
        G.wanted--;
        if (G.wanted === 0) G.hud.toast('You lost the heat.');
      }
    }
  }

  // --- health regen while calm, busted / wasted checks ---
  if (G.wanted === 0 && G.player.health < 100) {
    G.player.health = Math.min(100, G.player.health + 2 * dt);
  }
  if (G.busted) {
    G.busted = false;
    G.mode = 'busted';
    G.audio.wasted();
    G.hud.showEnd('busted');
  } else if (G.player.health <= 0) {
    G.player.health = 0;
    G.mode = 'wasted';
    G.audio.wasted();
    G.hud.showEnd('wasted');
  }

  // --- audio follows speed + wanted ---
  const speedNorm = G.car ? Math.abs(G.car.speed) / G.car.maxSpeed : Math.abs(G.player.speed) / G.player.runSpeed;
  G.audio.update(clamp(speedNorm, 0, 1), G.wanted, dt);
}

// ---------------------------------------------------------------- frame loop

let lastNow = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const rawDt = Math.min(0.5, Math.max(0, (now - lastNow) / 1000));
  lastNow = now;
  const input = G.input;

  // Pause / resume and menu keys live outside the sim tick.
  if (input.takePressed('Escape') || input.takePressed('KeyP')) {
    if (G.mode === 'playing') {
      G.mode = 'paused';
      G.hud.showOnly('pause');
    } else if (G.mode === 'paused') {
      G.resumeGame();
    }
  }
  if (G.mode === 'menu' && input.takePressed('Enter')) G.startGame();
  if ((G.mode === 'wasted' || G.mode === 'busted') && input.takePressed('KeyR')) G.respawn();

  if (G.mode === 'playing') {
    G.acc += rawDt * G.timeScale;
    const step = 1 / 60;
    let n = 0;
    while (G.acc >= step && n < 400) {
      tick(step);
      G.acc -= step;
      n++;
    }
    if (n === 400) G.acc = 0;
  } else if (G.mode === 'menu') {
    G.time += rawDt; // keep the sea bobbing and the menu backdrop alive
    G.city.update(rawDt, G.time);
  }
  updateCamera(G, rawDt);
  renderer.render(scene, camera);
  G.hud.update(rawDt);
  input.endFrame();
  if (!G.ready) G.ready = true;
}
requestAnimationFrame(frame);

// ---------------------------------------------------------------- ?shot= staging

function stageForShot(kind) {
  G.mode = 'playing';
  G.hud.showOnly(null);
  const placeInCar = (car, x, z, heading, speed) => {
    car.pos.x = x;
    car.pos.z = z;
    car.heading = heading;
    car.speed = speed;
    car.mesh.position.set(x, 0, z);
    car.mesh.rotation.y = Math.PI - heading;
    car.isParked = false;
    enterCar(G, car);
  };
  if (kind === 'foot') {
    G.player.pos.x = 208;
    G.player.pos.z = 25;
    G.player.heading = Math.PI / 2; // face the sea + pier
    G.player.mesh.position.set(208, 0, 25);
    G.player.mesh.rotation.y = Math.PI - G.player.heading;
  } else if (kind === 'drive') {
    const car = G.parked[0];
    placeInCar(car, 30, 100, 0, 13);
  } else if (kind === 'chase') {
    const car = G.parked[1];
    placeInCar(car, 30, 60, 0, 17);
    G.wanted = 4;
    syncPolice(G, 0);
    // Pull the pursuit in close: two behind the player, two ahead on the
    // flanks so they are visible in the frame while the chase is on.
    const spots = [
      { x: 26, z: 78, heading: 0 },
      { x: 34, z: 78, heading: 0 },
      { x: 22, z: -20, heading: Math.PI },
      { x: 38, z: -20, heading: Math.PI },
    ];
    let i = 0;
    for (const pc of G.police) {
      if (!pc.active) continue;
      const sp = spots[i % spots.length];
      pc.pos.x = sp.x;
      pc.pos.z = sp.z;
      pc.heading = sp.heading;
      pc.speed = 15;
      pc.mesh.position.set(pc.pos.x, 0, pc.pos.z);
      i++;
    }
  } else if (kind === 'mission') {
    // On the z=30 road, heading east toward the Marina drop: a clear run
    // with the gold pillar visible ahead.
    const car = G.parked[2];
    placeInCar(car, 180, 30, Math.PI / 2, 6);
    startMission(G, 0);
  }
  G.staging = kind;
}

const shotParam = new URLSearchParams(window.location.search).get('shot');
if (shotParam && ['drive', 'foot', 'chase', 'mission'].includes(shotParam)) {
  stageForShot(shotParam);
}

// ---------------------------------------------------------------- debug handle

window.__game = {
  G,
  get ready() {
    return G.ready;
  },
  get time() {
    return G.time;
  },
  get mode() {
    return G.mode;
  },
  getState() {
    return {
      mode: G.mode,
      time: +G.time.toFixed(2),
      money: Math.round(G.save.money),
      missionsDone: G.save.missionsDone.slice(),
      wanted: G.wanted,
      health: Math.round(G.player.health),
      player: { x: +G.player.pos.x.toFixed(2), z: +G.player.pos.z.toFixed(2), heading: +G.player.heading.toFixed(3), onFoot: G.player.onFoot },
      car: G.car
        ? { x: +G.car.pos.x.toFixed(2), z: +G.car.pos.z.toFixed(2), speed: +G.car.speed.toFixed(2), health: Math.round(G.car.health), isCometa: G.car.isCometa, dead: G.car.dead }
        : null,
      mission: G.missions.active
        ? { index: G.missions.index, phase: G.missions.phase, timeLeft: +G.missions.timeLeft.toFixed(1), target: { x: G.missions.target.x, z: G.missions.target.z } }
        : null,
      policeActive: G.police.filter((c) => c.active).length,
      police: G.police.filter((c) => c.active).map((c) => ({ x: +c.pos.x.toFixed(1), z: +c.pos.z.toFixed(1), speed: +c.speed.toFixed(1) })),
      trafficAlive: G.traffic.filter((c) => !c.dead).length,
      pedsAlive: G.peds.filter((p) => p.alive).length,
      shotsFired: G.combat.shotsFired,
      buildings: G.city.buildingCount,
    };
  },
  teleport(x, z) {
    if (G.car) {
      G.car.pos.x = x;
      G.car.pos.z = z;
      G.car.speed = 0;
    } else {
      G.player.pos.x = x;
      G.player.pos.z = z;
    }
  },
  nearestPed() {
    let best = null;
    let bestD = 1e9;
    for (const p of G.peds) {
      if (!p.alive) continue;
      const d = Math.hypot(p.pos.x - G.player.pos.x, p.pos.z - G.player.pos.z);
      if (d < bestD) { bestD = d; best = p; }
    }
    return best ? { x: best.pos.x, z: best.pos.z, dist: bestD } : null;
  },
  nearestTraffic() {
    let best = null;
    let bestD = 1e9;
    const from = G.car ? G.car.pos : G.player.pos;
    for (const c of G.traffic) {
      if (c.dead) continue;
      const d = Math.hypot(c.pos.x - from.x, c.pos.z - from.z);
      if (d < bestD) { bestD = d; best = c; }
    }
    return best ? { x: best.pos.x, z: best.pos.z, dist: bestD } : null;
  },
  nearestParked() {
    let best = null;
    let bestD = 1e9;
    for (const c of G.parked) {
      const d = Math.hypot(c.pos.x - G.player.pos.x, c.pos.z - G.player.pos.z);
      if (d < bestD) { bestD = d; best = c; }
    }
    return best ? { x: best.pos.x, z: best.pos.z, dist: bestD, isCometa: best.isCometa } : null;
  },
  cometaPos() {
    return { x: G.cometa.pos.x, z: G.cometa.pos.z };
  },
  aimAt(x, z) {
    const from = G.car ? G.car.pos : G.player.pos;
    const h = Math.atan2(x - from.x, -(z - from.z));
    if (G.car) G.car.heading = h;
    else G.player.heading = h;
  },
  setHeading(h) {
    if (G.car) G.car.heading = h;
    else G.player.heading = h;
  },
  setWanted(n) {
    G.wanted = Math.max(0, Math.min(5, n));
    G.quietTime = 0;
    G.decayAcc = 0;
  },
  startMission(i) {
    return startMission(G, i);
  },
  enterNearestCar() {
    tryEnterCar();
  },
  exitCar() {
    if (G.car) exitCar(G);
  },
  shoot() {
    return shoot(G);
  },
  setTimeScale(n) {
    G.timeScale = n;
  },
  pressKey(code, down) {
    G.input.setKey(code, down);
  },
  startGame() {
    G.startGame();
  },
  respawn() {
    G.respawn();
  },
};

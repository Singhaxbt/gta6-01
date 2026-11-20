// missions.js — the story: 5 missions for Marisol Vega with briefings,
// objectives, win/fail states and growing payouts, plus side work: taxi fares,
// checkpoint street races, 12 hidden packages and stunt jumps.
import * as THREE from 'three';
import { makeRng } from './rng.js';

export const MISSION_DEFS = [
  { name: '1 · FIRST DELIVERY', brief: 'Marisol needs a package at the Miramar Hotel, beachfront. Rival couriers are on your tail — lose them and deliver it.', payout: 300 },
  { name: '2 · THE GETAWAY', brief: 'Pick up Marisol\'s driver in Old Town, then shake the Solmar PD and reach the hills safehouse. Two stars and climbing.', payout: 600 },
  { name: '3 · HARBOR HEIST', brief: 'A rival crew\'s crate sits in the harbor container yard. Grab it, fight off the guards, bring it downtown.', payout: 900 },
  { name: '4 · RESCUE AT THE BOARDWALK', brief: 'They grabbed one of ours on the boardwalk. Clear the crew holding him, then walk him to St. Lucia Hospital.', payout: 1200 },
  { name: '5 · SUNSET SHOWDOWN', brief: 'The crew boss waits at the harbor with his whole gang. End it at sunset. This is the finale.', payout: 2000 },
];

export const PACKAGE_SPOTS = [
  [52, -52], [-420, 0], [340, 300], [0, -430], [200, 200], [-180, -220],
  [120, 420], [-520, -420], [380, -420], [-60, 340], [260, -160], [-320, 460],
];

const RACE_CHECKPOINTS = [
  { x: 120, z: -200 }, { x: 260, z: -60 }, { x: 260, z: 200 },
  { x: 60, z: 260 }, { x: -160, z: 120 }, { x: -160, z: -200 },
];

export class MissionManager {
  constructor(scene, combat, city) {
    this.scene = scene;
    this.combat = combat;
    this.city = city;
    this.rng = makeRng(5150);
    this.active = null; // {index, phase, timer, ...}
    this.marker = null; // {x, z, label} current objective marker
    this.taxi = null; // {phase, from, to, fare}
    this.race = null; // {cp, startT, rivals}
    this.raceRivals = [];
    this.packages = [];
    this.packagesFound = [];
    this.zoneT = 0;
    this.escort = null; // rescued hostage follower
    this.buildPackages();
  }
  buildPackages() {
    const geo = new THREE.OctahedronGeometry(0.9);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffd54f });
    for (const [x, z] of PACKAGE_SPOTS) {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, 1.6, z);
      this.scene.add(m);
      this.packages.push({ x, z, mesh: m, found: false });
    }
  }
  nextMissionIndex(done) {
    for (let i = 0; i < 5; i++) if (!done[i]) return i;
    return -1;
  }
  missionStartPos(i) {
    return [
      { x: 0, z: 0 }, { x: -420, z: 0 }, { x: 100, z: 420 },
      { x: 340, z: -120 }, { x: 100, z: 480 },
    ][i];
  }
  startMission(i, game) {
    const def = MISSION_DEFS[i];
    this.active = { index: i, phase: 0, timer: 0, def };
    game.toast(def.name, def.brief);
    game.audio.stinger(true);
    const s = this.missionStartPos(i);
    this.marker = { x: s.x, z: s.z, label: def.name };
    if (i === 0) this.active.timer = 150;
    if (i === 1) this.active.timer = 0;
    if (i === 2) this.active.timer = 0;
    if (i === 3) this.active.timer = 0;
    if (i === 4) {
      this.combat.spawnSquad(100, 480, 4, 'thug');
      this.combat.spawnEnemy(140, 480, 'boss');
    }
    return true;
  }
  failMission(game, reason) {
    if (!this.active) return;
    game.toast('MISSION FAILED', reason);
    game.audio.stinger(false);
    this.combat.clearEnemies();
    this.clearRaceRivals();
    this.active = null;
    this.marker = null;
    this.escort = null;
  }
  completeMission(game) {
    const m = this.active;
    if (!m) return;
    const payout = m.def.payout;
    game.addCash(payout);
    game.state.missionsDone[m.index] = true;
    game.toast('MISSION COMPLETE', `${m.def.name} — +$${payout}`);
    game.audio.cash();
    game.slowMo(1.2);
    game.save();
    this.combat.clearEnemies();
    this.active = null;
    this.marker = null;
    this.escort = null;
    const next = this.nextMissionIndex(game.state.missionsDone);
    if (next >= 0) {
      const s = this.missionStartPos(next);
      this.marker = { x: s.x, z: s.z, label: `NEXT: ${MISSION_DEFS[next].name}` };
    }
  }
  clearRaceRivals() {
    for (const r of this.raceRivals) this.scene.remove(r.mesh);
    this.raceRivals = [];
  }
  // --- Side: taxi fare ---
  startTaxi(game) {
    if (this.taxi || this.active) return false;
    const p = game.playerPos();
    const from = { x: p.x + 60, z: p.z + 40 };
    const to = { x: this.rng.range(-400, 380), z: this.rng.range(-400, 500) };
    this.taxi = { phase: 'pickup', from, to, fare: 0 };
    this.marker = { x: from.x, z: from.z, label: 'PICK UP PASSENGER' };
    game.toast('TAXI FARE', 'Pick up the passenger at the yellow marker.');
    return true;
  }
  // --- Side: street race ---
  startRace(game) {
    if (this.race || this.active) return false;
    if (!game.inVehicle()) { game.toast('NEED A CAR', 'Street races need wheels. Grab a car first.'); return false; }
    this.race = { cp: 0, startT: game.time, rivals: [] };
    this.marker = { x: RACE_CHECKPOINTS[0].x, z: RACE_CHECKPOINTS[0].z, label: 'RACE CHECKPOINT 1/6' };
    game.toast('STREET RACE', 'Six checkpoints. Beat the rivals to the last one — $400 if you win.');
    // Two rival drivers in sports cars.
    const { Vehicle } = game.vehicleModule;
    for (let i = 0; i < 2; i++) {
      const v = new Vehicle('sports', game.playerPos().x - 8 - i * 6, game.playerPos().z + 8, 0, i ? 0x2e6b34 : 0x8a97a5);
      v.ai = true; v.aiPath = RACE_CHECKPOINTS; v.aiTarget = 0;
      this.scene.add(v.mesh);
      this.raceRivals.push(v);
      this.race.rivals.push(v);
    }
    return true;
  }
  update(dt, game) {
    const p = game.playerPos();
    // --- Hidden packages ---
    for (const pkg of this.packages) {
      if (pkg.found) continue;
      pkg.mesh.rotation.y += dt * 2;
      pkg.mesh.position.y = 1.6 + Math.sin(game.time * 2 + pkg.x) * 0.25;
      if (Math.hypot(p.x - pkg.x, p.z - pkg.z) < 3) {
        pkg.found = true;
        pkg.mesh.visible = false;
        game.state.packagesFound.push(`${pkg.x},${pkg.z}`);
        game.addCash(50);
        game.toast('HIDDEN PACKAGE', `+$50 — ${game.state.packagesFound.length}/12 found.`);
        game.audio.pickup();
        game.save();
      }
    }
    // --- Taxi ---
    if (this.taxi) {
      const t = this.taxi;
      const dest = t.phase === 'pickup' ? t.from : t.to;
      if (Math.hypot(p.x - dest.x, p.z - dest.z) < 6) {
        if (t.phase === 'pickup') {
          t.phase = 'dropoff';
          const dist = Math.hypot(t.to.x - t.from.x, t.to.y - t.from.y);
          t.fare = Math.round(30 + dist * 0.12);
          this.marker = { x: t.to.x, z: t.to.z, label: 'DROP OFF PASSENGER' };
          game.toast('PASSENGER IN', `Drop them off — fare $${t.fare}.`);
        } else {
          game.addCash(t.fare);
          game.toast('FARE COMPLETE', `+$${t.fare}. Nice driving, Dare.`);
          game.audio.cash();
          this.taxi = null;
          this.marker = this.active ? this.marker : null;
          game.save();
        }
      }
    }
    // --- Race ---
    if (this.race) {
      const r = this.race;
      const cp = RACE_CHECKPOINTS[r.cp];
      if (Math.hypot(p.x - cp.x, p.z - cp.z) < 10) {
        r.cp++;
        if (r.cp >= RACE_CHECKPOINTS.length) {
          const ms = Math.round((game.time - r.startT) * 1000);
          let won = true;
          for (const rv of r.rivals) if (rv.aiTarget >= RACE_CHECKPOINTS.length) won = false;
          const secs = (ms / 1000).toFixed(1);
          if (won) {
            game.addCash(400);
            game.toast('RACE WON', `+$400 — ${secs}s. Fastest in Solmar.`);
            game.audio.cash();
            if (!game.state.bestRaceMs || ms < game.state.bestRaceMs) game.state.bestRaceMs = ms;
          } else {
            game.toast('RACE LOST', `A rival finished first — ${secs}s. Run it back.`);
          }
          this.clearRaceRivals();
          this.race = null;
          this.marker = this.active ? this.marker : null;
          game.save();
        } else {
          this.marker = { x: RACE_CHECKPOINTS[r.cp].x, z: RACE_CHECKPOINTS[r.cp].z, label: `RACE CHECKPOINT ${r.cp + 1}/6` };
          game.audio.pickup();
        }
      }
      for (const rv of r.rivals) rv.updateAI(dt, this.city);
      // Rival finishes when its loop wraps.
      for (const rv of r.rivals) {
        if (rv.aiTarget === 0 && r.cp > 2) { /* rival lapped — keep racing */ }
      }
    }
    // --- Escort follower ---
    if (this.escort) {
      const e = this.escort;
      const dx = p.x - e.pos.x, dz = p.z - e.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > 3) {
        e.pos.x += (dx / d) * 4.2 * dt;
        e.pos.z += (dz / d) * 4.2 * dt;
        e.mesh.position.copy(e.pos);
        e.mesh.rotation.y = Math.atan2(dx, dz);
      }
    }
    // --- Story missions ---
    const m = this.active;
    if (!m) return;
    const near = (x, z, r) => Math.hypot(p.x - x, p.z - z) < r;
    if (m.index === 0) {
      m.timer -= dt;
      if (m.timer <= 0) return this.failMission(game, 'The package missed its window. Marisol is not happy.');
      if (m.phase === 0 && near(0, 0, 7)) {
        m.phase = 1;
        this.marker = { x: 380, z: -160, label: 'DELIVER TO MIRAMAR HOTEL' };
        game.toast('PACKAGE SECURED', 'Now get it to the Miramar Hotel — 150 seconds on the clock.');
      } else if (m.phase === 1 && near(380, -160, 8)) {
        return this.completeMission(game);
      }
    } else if (m.index === 1) {
      if (m.phase === 0 && near(-420, 0, 7)) {
        m.phase = 1;
        game.setWanted(2);
        this.marker = { x: 0, z: -430, label: 'REACH THE HILLS SAFEHOUSE' };
        game.toast('HE\'S IN — NOW RUN', 'The PD is on you. Reach the overlook safehouse in the hills.');
      } else if (m.phase === 1 && near(0, -430, 10)) {
        game.setWanted(0);
        return this.completeMission(game);
      }
    } else if (m.index === 2) {
      if (m.phase === 0 && near(100, 420, 7)) {
        m.phase = 1;
        this.zoneT = 0;
        this.combat.spawnSquad(120, 440, 3, 'thug');
        game.toast('CRATE SPOTTED', 'Hold the yard — grab the crate while the guards come at you.');
      } else if (m.phase === 1) {
        if (near(100, 420, 6)) {
          this.zoneT += dt;
          if (this.zoneT > 1.2) {
            m.phase = 2;
            this.marker = { x: -40, z: -40, label: 'DELIVER CRATE TO DOWNTOWN PLAZA' };
            game.toast('CRATE SECURED', 'Now get it to the downtown plaza.');
          }
        } else this.zoneT = Math.max(0, this.zoneT - dt);
        if (this.combat.aliveCount() === 0 && m.phase === 1) {
          // Guards cleared early — still need the crate hold.
        }
      } else if (m.phase === 2 && near(-40, -40, 8)) {
        return this.completeMission(game);
      }
    } else if (m.index === 3) {
      if (m.phase === 0 && near(340, -120, 10)) {
        m.phase = 1;
        this.combat.spawnSquad(340, -120, 5, 'thug');
        game.toast('THEY\'RE HOLDING HIM', 'Clear all five, then walk him to the hospital.');
      } else if (m.phase === 1 && this.combat.aliveCount() === 0) {
        m.phase = 2;
        // Spawn the rescued hostage as a follower.
        const hostage = new THREE.Group();
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.75, 0.32),
          new THREE.MeshLambertMaterial({ color: 0xf1c40f }));
        body.position.y = 1.0; hostage.add(body);
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.19, 10, 8),
          new THREE.MeshLambertMaterial({ color: 0xe0ac69 }));
        head.position.y = 1.6; hostage.add(head);
        hostage.position.set(340, 0, -120);
        this.scene.add(hostage);
        this.escort = { pos: new THREE.Vector3(340, 0, -120), mesh: hostage };
        this.marker = { x: -180, z: -180, label: 'ESCORT HIM TO ST. LUCIA HOSPITAL' };
        game.toast('HE\'S FREE', 'Walk him to St. Lucia Hospital — stay close, he follows you.');
      } else if (m.phase === 2 && near(-180, -180, 9)) {
        this.scene.remove(this.escort.mesh);
        return this.completeMission(game);
      }
    } else if (m.index === 4) {
      if (this.combat.aliveCount() === 0) {
        this.marker = { x: -20, z: -20, label: 'MEET MARISOL AT THE PLAZA' };
        if (near(-20, -20, 8)) return this.completeMission(game);
      }
    }
  }
}

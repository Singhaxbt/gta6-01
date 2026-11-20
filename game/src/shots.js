// shots.js — ?shot= staging for the four screenshots. Each scene is set up
// instantly and deterministically (no long simulated play), then main.js sets
// window.__shotReady after a few rendered frames so the capture is stable.
//
//   ?shot=drive   — sunset drive through downtown in the sports car
//   ?shot=mission — harbor heist gunfight with enemies and cover
//   ?shot=chase   — 4-star police chase with cars + helicopter
//   ?shot=vista   — harbor/beach vista from the hills overlook
import * as THREE from 'three';

export function stageShot(name, game) {
  const g = game;
  g.hideTitle();
  g.started = true;
  g.paused = false;
  // Golden sunset for every shot.
  g.clockHours = 17.7;
  g.setSunset();
  if (name === 'drive') {
    g.placePlayerInVehicle('sports', 85, 40, Math.PI, 0xd21f3c);
    g.vehicle.speed = 26;
    g.wanted = 0;
    g.state.cash = 2450;
    g.missions.marker = { x: 260, z: -60, label: 'DELIVER TO MIRAMAR HOTEL' };
    g.missions.active = { index: 0, phase: 1, timer: 132, def: { name: '1 · FIRST DELIVERY', brief: 'Deliver the package to the Miramar Hotel — 150 seconds on the clock.', payout: 300 } };
    g.cameraMode = 'drive';
  } else if (name === 'mission') {
    g.placePlayerOnFoot(95, 410, Math.PI / 4);
    g.wanted = 2;
    g.weapon = 'smg';
    g.state.cash = 3120;
    g.missions.active = { index: 2, phase: 1, timer: 0, def: { name: '3 · HARBOR HEIST', brief: 'Hold the yard — grab the crate while the guards come at you.', payout: 900 } };
    g.missions.marker = { x: 100, z: 420, label: 'GRAB THE CRATE' };
    g.missions.zoneT = 0.6;
    g.combat.spawnSquad(105, 425, 4, 'thug');
    g.combat.spawnEnemy(130, 445, 'thug');
    // A gunfire tracer already in the air for the frame.
    g.combat.fireTracer(new THREE.Vector3(105, 1.4, 425), new THREE.Vector3(95, 1.2, 410), 0xffe082);
    g.cameraMode = 'foot';
  } else if (name === 'chase') {
    g.placePlayerInVehicle('sports', -40, 120, -Math.PI / 2, 0xd21f3c);
    g.vehicle.speed = 38;
    g.wanted = 4;
    g.state.cash = 4860;
    g.missions.marker = { x: 0, z: -430, label: 'REACH THE HILLS SAFEHOUSE' };
    g.missions.active = { index: 1, phase: 1, timer: 0, def: { name: '2 · THE GETAWAY', brief: 'The PD is on you. Reach the overlook safehouse in the hills.', payout: 600 } };
    g.police.spawnCarNear(g.playerPos());
    g.police.spawnCarNear(g.playerPos());
    g.police.spawnCarNear(g.playerPos());
    g.police.ensureHeli();
    g.police.heliAngle = -Math.PI / 2 - 0.4; // helicopter ahead of the car, in frame
    g.cameraMode = 'chase';
  } else { // vista
    g.placePlayerInVehicle('sports', 420, 200, Math.PI, 0xd21f3c);
    g.vehicle.speed = 0;
    g.wanted = 0;
    g.state.cash = 5800;
    g.missions.marker = { x: 340, z: 300, label: 'HARBOR — NEXT: SUNSET SHOWDOWN' };
    g.missions.active = { index: 4, phase: 0, timer: 0, def: { name: '5 · SUNSET SHOWDOWN', brief: 'The crew boss waits at the harbor with his whole gang. End it at sunset.', payout: 2000 } };
    // Keep the finale gang alive so the marker stays on the harbor.
    g.combat.spawnSquad(100, 480, 3, 'thug');
    g.cameraMode = 'vista';
  }
  g.hud.update(0, g);
}

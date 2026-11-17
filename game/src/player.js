// player.js — Dario on foot and behind the wheel, plus busted/wasted.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { clamp, resolveCircle } from './util.js';

export function createPlayerMesh() {
  const group = new THREE.Group();
  const shirt = new THREE.MeshLambertMaterial({ color: PALETTE.playerShirt });
  const pants = new THREE.MeshLambertMaterial({ color: PALETTE.playerPants });
  const skin = new THREE.MeshLambertMaterial({ color: 0xe8b88a });
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.8, 0.32), pants);
  legs.position.y = 0.4;
  group.add(legs);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.7, 0.36), shirt);
  torso.position.y = 1.15;
  group.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.42, 0.4), skin);
  head.position.y = 1.72;
  group.add(head);
  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.14, 0.44), new THREE.MeshLambertMaterial({ color: 0xd43a2f }));
  cap.position.y = 1.96;
  group.add(cap);
  // Pistol in the right hand.
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 0.42), new THREE.MeshLambertMaterial({ color: 0x222222 }));
  gun.position.set(0.36, 1.2, 0.28);
  group.add(gun);
  group.userData.gun = gun;
  return group;
}

export function makePlayer(mesh) {
  return {
    mesh,
    pos: { x: 10, z: 14 },
    heading: Math.PI, // facing the plaza / south
    health: 100,
    onFoot: true,
    walkSpeed: 4.2,
    runSpeed: 8.4,
    moving: false,
    speed: 0,
  };
}

/** On-foot movement: W/S forward/back, A/D turn, Shift run. */
export function stepPlayerOnFoot(G, dt) {
  const p = G.player;
  const input = G.input;
  const turn = (input.down('KeyD') ? 1 : 0) - (input.down('KeyA') ? 1 : 0);
  p.heading += turn * 2.6 * dt;
  const fwd = (input.down('KeyW') ? 1 : 0) - (input.down('KeyS') ? 1 : 0);
  const running = input.down('ShiftLeft') || input.down('ShiftRight');
  const speed = running ? p.runSpeed : p.walkSpeed;
  p.speed = fwd * speed;
  p.moving = fwd !== 0;
  if (fwd !== 0) {
    const nx = p.pos.x + Math.sin(p.heading) * p.speed * dt;
    const nz = p.pos.z - Math.cos(p.heading) * p.speed * dt;
    const trial = { x: nx, z: nz };
    resolveCircle(trial, 0.55, G.city.colliders);
    p.pos.x = clamp(trial.x, -178, 248);
    p.pos.z = clamp(trial.z, -178, 178);
  }
  // Gentle walk bob.
  const bob = p.moving ? Math.sin(G.time * 11) * 0.05 : 0;
  p.mesh.position.set(p.pos.x, bob, p.pos.z);
  p.mesh.rotation.y = Math.PI - p.heading; // model faces +Z; heading 0 faces -Z
}

/** Third-person camera: behind the player on foot, or behind the car. */
export function updateCamera(G, dt) {
  const cam = G.camera;
  const target = new THREE.Vector3();
  let back = 7;
  let height = 3.4;
  if (G.car) {
    const c = G.car;
    target.set(c.pos.x, 0, c.pos.z);
    back = 10.5;
    height = 4.6;
    var heading = c.heading;
  } else {
    const p = G.player;
    target.set(p.pos.x, 0, p.pos.z);
    var heading = p.heading;
  }
  const desired = new THREE.Vector3(
    target.x - Math.sin(heading) * back,
    height,
    target.z + Math.cos(heading) * back,
  );
  const k = 1 - Math.exp(-6 * dt);
  cam.position.lerp(desired, k);
  // Look a little ahead of the player at torso height, so the crosshair ray
  // (the shot line) passes through a pedestrian's chest at close range
  // instead of diving under them.
  cam.lookAt(
    target.x + Math.sin(heading) * 4,
    1.2,
    target.z - Math.cos(heading) * 4,
  );
}

/** Put Dario in a car (or out of it). */
export function enterCar(G, car) {
  G.car = car;
  car.isParked = false;
  G.player.onFoot = false;
  G.player.mesh.visible = false;
}

export function exitCar(G) {
  const car = G.car;
  if (!car) return;
  const px = car.pos.x - Math.sin(car.heading) * 2.6;
  const pz = car.pos.z + Math.cos(car.heading) * 2.6;
  const trial = { x: px, z: pz };
  resolveCircle(trial, 0.55, G.city.colliders);
  G.player.pos.x = clamp(trial.x, -178, 248);
  G.player.pos.z = clamp(trial.z, -178, 178);
  G.player.heading = car.heading;
  G.player.mesh.visible = true;
  G.player.mesh.position.set(G.player.pos.x, 0, G.player.pos.z);
  G.player.mesh.rotation.y = Math.PI - G.player.heading;
  G.player.onFoot = true;
  G.car = null;
}

/** Hospital respawn after busted/wasted: costs $200, clears wanted. */
export function respawnAtHospital(G) {
  const h = G.city.landmarks.hospital;
  G.player.pos.x = h.x - 24;
  G.player.pos.z = h.z + 18;
  G.player.heading = Math.PI / 2;
  G.player.health = 100;
  G.player.mesh.visible = true;
  G.player.mesh.position.set(G.player.pos.x, 0, G.player.pos.z);
  G.player.onFoot = true;
  if (G.car) {
    G.car.speed = 0;
    G.car = null;
  }
  G.wanted = 0;
  G.quietTime = 0;
  G.save.money = Math.max(0, G.save.money - 200);
  G.mode = 'playing';
}

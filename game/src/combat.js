// combat.js — pistol with raycast shooting, tracer, muzzle flash and the
// wanted consequences of pulling the trigger.
import * as THREE from 'three';
import { killPedestrian } from './traffic.js';

export function createCombat(scene) {
  const tracerMat = new THREE.LineBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0 });
  const tracerGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(), new THREE.Vector3(),
  ]);
  const tracer = new THREE.Line(tracerGeo, tracerMat);
  tracer.visible = false;
  tracer.frustumCulled = false;
  scene.add(tracer);
  const flash = new THREE.Mesh(
    new THREE.SphereGeometry(0.22, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0 }),
  );
  flash.visible = false;
  scene.add(flash);
  return {
    tracer,
    flash,
    cooldown: 0,
    tracerT: 0,
    flashT: 0,
    shotsFired: 0,
    lastShotPos: null,
  };
}

/**
 * Fire one shot from the camera through the crosshair. Returns a hit report
 * or null. Raycasts against pedestrians, police cars, traffic cars and
 * parked cars (buildings block the shot via a cheap AABB test).
 */
export function shoot(G) {
  const combat = G.combat;
  if (combat.cooldown > 0 || G.mode !== 'playing') return null;
  combat.cooldown = 0.25;
  combat.shotsFired++;
  G.audio.gunshot();
  const cam = G.camera;
  const origin = cam.position.clone();
  // Aim from the camera toward a point 8 m ahead of Dario (or the car) at
  // torso height, using the CURRENT heading — not the camera's last frame,
  // which lags a turn by a frame. The ray then crosses torso height
  // (y ≈ 1.2) through the whole 2–8 m engagement band.
  const base = G.player.onFoot ? G.player.pos : G.car.pos;
  const heading = G.player.onFoot ? G.player.heading : G.car.heading;
  const aimPoint = new THREE.Vector3(
    base.x + Math.sin(heading) * 8,
    1.2,
    base.z - Math.cos(heading) * 8,
  );
  const dir = aimPoint.clone().sub(origin).normalize();
  const muzzle = G.player.onFoot
    ? new THREE.Vector3(G.player.pos.x, 1.25, G.player.pos.z)
    : new THREE.Vector3(G.car.pos.x, 1.2, G.car.pos.z);
  const maxRange = 90;
  let bestT = maxRange;
  let bestKind = null;
  let bestTarget = null;
  const tmp = new THREE.Vector3();

  const testSphere = (center, radius, kind, target) => {
    tmp.copy(center).sub(origin);
    const tca = tmp.dot(dir);
    if (tca < 0) return;
    const d2 = tmp.lengthSq() - tca * tca;
    if (d2 > radius * radius) return;
    const t = tca - Math.sqrt(radius * radius - d2);
    if (t < bestT) {
      bestT = t;
      bestKind = kind;
      bestTarget = target;
    }
  };

  // Buildings block the shot: test the ray against their AABBs first.
  const rayBox = (b) => {
    let tmin = 0;
    let tmax = bestT;
    const o = [origin.x, 0, origin.z];
    const d = [dir.x, dir.y, dir.z];
    const mn = [b.minX, 0, b.minZ];
    const mx = [b.maxX, 30, b.maxZ];
    for (let i = 0; i < 3; i++) {
      if (Math.abs(d[i]) < 1e-8) {
        if (o[i] < mn[i] || o[i] > mx[i]) return;
      } else {
        let t1 = (mn[i] - o[i]) / d[i];
        let t2 = (mx[i] - o[i]) / d[i];
        if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
        tmin = Math.max(tmin, t1);
        tmax = Math.min(tmax, t2);
        if (tmin > tmax) return;
      }
    }
    if (tmin < bestT) {
      // A ray starting inside a building (camera behind the player, clipped
      // into a wall) must not block the shot: only count a real crossing.
      if (tmin <= 0) return;
      bestT = tmin;
      bestKind = 'wall';
      bestTarget = null;
    }
  };
  for (const b of G.city.colliders.boxes) rayBox(b);

  for (const ped of G.peds) {
    if (!ped.alive) continue;
    testSphere(new THREE.Vector3(ped.pos.x, 1.2, ped.pos.z), 1.1, 'ped', ped);
  }
  for (const car of G.police) {
    if (!car.active || car.dead) continue;
    testSphere(new THREE.Vector3(car.pos.x, 1, car.pos.z), 2.4, 'police', car);
  }
  for (const car of G.traffic) {
    if (car.dead) continue;
    testSphere(new THREE.Vector3(car.pos.x, 1, car.pos.z), 2.4, 'traffic', car);
  }
  for (const car of G.parked) {
    if (car === G.car) continue;
    testSphere(new THREE.Vector3(car.pos.x, 1, car.pos.z), 2.4, 'parked', car);
  }

  const end = origin.clone().addScaledVector(dir, bestT);
  // Tracer + muzzle flash.
  const pos = combat.tracer.geometry.attributes.position;
  pos.setXYZ(0, muzzle.x, muzzle.y, muzzle.z);
  pos.setXYZ(1, end.x, end.y, end.z);
  pos.needsUpdate = true;
  combat.tracer.visible = true;
  combat.tracer.material.opacity = 0.9;
  combat.tracerT = 0.09;
  combat.flash.position.copy(muzzle).addScaledVector(dir, 0.5);
  combat.flash.visible = true;
  combat.flash.material.opacity = 1;
  combat.flashT = 0.05;

  const report = { kind: bestKind, range: bestT };
  if (bestKind === 'ped') {
    G.addWanted(1, 'Shot a pedestrian');
    G.hud.toast('You shot a pedestrian! The heat is on.');
    combat.lastShotPos = { x: bestTarget.pos.x, z: bestTarget.pos.z };
    killPedestrian(bestTarget);
  } else if (bestKind === 'police') {
    bestTarget.health -= 34;
    G.addWanted(1, 'Shot a police car');
    combat.lastShotPos = { x: bestTarget.pos.x, z: bestTarget.pos.z };
    if (bestTarget.health <= 0 && !bestTarget.dead) {
      bestTarget.dead = true;
      bestTarget.active = false;
      bestTarget.mesh.visible = false;
      G.hud.toast('Police car destroyed!');
    }
  } else if (bestKind === 'traffic') {
    bestTarget.health -= 50;
    if (!bestTarget.hitFlagged) {
      bestTarget.hitFlagged = true;
      G.addWanted(1, 'Shot a traffic car');
    }
    combat.lastShotPos = { x: bestTarget.pos.x, z: bestTarget.pos.z };
    if (bestTarget.health <= 0) {
      bestTarget.dead = true;
      bestTarget.speed = 0;
      G.hud.toast('You wrecked a traffic car!');
    }
  } else if (bestKind === 'parked') {
    bestTarget.health -= 25;
  } else {
    combat.lastShotPos = { x: G.player.pos.x, z: G.player.pos.z };
  }
  return report;
}

export function stepCombat(G, dt) {
  const c = G.combat;
  c.cooldown = Math.max(0, c.cooldown - dt);
  if (c.tracerT > 0) {
    c.tracerT -= dt;
    if (c.tracerT <= 0) {
      c.tracer.visible = false;
    } else {
      c.tracer.material.opacity = c.tracerT / 0.09;
    }
  }
  if (c.flashT > 0) {
    c.flashT -= dt;
    if (c.flashT <= 0) c.flash.visible = false;
  }
}

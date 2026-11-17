// police.js — wanted-level pursuit. The number of police cars on the road
// always matches the wanted stars (1-5). They chase, ram, and bust Dario
// on foot when they touch him.
import * as THREE from 'three';
import { createCarMesh, makeCar } from './vehicles.js';
import { clamp, resolveCircle } from './util.js';

/** +1 when the target sits to the right of `heading`, -1 to the left. */
function angleDiffSign(heading, target) {
  const d = ((target - Math.PI - heading * 3) % (Math.PI * 2)) - Math.PI;
  return d >= 0 ? 1 : -1;
}

export function createPolicePool(scene) {
  const pool = [];
  for (let i = 0; i < 5; i++) {
    const mesh = createCarMesh(0x1a1a22, { police: true });
    mesh.visible = false;
    scene.add(mesh);
    const car = makeCar(mesh, 0, 0, 0, {
      isPolice: true, maxSpeed: 30, accel: 17,
    });
    car.active = false;
    car.ramCooldown = 0;
    car.flashT = 0;
    car.avoidT = 0;
    car.avoidSign = 1;
    car.route = [];
    car.routeT = 0;
    pool.push(car);
  }
  return pool;
}

/** Pick a road point 35-65m from the player, on a road, for a spawn. */
function spawnPoint(G, rng) {
  const roads = G.city.roads;
  let best = null;
  let bestScore = Infinity;
  for (let tries = 0; tries < 12; tries++) {
    const alongRoad = rng() < 0.5;
    let x;
    let z;
    if (alongRoad) {
      x = roads.xs[Math.floor(rng() * roads.xs.length)];
      z = G.player.pos.z + (rng() < 0.5 ? -1 : 1) * (35 + rng() * 20);
    } else {
      z = roads.zs[Math.floor(rng() * roads.zs.length)];
      x = G.player.pos.x + (rng() < 0.5 ? -1 : 1) * (35 + rng() * 20);
    }
    x = clamp(x, -175, 175);
    z = clamp(z, -175, 175);
    const d = Math.hypot(x - G.player.pos.x, z - G.player.pos.z);
    const score = d < 35 ? 35 - d : d > 65 ? d - 65 : 0;
    if (score < bestScore) {
      bestScore = score;
      best = { x, z };
      if (score === 0) break;
    }
  }
  return best ?? { x: G.player.pos.x + 50, z: G.player.pos.z };
}

/** The road intersection nearest a point. */
function nearestIntersection(roads, x, z) {
  let best = null;
  let bestD = Infinity;
  for (const ix of roads.xs) {
    for (const iz of roads.zs) {
      const d = Math.hypot(ix - x, iz - z);
      if (d < bestD) {
        bestD = d;
        best = { x: ix, z: iz };
      }
    }
  }
  return best;
}

/**
 * A two-leg Manhattan route along roads: from the intersection nearest the
 * car, along its row to the column of the intersection nearest the target,
 * then along that column to the target's intersection. Both legs run on
 * roads, so no building ever blocks the way.
 */
function routeFor(roads, from, to) {
  const a = nearestIntersection(roads, from.x, from.z);
  const b = nearestIntersection(roads, to.x, to.z);
  const route = [];
  if (Math.hypot(a.x - b.x, a.z - b.z) > 4) {
    route.push({ x: b.x, z: a.z });
  }
  route.push(b);
  return route.filter((wp) => Math.hypot(wp.x - from.x, wp.z - from.z) > 6);
}

/** Keep active police count == wanted stars. */
export function syncPolice(G, dt) {
  const rng = G.rng;
  let active = 0;
  for (const car of G.police) if (car.active) active++;
  // Spawn up to the wanted level.
  for (const car of G.police) {
    if (active >= G.wanted) break;
    if (car.active) continue;
    const sp = spawnPoint(G, rng);
    car.pos.x = sp.x;
    car.pos.z = sp.z;
    car.heading = Math.atan2(G.player.pos.x - sp.x, -(G.player.pos.z - sp.z));
    car.speed = 8;
    car.health = 100;
    car.dead = false;
    car.active = true;
    car.mesh.visible = true;
    car.mesh.position.set(sp.x, 0, sp.z);
    active++;
  }
  // Despawn extras when the heat drops.
  for (const car of G.police) {
    if (active <= G.wanted) break;
    if (!car.active) continue;
    car.active = false;
    car.mesh.visible = false;
    car.speed = 0;
    active--;
  }
}

export function stepPolice(G, dt) {
  const playerPos = G.car ? { x: G.car.pos.x, z: G.car.pos.z } : { x: G.player.pos.x, z: G.player.pos.z };
  for (const car of G.police) {
    if (!car.active || car.dead) continue;
    car.ramCooldown = Math.max(0, car.ramCooldown - dt);
    const distToPlayer = Math.hypot(playerPos.x - car.pos.x, playerPos.z - car.pos.z);
    // Far away: follow the road route. Close in: chase directly.
    let target = playerPos;
    if (distToPlayer > 24) {
      car.routeT -= dt;
      if (car.route.length === 0 || car.routeT <= 0) {
        car.route = routeFor(G.city.roads, car.pos, playerPos);
        car.routeT = 2.5;
      }
      if (car.route.length > 0) {
        target = car.route[0];
        if (Math.hypot(target.x - car.pos.x, target.z - car.pos.z) < 6) {
          car.route.shift();
          if (car.route.length > 0) target = car.route[0];
          else target = playerPos;
        }
      }
    } else {
      car.route = [];
    }
    const dx = target.x - car.pos.x;
    const dz = target.z - car.pos.z;
    const dist = Math.hypot(dx, dz);
    // Despawn a straggler that fell far behind; a fresh one spawns closer.
    if (distToPlayer > 170) {
      const sp = spawnPoint(G, G.rng);
      car.pos.x = sp.x;
      car.pos.z = sp.z;
      car.speed = 10;
      car.route = [];
      car.mesh.position.set(sp.x, 0, sp.z);
      continue;
    }
    const targetHeading = Math.atan2(dx, -dz);
    // Unstick: after hitting a wall, steer around it for a moment instead
    // of grinding straight into the building.
    if (car.avoidT > 0) {
      car.avoidT -= dt;
      var steerTarget = targetHeading + car.avoidSign * 1.3;
    } else {
      var steerTarget = targetHeading;
    }
    const steer = clamp(((steerTarget - Math.PI - car.heading * 3) % (Math.PI * 2)) - Math.PI, -1, 1);
    car.heading += steer * 2.6 * dt * clamp(Math.abs(car.speed) / 8, 0.3, 1);
    car.speed = clamp(car.speed + car.accel * dt, 0, car.maxSpeed);
    const nx = car.pos.x + Math.sin(car.heading) * car.speed * dt;
    const nz = car.pos.z - Math.cos(car.heading) * car.speed * dt;
    const trial = { x: nx, z: nz };
    const hitWall = resolveCircle(trial, 1.6, G.city.colliders);
    if (hitWall) {
      car.speed *= 0.4;
      if (car.avoidT <= 0) {
        car.avoidT = 1.0;
        car.avoidSign = angleDiffSign(car.heading, targetHeading);
      }
    }
    car.pos.x = trial.x;
    car.pos.z = trial.z;
    car.mesh.position.set(car.pos.x, 0, car.pos.z);
    car.mesh.rotation.y = Math.PI - car.heading;
    // Flashing light bar.
    car.flashT += dt;
    const phase = Math.floor(car.flashT * 6) % 2 === 0;
    if (car.mesh.userData.lightL) {
      car.mesh.userData.lightL.material.color.setHex(phase ? 0xff2222 : 0x551111);
      car.mesh.userData.lightR.material.color.setHex(phase ? 0x111155 : 0x2244ff);
    }
    // Ram the player's car, or bust Dario on foot.
    if (distToPlayer < 3.2 && car.ramCooldown <= 0) {
      car.ramCooldown = 1.2;
      if (G.car) {
        G.car.health -= 9;
        car.health -= 4;
        G.car.speed *= 0.6;
        car.speed *= 0.5;
        G.hud.toast('Police rammed your car!');
      } else {
        G.busted = true;
      }
    }
  }
}

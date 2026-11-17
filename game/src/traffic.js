// traffic.js — 10 cars looping road routes with gap-keeping, and 24
// pedestrians who wander the sidewalks and flee from gunfire.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { createCarMesh, makeCar } from './vehicles.js';
import { mulberry32, randRange, pick, turnToward, clamp } from './util.js';

export function createTraffic(scene, rng) {
  const cars = [];
  const roadXs = [-150, -90, -30, 30, 90, 150];
  const roadZs = [-150, -90, -30, 30, 90, 150];
  for (let i = 0; i < 10; i++) {
    // A rectangular loop: two x-roads and two z-roads.
    const x1 = pick(rng, roadXs);
    let x2 = pick(rng, roadXs);
    if (x2 === x1) x2 = x1 === 150 ? 90 : x1 + 60;
    const z1 = pick(rng, roadZs);
    let z2 = pick(rng, roadZs);
    if (z2 === z1) z2 = z1 === 150 ? 90 : z1 + 60;
    const loop = [
      { x: x1, z: z1 }, { x: x2, z: z1 }, { x: x2, z: z2 }, { x: x1, z: z2 },
    ];
    const start = loop[Math.floor(rng() * 4)];
    const color = PALETTE.carColors[Math.floor(rng() * PALETTE.carColors.length)];
    const mesh = createCarMesh(color);
    scene.add(mesh);
    const car = makeCar(mesh, start.x, start.z, 0, {
      isTraffic: true, maxSpeed: randRange(rng, 7, 10), accel: 6,
    });
    car.loop = loop;
    car.wp = Math.floor(rng() * 4);
    car.cruise = car.maxSpeed;
    cars.push(car);
  }
  return cars;
}

export function stepTraffic(cars, dt, colliders) {
  for (const car of cars) {
    if (car.dead) continue;
    const wp = car.loop[car.wp];
    const dx = wp.x - car.pos.x;
    const dz = wp.z - car.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 3) {
      car.wp = (car.wp + 1) % car.loop.length;
      continue;
    }
    // Face along the road toward the waypoint: heading 0 faces -Z.
    const targetHeading = Math.atan2(dx, -dz);
    car.heading = turnToward(car.heading, targetHeading, 2.4 * dt);
    // Gap-keeping: slow down if another traffic car is just ahead.
    let desired = car.cruise;
    for (const other of cars) {
      if (other === car || other.dead) continue;
      const ox = other.pos.x - car.pos.x;
      const oz = other.pos.z - car.pos.z;
      const od = Math.hypot(ox, oz);
      if (od < 9) {
        const ahead = ox * Math.sin(car.heading) - oz * Math.cos(car.heading);
        if (ahead > 0) desired = Math.min(desired, other.speed * 0.8);
      }
    }
    const accel = desired > car.speed ? 6 : -14;
    car.speed = clamp(car.speed + accel * dt, 0, car.cruise);
    car.pos.x += Math.sin(car.heading) * car.speed * dt;
    car.pos.z -= Math.cos(car.heading) * car.speed * dt;
    car.mesh.position.set(car.pos.x, 0, car.pos.z);
    car.mesh.rotation.y = Math.PI - car.heading;
  }
}

// ---------------------------------------------------------------- pedestrians

export function createPedestrians(scene, rng) {
  const peds = [];
  const shirtGeo = new THREE.BoxGeometry(0.55, 0.65, 0.32);
  const legsGeo = new THREE.BoxGeometry(0.45, 0.75, 0.3);
  const headGeo = new THREE.BoxGeometry(0.38, 0.4, 0.38);
  const skinMat = new THREE.MeshLambertMaterial({ color: 0xe8b88a });
  const pantsMat = new THREE.MeshLambertMaterial({ color: 0x2a2a30 });
  for (let i = 0; i < 24; i++) {
    const group = new THREE.Group();
    const shirt = new THREE.Mesh(shirtGeo, new THREE.MeshLambertMaterial({ color: pick(rng, PALETTE.pedShirts) }));
    shirt.position.y = 1.1;
    group.add(shirt);
    const legs = new THREE.Mesh(legsGeo, pantsMat);
    legs.position.y = 0.38;
    group.add(legs);
    const head = new THREE.Mesh(headGeo, skinMat);
    head.position.y = 1.65;
    group.add(head);
    const x = randRange(rng, -170, 180);
    const z = randRange(rng, -170, 170);
    group.position.set(x, 0, z);
    scene.add(group);
    peds.push({
      mesh: group,
      pos: { x, z },
      heading: rng() * Math.PI * 2,
      target: { x: randRange(rng, -170, 180), z: randRange(rng, -170, 170) },
      speed: randRange(rng, 1.2, 2.2),
      alive: true,
      fleeT: 0,
      fallT: 0,
      seed: rng(),
    });
  }
  return peds;
}

export function stepPedestrians(peds, dt, time, colliders, gunshotPos) {
  for (const ped of peds) {
    if (!ped.alive) {
      // Fallen pedestrians fade out after a few seconds.
      ped.fallT += dt;
      if (ped.fallT > 5) ped.mesh.visible = false;
      continue;
    }
    if (gunshotPos) {
      const d = Math.hypot(ped.pos.x - gunshotPos.x, ped.pos.z - gunshotPos.z);
      if (d < 22) {
        ped.fleeT = 3;
        ped.target = {
          x: ped.pos.x + (ped.pos.x - gunshotPos.x) * 2,
          z: ped.pos.z + (ped.pos.z - gunshotPos.z) * 2,
        };
      }
    }
    const fleeing = ped.fleeT > 0;
    if (fleeing) ped.fleeT -= dt;
    const dx = ped.target.x - ped.pos.x;
    const dz = ped.target.z - ped.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 2) {
      ped.target = {
        x: clamp(ped.pos.x + (Math.random() - 0.5) * 60, -175, 185),
        z: clamp(ped.pos.z + (Math.random() - 0.5) * 60, -175, 175),
      };
      continue;
    }
    const targetHeading = Math.atan2(dx, -dz);
    ped.heading = turnToward(ped.heading, targetHeading, 3 * dt);
    const speed = fleeing ? ped.speed * 3.2 : ped.speed;
    ped.pos.x += Math.sin(ped.heading) * speed * dt;
    ped.pos.z -= Math.cos(ped.heading) * speed * dt;
    ped.pos.x = clamp(ped.pos.x, -176, 186);
    ped.pos.z = clamp(ped.pos.z, -176, 176);
    ped.mesh.position.set(ped.pos.x, Math.abs(Math.sin(time * 8 + ped.seed * 9)) * 0.04, ped.pos.z);
    ped.mesh.rotation.y = Math.PI - ped.heading;
  }
}

/** A pedestrian is shot: they fall over and stay down. */
export function killPedestrian(ped) {
  if (!ped.alive) return false;
  ped.alive = false;
  ped.fallT = 0;
  ped.mesh.rotation.x = -Math.PI / 2;
  ped.mesh.position.y = 0.3;
  return true;
}

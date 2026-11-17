// vehicles.js — car meshes and arcade car physics, shared by parked cars,
// traffic and police. A car is { mesh, pos, heading, speed, health, ... }.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { clamp, resolveCircle } from './util.js';

export function createCarMesh(color, opts = {}) {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color });
  const darkMat = new THREE.MeshLambertMaterial({ color: 0x1a1a20 });
  const glassMat = new THREE.MeshLambertMaterial({ color: 0x9fd8e8, transparent: true, opacity: 0.75 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.62, 4.4), bodyMat);
  body.position.y = 0.55;
  group.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.55, 2.2), opts.police ? bodyMat : glassMat);
  cabin.position.set(0, 1.1, -0.25);
  group.add(cabin);
  const wheelGeo = new THREE.BoxGeometry(0.34, 0.62, 0.62);
  for (const [wx, wz] of [[-0.95, 1.45], [0.95, 1.45], [-0.95, -1.45], [0.95, -1.45]]) {
    const wheel = new THREE.Mesh(wheelGeo, darkMat);
    wheel.position.set(wx, 0.31, wz);
    group.add(wheel);
  }
  if (opts.police) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.22, 0.5), new THREE.MeshLambertMaterial({ color: 0xdddddd }));
    bar.position.set(0, 1.45, -0.25);
    group.add(bar);
    const lightL = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.2, 0.4),
      new THREE.MeshBasicMaterial({ color: 0xff2222 }),
    );
    lightL.position.set(-0.32, 1.6, -0.25);
    group.add(lightL);
    const lightR = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.2, 0.4),
      new THREE.MeshBasicMaterial({ color: 0x2244ff }),
    );
    lightR.position.set(0.32, 1.6, -0.25);
    group.add(lightR);
    group.userData.lightL = lightL;
    group.userData.lightR = lightR;
  }
  // Headlights.
  const headMat = new THREE.MeshBasicMaterial({ color: 0xfff6c8 });
  for (const wx of [-0.6, 0.6]) {
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.18, 0.1), headMat);
    head.position.set(wx, 0.6, 2.22);
    group.add(head);
  }
  // Damage smoke: a small grey puff that grows as health drops.
  const smoke = new THREE.Mesh(
    new THREE.SphereGeometry(0.7, 8, 6),
    new THREE.MeshLambertMaterial({ color: 0x555555, transparent: true, opacity: 0 }),
  );
  smoke.position.set(0, 1.4, 1.2);
  group.add(smoke);
  group.userData.smoke = smoke;
  return group;
}

/** A fresh car state object. heading 0 faces -Z (north). */
export function makeCar(mesh, x, z, heading, opts = {}) {
  return {
    mesh,
    pos: { x, z },
    heading,
    speed: 0,
    health: 100,
    maxSpeed: opts.maxSpeed ?? 26,
    accel: opts.accel ?? 14,
    isCometa: opts.isCometa ?? false,
    isPolice: opts.isPolice ?? false,
    isTraffic: opts.isTraffic ?? false,
    isParked: opts.isParked ?? false,
    dead: false,
    hitFlagged: false, // wanted already raised by shooting this car
    smokeT: 0,
  };
}

/** Step arcade driving physics for one car. input: {throttle, steer, handbrake}. */
export function stepCarPhysics(car, input, dt, colliders, onCollide) {
  if (car.dead) return;
  const prevSpeed = car.speed;
  if (input.handbrake) {
    car.speed = THREE.MathUtils.damp(car.speed, 0, 6, dt);
  } else if (input.throttle > 0) {
    car.speed += car.accel * input.throttle * dt;
  } else if (input.throttle < 0) {
    // Brake, then reverse slowly.
    if (car.speed > 0.5) car.speed -= car.accel * 1.6 * dt;
    else car.speed += car.accel * 0.45 * input.throttle * dt;
  } else {
    car.speed = THREE.MathUtils.damp(car.speed, 0, 0.9, dt);
  }
  car.speed = clamp(car.speed, -9, car.maxSpeed);
  const steerAuthority = clamp(Math.abs(car.speed) / 6, 0, 1);
  car.heading += input.steer * 1.9 * steerAuthority * Math.sign(car.speed || 1) * dt;
  const nx = car.pos.x + Math.sin(car.heading) * car.speed * dt;
  const nz = car.pos.z - Math.cos(car.heading) * car.speed * dt;
  const trial = { x: nx, z: nz };
  const hitWall = resolveCircle(trial, 1.6, colliders);
  if (hitWall) {
    if (Math.abs(prevSpeed) > 6 && onCollide) onCollide(Math.abs(prevSpeed));
    car.speed *= -0.25;
    car.health -= Math.abs(prevSpeed) * 0.55;
  }
  car.pos.x = trial.x;
  car.pos.z = trial.z;
  // World bounds: the sea is not drivable, and neither is far out of town.
  car.pos.x = clamp(car.pos.x, -178, 246);
  car.pos.z = clamp(car.pos.z, -178, 178);
  car.mesh.position.set(car.pos.x, 0, car.pos.z);
  car.mesh.rotation.y = Math.PI - car.heading; // body built facing +Z; heading 0 faces -Z
  // Damage smoke.
  const smoke = car.mesh.userData.smoke;
  if (smoke) {
    const damaged = car.health < 55;
    smoke.material.opacity = damaged ? 0.25 + 0.35 * (1 - car.health / 55) : 0;
    if (damaged) {
      car.smokeT += dt;
      const s = 0.6 + Math.sin(car.smokeT * 9) * 0.25;
      smoke.scale.set(s, s, s);
    }
  }
  if (car.health <= 0 && !car.dead) {
    car.dead = true;
    car.speed = 0;
  }
}

// ---------------------------------------------------------------- parked cars

/**
 * 15 parked cars along road edges, all facing ALONG the road (never into a
 * building). The red Cometa GT sports car parks by the marina road.
 * Returns { parked, cometa }.
 */
export function createParkedCars(scene, rng) {
  // [roadCoord, alongCoord, alongAxis, heading] — heading follows the road.
  const spots = [
    [30, -60, 'z', 0], [30, 40, 'z', Math.PI], [-30, 90, 'z', 0], [-30, -120, 'z', Math.PI],
    [90, -40, 'z', 0], [90, 130, 'z', Math.PI], [-90, 20, 'z', 0], [-90, -80, 'z', Math.PI],
    [150, -100, 'z', 0], [150, 60, 'z', Math.PI], [-150, 100, 'z', 0], [-150, -40, 'z', Math.PI],
    [-60, 150, 'x', Math.PI / 2], [60, -150, 'x', -Math.PI / 2],
  ];
  const parked = [];
  for (const [road, along, axis, heading] of spots) {
    // Park at the curb: 5.0 off the road centre keeps the car clear of the
    // buildings (their nearest edge is 6.5+ off centre) and of traffic.
    const x = axis === 'z' ? road + 5.0 : along;
    const z = axis === 'z' ? along : road + 5.0;
    const color = PALETTE.carColors[Math.floor(rng() * PALETTE.carColors.length)];
    const mesh = createCarMesh(color);
    mesh.position.set(x, 0, z);
    mesh.rotation.y = Math.PI - heading;
    scene.add(mesh);
    parked.push(makeCar(mesh, x, z, heading, { isParked: true }));
  }
  // The Cometa GT: red sports car, parked along the marina road (x = 150 road).
  const cometaMesh = createCarMesh(PALETTE.cometa);
  cometaMesh.position.set(155, 0, -60);
  cometaMesh.rotation.y = Math.PI;
  scene.add(cometaMesh);
  const cometa = makeCar(cometaMesh, 155, -60, 0, {
    isParked: true, isCometa: true, maxSpeed: 34, accel: 18,
  });
  parked.push(cometa);
  return { parked, cometa };
}

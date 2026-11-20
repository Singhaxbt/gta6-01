// vehicles.js — five vehicle types with distinct looks, speed and handling,
// plus the police interceptor. Arcade physics: accel, brake, steering that
// tightens with speed, handbrake drift, skid marks and engine pitch.
import * as THREE from 'three';
import { makeRng } from './rng.js';

export const VEHICLE_TYPES = {
  sedan: { name: 'SEDAN', top: 34, accel: 16, grip: 2.6, turn: 1.9, color: 0x8a97a5, len: 4.4, w: 1.9, h: 1.0, price: 0 },
  sports: { name: 'VELOCITA GT', top: 52, accel: 26, grip: 3.4, turn: 2.4, color: 0xd21f3c, len: 4.3, w: 1.95, h: 0.85, price: 0 },
  taxi: { name: 'TAXI CAB', top: 36, accel: 17, grip: 2.7, turn: 2.0, color: 0xffc400, len: 4.4, w: 1.9, h: 1.05, price: 0 },
  pickup: { name: 'PICKUP', top: 31, accel: 14, grip: 2.2, turn: 1.6, color: 0x2e6b34, len: 5.0, w: 2.0, h: 1.2, price: 0 },
  moto: { name: 'MOTORCYCLE', top: 46, accel: 24, grip: 3.0, turn: 3.1, color: 0x222831, len: 2.3, w: 0.8, h: 0.9, price: 0 },
  police: { name: 'PD INTERCEPTOR', top: 44, accel: 22, grip: 3.2, turn: 2.5, color: 0x1a1d24, len: 4.6, w: 1.95, h: 1.0, price: 0 },
};

const BODY_COLORS = [0x8a97a5, 0xc0c8d0, 0x274b63, 0x7a2e2e, 0x2e6b34, 0xd21f3c, 0xe8e8e8, 0x3a3f4a];

export function buildVehicleMesh(typeName, colorOverride) {
  const t = VEHICLE_TYPES[typeName];
  const color = colorOverride !== undefined ? colorOverride : t.color;
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color });
  const glassMat = new THREE.MeshLambertMaterial({ color: 0x18242e });
  const darkMat = new THREE.MeshLambertMaterial({ color: 0x141414 });
  if (typeName === 'moto') {
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 2.1), bodyMat);
    body.position.y = 0.75; g.add(body);
    const tank = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.35, 0.7), glassMat);
    tank.position.set(0, 1.05, 0.1); g.add(tank);
    const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.18, 12);
    const w1 = new THREE.Mesh(wheelGeo, darkMat); w1.rotation.z = Math.PI / 2; w1.position.set(0, 0.36, 0.85);
    const w2 = new THREE.Mesh(wheelGeo, darkMat); w2.rotation.z = Math.PI / 2; w2.position.set(0, 0.36, -0.85);
    g.add(w1, w2);
    g.userData.wheels = [w1, w2];
    return g;
  }
  const body = new THREE.Mesh(new THREE.BoxGeometry(t.w, t.h * 0.75, t.len), bodyMat);
  body.position.y = 0.62; g.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(t.w * 0.82, t.h * 0.7, t.len * 0.48), glassMat);
  cabin.position.set(0, 1.15, typeName === 'pickup' ? -t.len * 0.18 : -t.len * 0.05); g.add(cabin);
  if (typeName === 'pickup') {
    const bed = new THREE.Mesh(new THREE.BoxGeometry(t.w * 0.9, 0.35, t.len * 0.36), darkMat);
    bed.position.set(0, 0.95, t.len * 0.3); g.add(bed);
  }
  if (typeName === 'sports') {
    const spoiler = new THREE.Mesh(new THREE.BoxGeometry(t.w * 0.95, 0.08, 0.35), darkMat);
    spoiler.position.set(0, 1.25, -t.len * 0.48); g.add(spoiler);
    const nose = new THREE.Mesh(new THREE.BoxGeometry(t.w * 0.9, 0.3, 0.5), bodyMat);
    nose.position.set(0, 0.45, t.len * 0.5); g.add(nose);
  }
  if (typeName === 'taxi') {
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.28, 0.4),
      new THREE.MeshLambertMaterial({ color: 0xffe082 }));
    sign.position.set(0, 1.65, 0); g.add(sign);
  }
  if (typeName === 'police') {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.18, 0.5),
      new THREE.MeshLambertMaterial({ color: 0xffffff }));
    bar.position.set(0, 1.55, 0); g.add(bar);
    const lightR = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.2, 0.5),
      new THREE.MeshBasicMaterial({ color: 0xff2222 }));
    lightR.position.set(-0.35, 1.56, 0); g.add(lightR);
    const lightB = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.2, 0.5),
      new THREE.MeshBasicMaterial({ color: 0x2244ff }));
    lightB.position.set(0.35, 1.56, 0); g.add(lightB);
    g.userData.lights = [lightR, lightB];
  }
  // Headlights + taillights
  const hl = new THREE.Mesh(new THREE.BoxGeometry(t.w * 0.85, 0.18, 0.1),
    new THREE.MeshBasicMaterial({ color: 0xfff6c0 }));
  hl.position.set(0, 0.62, t.len / 2 + 0.02); g.add(hl);
  const tl = new THREE.Mesh(new THREE.BoxGeometry(t.w * 0.85, 0.15, 0.1),
    new THREE.MeshBasicMaterial({ color: 0xcc2222 }));
  tl.position.set(0, 0.62, -t.len / 2 - 0.02); g.add(tl);
  // Wheels
  const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.3, 12);
  const wheels = [];
  const wx = t.w / 2 - 0.05, wz = t.len / 2 - 0.75;
  [[-wx, wz], [wx, wz], [-wx, -wz], [wx, -wz]].forEach(([x, z]) => {
    const w = new THREE.Mesh(wheelGeo, darkMat);
    w.rotation.z = Math.PI / 2; w.position.set(x, 0.38, z);
    g.add(w); wheels.push(w);
  });
  g.userData.wheels = wheels;
  return g;
}

export class Vehicle {
  constructor(typeName, x, z, angle, colorOverride) {
    this.type = typeName;
    this.def = VEHICLE_TYPES[typeName];
    this.mesh = buildVehicleMesh(typeName, colorOverride);
    this.pos = new THREE.Vector3(x, 0, z);
    this.angle = angle;
    this.speed = 0;
    this.steer = 0;
    this.ai = false; // traffic car
    this.aiTarget = 0;
    this.aiPath = null;
    this.police = false;
    this.occupied = false;
    this.health = 100;
    this.skid = 0;
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = angle;
  }
  forward() { return new THREE.Vector3(Math.sin(this.angle), 0, Math.cos(this.angle)); }
  update(dt, input, city, onCrash) {
    const d = this.def;
    let throttle = 0, steerIn = 0, brake = false;
    if (input) {
      throttle = input.axis('KeyS', 'KeyW');
      steerIn = input.axis('KeyA', 'KeyD');
      brake = input.down('Space');
    }
    if (throttle > 0) this.speed += d.accel * dt * (1 - Math.max(0, this.speed) / d.top);
    else if (throttle < 0) this.speed -= (this.speed > 0.5 ? 30 : 12) * dt;
    else this.speed -= Math.sign(this.speed) * 6 * dt;
    if (Math.abs(this.speed) < 0.15 && throttle === 0) this.speed = 0;
    this.speed = Math.max(-12, Math.min(d.top, this.speed));
    const speedNorm = Math.abs(this.speed) / d.top;
    const targetSteer = steerIn * (brake ? 1.5 : 1);
    this.steer += (targetSteer - this.steer) * Math.min(1, dt * 8);
    const grip = brake ? d.grip * 0.45 : d.grip;
    this.angle += this.steer * d.turn * speedNorm * dt * Math.sign(this.speed || 1) * (brake ? 1.4 : 1);
    const fwd = this.forward();
    const old = this.pos.clone();
    this.pos.addScaledVector(fwd, this.speed * dt);
    // Skid marks flag when handbraking at speed
    this.skid = brake && speedNorm > 0.35 ? 1 : 0;
    const hit = city.collideCircle(this.pos, this.def.w);
    if (hit) {
      if (Math.abs(this.speed) > 8 && onCrash) onCrash(Math.abs(this.speed));
      this.speed *= 0.55;
      this.pos.copy(old);
      city.collideCircle(this.pos, this.def.w);
    }
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.angle;
    // Lean into turns, pitch on accel
    this.mesh.rotation.z = -this.steer * speedNorm * (this.type === 'moto' ? 0.5 : 0.12);
    this.mesh.rotation.x = -throttle * 0.02;
    const spin = this.speed * dt * 2.6;
    (this.mesh.userData.wheels || []).forEach((w) => { w.rotation.x += spin; });
    return speedNorm;
  }
  // Simple traffic autopilot: follow a loop of waypoints on the road grid.
  updateAI(dt, city) {
    if (!this.aiPath || this.aiPath.length === 0) return;
    const target = this.aiPath[this.aiTarget];
    const dx = target.x - this.pos.x, dz = target.z - this.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 6) { this.aiTarget = (this.aiTarget + 1) % this.aiPath.length; return; }
    const want = Math.atan2(dx, dz);
    let diff = want - this.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    this.angle += Math.max(-1.6 * dt, Math.min(1.6 * dt, diff));
    this.speed += (14 - this.speed) * Math.min(1, dt * 1.5);
    const fwd = this.forward();
    this.pos.addScaledVector(fwd, this.speed * dt);
    city.collideCircle(this.pos, this.def.w);
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.angle;
    (this.mesh.userData.wheels || []).forEach((w) => { w.rotation.x += this.speed * dt * 2.6; });
  }
}

export function makeTrafficPaths(rng) {
  // Rectangular loops on the downtown grid + a coastal loop.
  const loops = [];
  for (let i = 0; i < 4; i++) {
    const x0 = rng.range(-230, 120), x1 = x0 + rng.range(120, 260);
    const z0 = rng.range(-260, 120), z1 = z0 + rng.range(120, 260);
    loops.push([{ x: x0, z: z0 }, { x: x1, z: z0 }, { x: x1, z: z1 }, { x: x0, z: z1 }]);
  }
  loops.push([{ x: 340, z: -560 }, { x: 340, z: 560 }, { x: 300, z: 560 }, { x: 300, z: -560 }]);
  return loops;
}

export function spawnTraffic(scene, city, count) {
  const rng = makeRng(4242);
  const loops = makeTrafficPaths(rng);
  const cars = [];
  const types = ['sedan', 'sedan', 'taxi', 'pickup', 'sports', 'sedan'];
  for (let i = 0; i < count; i++) {
    const loop = loops[i % loops.length];
    const wp = loop[Math.floor(rng.next() * loop.length)];
    const type = types[Math.floor(rng.next() * types.length)];
    const v = new Vehicle(type, wp.x + rng.range(-4, 4), wp.z + rng.range(-4, 4), rng.range(0, Math.PI * 2),
      BODY_COLORS[Math.floor(rng.next() * BODY_COLORS.length)]);
    v.ai = true; v.aiPath = loop; v.aiTarget = Math.floor(rng.next() * loop.length);
    scene.add(v.mesh); cars.push(v);
  }
  return cars;
}

export function spawnParked(scene, city) {
  const rng = makeRng(777);
  const cars = [];
  const spots = [];
  for (let gx = -240; gx <= 280; gx += 65) for (let gz = -280; gz <= 290; gz += 65) {
    spots.push({ x: gx + 10, z: gz + 32, a: 0 });
    spots.push({ x: gx + 32, z: gz + 10, a: Math.PI / 2 });
  }
  for (let i = 0; i < 26; i++) {
    const s = spots[Math.floor(rng.next() * spots.length)];
    const type = rng.pick(['sedan', 'sedan', 'sports', 'taxi', 'pickup', 'moto']);
    const v = new Vehicle(type, s.x + rng.range(-2, 2), s.z + rng.range(-2, 2), s.a + rng.range(-0.1, 0.1),
      BODY_COLORS[Math.floor(rng.next() * BODY_COLORS.length)]);
    scene.add(v.mesh); cars.push(v);
  }
  // A hero sports car parked by the downtown plaza for the player to grab.
  const hero = new Vehicle('sports', 52, -8, Math.PI / 2, 0xd21f3c);
  scene.add(hero.mesh); cars.push(hero);
  return cars;
}

// pedestrians.js — at least 40 walkers with varied looks and behaviour:
// strolling, hurrying, standing and chatting; they scatter when shots ring out.
import * as THREE from 'three';
import { makeRng } from './rng.js';

const SHIRTS = [0xe74c3c, 0x3498db, 0x2ecc71, 0xf1c40f, 0x9b59b6, 0xe67e22, 0x1abc9c, 0xecf0f1, 0x34495e, 0xfd79a8];
const PANTS = [0x2c3e50, 0x7f8c8d, 0x5d4037, 0x1a1a2e, 0x4a6741];
const SKINS = [0xf1c27d, 0xe0ac69, 0x8d5524, 0xffdbac, 0xc68642];

export class Pedestrian {
  constructor(x, z, rng) {
    this.rng = rng;
    this.pos = new THREE.Vector3(x, 0, z);
    this.angle = rng.range(0, Math.PI * 2);
    this.speed = rng.range(1.2, 2.6);
    this.mode = rng.pick(['stroll', 'stroll', 'hurry', 'stand']);
    this.target = this.pickTarget();
    this.panic = 0;
    this.phase = rng.range(0, Math.PI * 2);
    const g = new THREE.Group();
    const skin = SKINS[Math.floor(rng.next() * SKINS.length)];
    const shirt = SHIRTS[Math.floor(rng.next() * SHIRTS.length)];
    const pants = PANTS[Math.floor(rng.next() * PANTS.length)];
    const h = rng.range(1.6, 1.95);
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.75, 0.32),
      new THREE.MeshLambertMaterial({ color: shirt }));
    body.position.y = h * 0.55; g.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.19, 10, 8),
      new THREE.MeshLambertMaterial({ color: skin }));
    head.position.y = h * 0.86; g.add(head);
    if (rng.chance(0.45)) {
      const hair = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6),
        new THREE.MeshLambertMaterial({ color: rng.pick([0x1a1a1a, 0x4a2c14, 0x888888, 0xd4a017]) }));
      hair.position.y = h * 0.92; hair.scale.y = 0.7; g.add(hair);
    }
    const legMat = new THREE.MeshLambertMaterial({ color: pants });
    this.legL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.55, 0.2), legMat);
    this.legL.position.set(-0.14, 0.28, 0);
    this.legR = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.55, 0.2), legMat);
    this.legR.position.set(0.14, 0.28, 0);
    g.add(this.legL, this.legR);
    this.mesh = g;
    this.mesh.position.copy(this.pos);
    this.height = h;
  }
  pickTarget() {
    const r = this.rng;
    // Sidewalk-ish targets: near road edges across the city, beach walkers too.
    if (r.chance(0.18)) return { x: r.range(310, 420), z: r.range(-560, 560) };
    return { x: r.range(-580, 420), z: r.range(-580, 580) };
  }
  scare(fromPos) {
    this.panic = 3 + this.rng.next() * 2;
    const dx = this.pos.x - fromPos.x, dz = this.pos.z - fromPos.z;
    this.target = { x: this.pos.x + dx * 4, z: this.pos.z + dz * 4 };
  }
  update(dt, city, time) {
    if (this.mode === 'stand' && this.panic <= 0) {
      this.mesh.rotation.y = this.angle + Math.sin(time * 0.4 + this.phase) * 0.3;
      return;
    }
    const dx = this.target.x - this.pos.x, dz = this.target.z - this.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 4) { this.target = this.pickTarget(); return; }
    const want = Math.atan2(dx, dz);
    let diff = want - this.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    this.angle += Math.max(-2.4 * dt, Math.min(2.4 * dt, diff));
    const spd = this.panic > 0 ? this.speed * 2.6 : (this.mode === 'hurry' ? this.speed * 1.5 : this.speed);
    if (this.panic > 0) this.panic -= dt;
    this.pos.x += Math.sin(this.angle) * spd * dt;
    this.pos.z += Math.cos(this.angle) * spd * dt;
    city.collideCircle(this.pos, 0.6);
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.angle;
    const swing = Math.sin(time * 9 + this.phase) * 0.5 * Math.min(1, spd / 2);
    this.legL.rotation.x = swing;
    this.legR.rotation.x = -swing;
  }
}

export function spawnPedestrians(scene, city, count) {
  const rng = makeRng(2024);
  const peds = [];
  for (let i = 0; i < count; i++) {
    const p = new Pedestrian(rng.range(-560, 420), rng.range(-560, 560), rng);
    scene.add(p.mesh);
    peds.push(p);
  }
  return peds;
}

// police.js — wanted 1-5 stars, PD interceptors that chase and ram, and a
// police helicopter that joins at 4-5 stars. Busted or wasted = hospital, -$200.
import * as THREE from 'three';
import { Vehicle, buildVehicleMesh } from './vehicles.js';
import { makeRng } from './rng.js';

export class Police {
  constructor(scene, city) {
    this.scene = scene;
    this.city = city;
    this.rng = makeRng(31337);
    this.cars = [];
    this.heli = null;
    this.heliRotor = null;
    this.heliAngle = 0;
    this.spawnT = 0;
    this.lightT = 0;
  }
  wantedCars(wanted) {
    if (wanted === 0) return 0;
    if (wanted === 1) return 1;
    if (wanted === 2) return 2;
    if (wanted === 3) return 3;
    return 4;
  }
  ensureHeli() {
    if (this.heli) return;
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.4, 6.5),
      new THREE.MeshLambertMaterial({ color: 0x1a1d24 }));
    body.position.y = 0; g.add(body);
    const glass = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.0, 2.2),
      new THREE.MeshLambertMaterial({ color: 0x9fd4ff }));
    glass.position.set(0, 0.1, 2.4); g.add(glass);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 5),
      new THREE.MeshLambertMaterial({ color: 0x1a1d24 }));
    tail.position.set(0, 0.3, -5); g.add(tail);
    const skid = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.15, 4.5),
      new THREE.MeshLambertMaterial({ color: 0x333333 }));
    skid.position.y = -1.0; g.add(skid);
    this.heliRotor = new THREE.Mesh(new THREE.BoxGeometry(13, 0.12, 0.5),
      new THREE.MeshLambertMaterial({ color: 0x222222 }));
    this.heliRotor.position.y = 1.1; g.add(this.heliRotor);
    const spot = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 2.2, 30, 10, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xfff6c0, transparent: true, opacity: 0.10, side: THREE.DoubleSide, depthWrite: false }));
    spot.position.y = -16; g.add(spot);
    g.position.set(0, 55, 0);
    this.scene.add(g);
    this.heli = g;
  }
  removeHeli() {
    if (!this.heli) return;
    this.scene.remove(this.heli);
    this.heli = null; this.heliRotor = null;
  }
  spawnCarNear(playerPos) {
    const a = this.rng.range(0, Math.PI * 2);
    const d = 55;
    const v = new Vehicle('police', playerPos.x + Math.sin(a) * d, playerPos.z + Math.cos(a) * d, a);
    v.police = true;
    this.scene.add(v.mesh);
    this.cars.push(v);
    return v;
  }
  update(dt, wanted, playerPos, playerSpeed, time, onBusted) {
    // Keep the right number of pursuit cars.
    const want = this.wantedCars(wanted);
    this.spawnT -= dt;
    while (this.cars.length < want && this.spawnT <= 0) {
      this.spawnCarNear(playerPos);
      this.spawnT = 1.2;
    }
    while (this.cars.length > want) {
      const c = this.cars.pop();
      this.scene.remove(c.mesh);
    }
    if (wanted >= 4) this.ensureHeli(); else this.removeHeli();
    // Flash the light bars.
    this.lightT += dt;
    const phase = Math.floor(this.lightT * 6) % 2 === 0;
    for (const c of this.cars) {
      const lights = c.mesh.userData.lights;
      if (lights) {
        lights[0].material.color.setHex(phase ? 0xff2222 : 0x551111);
        lights[1].material.color.setHex(phase ? 0x111155 : 0x2244ff);
      }
    }
    // Pursuit: steer toward the player, ram when close.
    for (const c of this.cars) {
      const dx = playerPos.x - c.pos.x, dz = playerPos.z - c.pos.z;
      const dist = Math.hypot(dx, dz);
      const wantAngle = Math.atan2(dx, dz);
      let diff = wantAngle - c.angle;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      c.angle += Math.max(-2.2 * dt, Math.min(2.2 * dt, diff));
      const targetSpeed = dist > 90 ? 40 : (dist < 6 ? 18 : 34);
      c.speed += (targetSpeed - c.speed) * Math.min(1, dt * 1.2);
      const fwd = c.forward();
      c.pos.addScaledVector(fwd, c.speed * dt);
      this.city.collideCircle(c.pos, c.def.w);
      c.mesh.position.copy(c.pos);
      c.mesh.rotation.y = c.angle;
      (c.mesh.userData.wheels || []).forEach((w) => { w.rotation.x += c.speed * dt * 2.6; });
      if (dist < 3.4 && playerSpeed < 4 && onBusted) onBusted();
    }
    // Helicopter circles overhead, spotlight on the player.
    if (this.heli) {
      this.heliAngle += dt * 0.35;
      const r = 55;
      this.heli.position.set(
        playerPos.x + Math.sin(this.heliAngle) * r,
        22 + Math.sin(time * 0.7) * 2,
        playerPos.z + Math.cos(this.heliAngle) * r);
      this.heli.rotation.y = this.heliAngle + Math.PI;
      if (this.heliRotor) this.heliRotor.rotation.y += dt * 22;
    }
  }
  clear() {
    for (const c of this.cars) this.scene.remove(c.mesh);
    this.cars = [];
    this.removeHeli();
  }
  // Distance to the nearest pursuit car (for HUD / escape logic).
  nearestDist(playerPos) {
    let best = Infinity;
    for (const c of this.cars) best = Math.min(best, Math.hypot(c.pos.x - playerPos.x, c.pos.z - playerPos.z));
    return best;
  }
}

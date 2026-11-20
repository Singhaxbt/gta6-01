// combat.js — pistol / SMG / shotgun with different range, damage and fire
// rate; enemies who take cover, peek and shoot back; muzzle flash, tracers,
// damage sparks and hit reactions. Player health + armor.
import * as THREE from 'three';
import { makeRng } from './rng.js';

export const WEAPONS = {
  pistol: { name: 'PISTOL', damage: 34, range: 60, rate: 0.32, spread: 0.02, mag: Infinity, auto: false, color: 0xffe082 },
  smg: { name: 'SMG', damage: 16, range: 45, rate: 0.09, spread: 0.06, mag: 32, auto: true, color: 0xffd54f },
  shotgun: { name: 'SHOTGUN', damage: 22, range: 26, rate: 0.85, spread: 0.16, mag: 6, auto: false, pellets: 6, color: 0xff8a65 },
};

export class Enemy {
  constructor(x, z, scene, rng, kind) {
    this.kind = kind || 'thug';
    this.pos = new THREE.Vector3(x, 0, z);
    this.health = kind === 'boss' ? 220 : 100;
    this.maxHealth = this.health;
    this.speed = kind === 'boss' ? 2.6 : 3.4;
    this.shootCooldown = rng.range(0.5, 1.5);
    this.cover = null;
    this.state = 'chase'; // chase | cover | peek
    this.stateT = 0;
    this.alive = true;
    this.flashT = 0;
    const g = new THREE.Group();
    const shirt = kind === 'boss' ? 0x111111 : rng.pick([0x7b1fa2, 0x37474f, 0x6d4c41, 0x263238]);
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.8, 0.36),
      new THREE.MeshLambertMaterial({ color: shirt }));
    body.position.y = 1.0; g.add(body);
    const vest = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.5, 0.4),
      new THREE.MeshLambertMaterial({ color: 0x1b1b1b }));
    vest.position.y = 1.05; g.add(vest);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8),
      new THREE.MeshLambertMaterial({ color: 0xc68642 }));
    head.position.y = 1.62; g.add(head);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.21, 0.08, 10),
      new THREE.MeshLambertMaterial({ color: kind === 'boss' ? 0xd21f3c : 0x222222 }));
    cap.position.y = 1.76; g.add(cap);
    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.12, 0.55),
      new THREE.MeshLambertMaterial({ color: 0x111111 }));
    gun.position.set(0.3, 1.15, 0.3); g.add(gun);
    const legMat = new THREE.MeshLambertMaterial({ color: 0x212121 });
    this.legL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.6, 0.22), legMat);
    this.legL.position.set(-0.16, 0.3, 0);
    this.legR = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.6, 0.22), legMat);
    this.legR.position.set(0.16, 0.3, 0);
    g.add(this.legL, this.legR);
    this.mesh = g;
    this.mesh.position.copy(this.pos);
    // Health bar sprite above the head
    const barGeo = new THREE.PlaneGeometry(1.1, 0.12);
    this.barMat = new THREE.MeshBasicMaterial({ color: 0xff3333 });
    this.bar = new THREE.Mesh(barGeo, this.barMat);
    this.bar.position.y = 2.1;
    this.mesh.add(this.bar);
    scene.add(this.mesh);
    this.scene = scene;
  }
  damage(amount, fromPos) {
    this.health -= amount;
    this.flashT = 0.12;
    if (this.health <= 0) { this.alive = false; this.mesh.visible = false; return true; }
    // Getting shot makes them duck for cover.
    this.state = 'cover'; this.stateT = 0;
    return false;
  }
  update(dt, playerPos, city, time, rng) {
    if (!this.alive) return;
    this.stateT += dt;
    this.flashT = Math.max(0, this.flashT - dt);
    const dx = playerPos.x - this.pos.x, dz = playerPos.z - this.pos.z;
    const dist = Math.hypot(dx, dz);
    if (this.state === 'cover') {
      if (!this.cover) {
        // Nearest cover point that is not between us and the player.
        let best = null, bestD = 1e9;
        for (const c of city.coverPoints) {
          const d = Math.hypot(c.x - this.pos.x, c.z - this.pos.z);
          if (d < bestD) { bestD = d; best = c; }
        }
        this.cover = best || { x: this.pos.x, z: this.pos.z };
      }
      const cx = this.cover.x - this.pos.x, cz = this.cover.z - this.pos.z;
      const cd = Math.hypot(cx, cz);
      if (cd > 1.5) {
        this.angle = Math.atan2(cx, cz);
        this.pos.x += Math.sin(this.angle) * this.speed * 1.3 * dt;
        this.pos.z += Math.cos(this.angle) * this.speed * 1.3 * dt;
      } else if (this.stateT > 1.6) { this.state = 'peek'; this.stateT = 0; }
    } else {
      if (dist > 14) {
        this.angle = Math.atan2(dx, dz);
        this.pos.x += Math.sin(this.angle) * this.speed * dt;
        this.pos.z += Math.cos(this.angle) * this.speed * dt;
        if (this.stateT > 4 && rng.chance(0.5)) { this.state = 'cover'; this.stateT = 0; this.cover = null; }
      } else if (this.state === 'peek' && this.stateT > 1.2) {
        this.state = 'chase'; this.stateT = 0;
      }
      this.angle = Math.atan2(dx, dz);
    }
    city.collideCircle(this.pos, 0.6);
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.angle || 0;
    const swing = Math.sin(time * 10) * 0.4;
    this.legL.rotation.x = swing; this.legR.rotation.x = -swing;
    this.barMat.color.setHSL(0.02 + 0.33 * (this.health / this.maxHealth), 0.9, 0.55);
    this.bar.scale.x = Math.max(0.05, this.health / this.maxHealth);
    this.bar.lookAt(playerPos.x, 2.1, playerPos.z);
    this.mesh.traverse((o) => { if (o.material && o.material.emissive) o.material.emissive.setHex(0x000000); });
  }
  // Returns true when this enemy fires this frame.
  tryShoot(dt, playerPos) {
    if (!this.alive) return false;
    this.shootCooldown -= dt;
    const dist = Math.hypot(playerPos.x - this.pos.x, playerPos.z - this.pos.z);
    if (this.state === 'cover' && this.cover) return false;
    if (dist > 55) return false;
    if (this.shootCooldown <= 0) {
      this.shootCooldown = this.kind === 'boss' ? 0.9 : 1.4 + Math.random() * 0.8;
      return true;
    }
    return false;
  }
}

export class Combat {
  constructor(scene) {
    this.scene = scene;
    this.rng = makeRng(99);
    this.enemies = [];
    this.tracers = []; // {mesh, life}
    this.sparks = []; // {mesh, vel, life}
    this.muzzle = null;
    this.muzzleT = 0;
    const mGeo = new THREE.SphereGeometry(0.35, 8, 6);
    this.muzzle = new THREE.Mesh(mGeo, new THREE.MeshBasicMaterial({ color: 0xffee88, transparent: true, opacity: 0 }));
    scene.add(this.muzzle);
  }
  clearEnemies() {
    for (const e of this.enemies) this.scene.remove(e.mesh);
    this.enemies = [];
  }
  spawnEnemy(x, z, kind) {
    const e = new Enemy(x, z, this.scene, this.rng, kind);
    this.enemies.push(e);
    return e;
  }
  spawnSquad(cx, cz, n, kind) {
    const out = [];
    for (let i = 0; i < n; i++) out.push(this.spawnEnemy(cx + this.rng.range(-14, 14), cz + this.rng.range(-14, 14), kind));
    return out;
  }
  aliveCount() { return this.enemies.filter((e) => e.alive).length; }
  fireTracer(from, to, color) {
    const dir = new THREE.Vector3().subVectors(to, from);
    const len = dir.length();
    const geo = new THREE.CylinderGeometry(0.03, 0.03, len, 5);
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 }));
    mesh.position.copy(from).addScaledVector(dir, 0.5);
    mesh.lookAt(to);
    mesh.rotateX(Math.PI / 2);
    this.scene.add(mesh);
    this.tracers.push({ mesh, life: 0.09 });
  }
  spawnSparks(pos, n) {
    for (let i = 0; i < n; i++) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 4),
        new THREE.MeshBasicMaterial({ color: 0xffc233 }));
      s.position.copy(pos);
      this.scene.add(s);
      this.sparks.push({
        mesh: s,
        vel: new THREE.Vector3(this.rng.range(-3, 3), this.rng.range(1, 5), this.rng.range(-3, 3)),
        life: 0.4,
      });
    }
  }
  muzzleFlash(pos) {
    this.muzzle.position.copy(pos);
    this.muzzle.material.opacity = 0.95;
    this.muzzleT = 0.06;
    this.muzzle.scale.setScalar(1 + Math.random() * 0.8);
  }
  update(dt) {
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      t.life -= dt;
      if (t.life <= 0) { this.scene.remove(t.mesh); this.tracers.splice(i, 1); }
    }
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const s = this.sparks[i];
      s.life -= dt;
      s.vel.y -= 12 * dt;
      s.mesh.position.addScaledVector(s.vel, dt);
      if (s.life <= 0 || s.mesh.position.y < 0) { this.scene.remove(s.mesh); this.sparks.splice(i, 1); }
    }
    if (this.muzzleT > 0) {
      this.muzzleT -= dt;
      if (this.muzzleT <= 0) this.muzzle.material.opacity = 0;
    }
  }
}

// main.js — SOLMAR SUNSET: game loop, player, camera, driving, shooting,
// wanted, day/night, effects, menus and the ?shot= staging hook.
import * as THREE from 'three';
import { City } from './city.js';
import { Input } from './input.js';
import { AudioEngine } from './audio.js';
import { HUD } from './hud.js';
import { Vehicle, spawnTraffic, spawnParked } from './vehicles.js';
import { spawnPedestrians } from './pedestrians.js';
import { Combat, WEAPONS } from './combat.js';
import { Police } from './police.js';
import { MissionManager, MISSION_DEFS } from './missions.js';
import { loadSave, writeSave, applySave } from './save.js';
import { stageShot } from './shots.js';

const HOSPITAL = { x: -180, z: -150 };

class Game {
  constructor() {
    this.canvas = document.getElementById('game');
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0xff9d5c, 180, 900);
    this.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 3000);
    // Sunset lighting
    this.sun = new THREE.DirectionalLight(0xffb36b, 2.2);
    this.sun.position.set(-300, 160, -120);
    this.scene.add(this.sun);
    this.hemi = new THREE.HemisphereLight(0x8a6fd8, 0x3a2a1a, 1.1);
    this.scene.add(this.hemi);
    this.ambient = new THREE.AmbientLight(0xffd9a0, 0.5);
    this.scene.add(this.ambient);

    this.input = new Input(this.canvas);
    this.audio = new AudioEngine();
    this.hud = new HUD();
    this.city = new City(this.scene);
    this.combat = new Combat(this.scene);
    this.police = new Police(this.scene, this.city);
    this.missions = new MissionManager(this.scene, this.combat, this.city);
    this.vehicleModule = { Vehicle };
    this.traffic = spawnTraffic(this.scene, this.city, 14);
    this.parked = spawnParked(this.scene, this.city);
    this.peds = spawnPedestrians(this.scene, this.city, 46);

    this.time = 0;
    this.clockHours = 17.7;
    this.started = false;
    this.paused = false;
    this.over = false;
    this.cameraMode = 'foot';
    this.camYaw = Math.PI;
    this.camPitch = 0.32;
    this.shakeT = 0;
    this.slowT = 0;
    this.timeScale = 1;
    this.wanted = 0;
    this.wantedCooldown = 0;
    this.wantedDecayT = 0;
    this.health = 100;
    this.armor = 0;
    this.weapon = 'pistol';
    this.ammo = { smg: 32, shotgun: 6 };
    this.reloadT = 0;
    this.fireT = 0;
    this.airT = -1;
    this.airDur = 0;
    this.state = {
      cash: 500, missionsDone: [false, false, false, false, false],
      packagesFound: [], bestRaceMs: 0, bestTaxi: 0, totalEarned: 0,
    };
    applySave(this.state, loadSave());
    // Restore found packages visually.
    for (const pkg of this.missions.packages) {
      if (this.state.packagesFound.includes(`${pkg.x},${pkg.z}`)) { pkg.found = true; pkg.mesh.visible = false; }
    }
    this.vehicle = null;
    this.footSpeed = 0;
    this.playerAngleVal = Math.PI;
    this.buildPlayer();
    this.playerPos3 = new THREE.Vector3(0, 0, 40);
    this.playerMesh.position.copy(this.playerPos3);
    // Objective beacon
    this.beacon = new THREE.Mesh(
      new THREE.CylinderGeometry(1.8, 1.8, 60, 16, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffd54f, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }));
    this.beacon.position.y = 30;
    this.scene.add(this.beacon);
    this.beaconRing = new THREE.Mesh(new THREE.RingGeometry(3, 4.2, 24),
      new THREE.MeshBasicMaterial({ color: 0xffd54f, transparent: true, opacity: 0.8, side: THREE.DoubleSide }));
    this.beaconRing.rotation.x = -Math.PI / 2;
    this.beaconRing.position.y = 0.15;
    this.scene.add(this.beaconRing);
    // Skid marks pool
    this.skids = [];
    this.skidGeo = new THREE.PlaneGeometry(0.5, 1.4);
    this.skidMat = new THREE.MeshBasicMaterial({ color: 0x111111, transparent: true, opacity: 0.55 });
    // Muzzle light
    this.flashLight = new THREE.PointLight(0xffcc66, 0, 18);
    this.scene.add(this.flashLight);
    this.shotMode = new URLSearchParams(location.search).get('shot');
    this.shotFrames = 0;
    this.bindUI();
    this.hud.renderMissionList(document.getElementById('missionlist'), this.state.missionsDone);
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });
    this.lastT = performance.now();
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
    window.__game = this;
    if (this.shotMode) {
      stageShot(this.shotMode, this);
      document.getElementById('hud').classList.remove('hidden');
    }
  }

  buildPlayer() {
    const g = new THREE.Group();
    const jacket = new THREE.MeshLambertMaterial({ color: 0x1f6f8b });
    const skin = new THREE.MeshLambertMaterial({ color: 0xc68642 });
    const jeans = new THREE.MeshLambertMaterial({ color: 0x2c3e50 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.78, 0.34), jacket);
    body.position.y = 1.05; g.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 9), skin);
    head.position.y = 1.68; g.add(head);
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.21, 10, 7),
      new THREE.MeshLambertMaterial({ color: 0x1a1a1a }));
    hair.position.y = 1.76; hair.scale.y = 0.65; g.add(hair);
    this.legL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.62, 0.22), jeans);
    this.legL.position.set(-0.15, 0.31, 0);
    this.legR = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.62, 0.22), jeans);
    this.legR.position.set(0.15, 0.31, 0);
    g.add(this.legL, this.legR);
    const armMat = jacket;
    this.armR = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.6, 0.16), armMat);
    this.armR.position.set(0.38, 1.1, 0.1);
    g.add(this.armR);
    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 0.5),
      new THREE.MeshLambertMaterial({ color: 0x111111 }));
    gun.position.set(0.38, 0.95, 0.35);
    this.armR.add(gun);
    this.playerMesh = g;
    this.scene.add(g);
  }

  bindUI() {
    document.getElementById('startbtn').addEventListener('click', () => {
      this.audio.init();
      this.hideTitle();
      this.started = true;
      this.toast('SOLMAR SUNSET', 'Marisol is waiting. Follow the yellow marker — first delivery, $300.');
      const next = this.missions.nextMissionIndex(this.state.missionsDone);
      if (next >= 0) {
        const s = this.missions.missionStartPos(next);
        this.missions.marker = { x: s.x, z: s.z, label: `NEXT: ${MISSION_DEFS[next].name}` };
      }
    });
    document.getElementById('resumebtn').addEventListener('click', () => this.togglePause(false));
    document.getElementById('restartbtn').addEventListener('click', () => {
      this.togglePause(false);
      this.respawn(HOSPITAL.x, HOSPITAL.z, false);
      this.toast('NEW DAY', 'Same sunset, fresh legs. Cash and missions kept.');
    });
    document.getElementById('respawnbtn').addEventListener('click', () => {
      document.getElementById('gameover').classList.add('hidden');
      this.over = false;
      this.respawn(HOSPITAL.x, HOSPITAL.z, true);
    });
  }

  hideTitle() {
    document.getElementById('title').classList.add('hidden');
    document.getElementById('hud').classList.remove('hidden');
  }
  toast(t, s) { this.hud.toast(t, s); }
  save() { writeSave(this.state); }
  addCash(n) { this.state.cash += n; this.state.totalEarned += n; }
  setWanted(n) { this.wanted = Math.max(0, Math.min(5, n)); this.audio.setSiren(this.wanted > 0, this.wanted); }
  raiseWanted(n) {
    if (this.wantedCooldown > 0) return;
    this.wantedCooldown = 6;
    this.setWanted(this.wanted + n);
  }
  playerPos() { return this.inVehicle() ? this.vehicle.pos : this.playerPos3; }
  playerAngle() { return this.inVehicle() ? this.vehicle.angle : this.playerAngleVal; }
  inVehicle() { return !!this.vehicle; }
  slowMo(dur) { this.slowT = dur; }
  setSunset() {
    this.clockHours = 17.7;
    this.sun.color.setHex(0xffb36b);
    this.sun.intensity = 2.2;
    this.sun.position.set(-300, 160, -120);
    this.hemi.intensity = 0.9;
    this.scene.fog.color.setHex(0xff9d5c);
  }

  placePlayerOnFoot(x, z, angle) {
    this.exitVehicle(true);
    this.playerPos3.set(x, 0, z);
    this.playerAngleVal = angle || 0;
    this.playerMesh.position.copy(this.playerPos3);
    this.playerMesh.visible = true;
    this.camYaw = angle || 0;
  }
  placePlayerInVehicle(type, x, z, angle, color) {
    this.exitVehicle(true);
    const v = new Vehicle(type, x, z, angle || 0, color);
    this.scene.add(v.mesh);
    this.parked.push(v);
    this.vehicle = v;
    this.playerMesh.visible = false;
    this.camYaw = angle || 0;
    return v;
  }
  exitVehicle(silent) {
    if (!this.vehicle) return;
    const v = this.vehicle;
    this.vehicle = null;
    const side = new THREE.Vector3(Math.cos(v.angle), 0, -Math.sin(v.angle));
    this.playerPos3.copy(v.pos).addScaledVector(side, 2.5);
    this.city.collideCircle(this.playerPos3, 0.6);
    this.playerMesh.position.copy(this.playerPos3);
    this.playerMesh.visible = true;
    this.playerAngleVal = v.angle;
    if (!silent) this.toast('ON FOOT', 'Press E near a car to steal it.');
  }

  respawn(x, z, charge) {
    if (charge) { this.state.cash = Math.max(0, this.state.cash - 200); }
    this.health = 100; this.armor = 50;
    this.setWanted(0);
    this.police.clear();
    this.combat.clearEnemies();
    if (this.missions.active) this.missions.failMission(this, 'The job fell through while you were down.');
    this.placePlayerOnFoot(x, z, Math.PI);
    this.save();
  }
  gameOver(kind) {
    if (this.over) return;
    this.over = true;
    this.audio.stinger(false);
    document.getElementById('gotitle').textContent = kind === 'busted' ? 'BUSTED' : 'WASTED';
    document.getElementById('gomsg').textContent = kind === 'busted'
      ? 'The Solmar PD cuffed you on the street. Bail + hospital: $200.'
      : 'The Solmar PD scraped you off the boardwalk. Hospital bill: $200.';
    document.getElementById('gameover').classList.remove('hidden');
  }

  damagePlayer(amount, fromPos) {
    if (this.over || !this.started) return;
    let rest = amount;
    if (this.armor > 0) {
      const absorbed = Math.min(this.armor, rest * 0.6);
      this.armor -= absorbed; rest -= absorbed;
    }
    this.health -= rest;
    this.shakeT = Math.max(this.shakeT, 0.35);
    if (this.health <= 0) { this.health = 0; this.gameOver('wasted'); }
  }

  aimPoint() {
    const ndc = new THREE.Vector2(
      (this.input.mouseX / window.innerWidth) * 2 - 1,
      -(this.input.mouseY / window.innerHeight) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    const t = -ray.ray.origin.y / ray.ray.direction.y;
    if (t > 0) return ray.ray.origin.clone().addScaledVector(ray.ray.direction, t);
    return this.playerPos3.clone().add(new THREE.Vector3(Math.sin(this.playerAngleVal), 0, Math.cos(this.playerAngleVal)).multiplyScalar(10));
  }

  shoot() {
    const w = WEAPONS[this.weapon];
    if (this.fireT > 0 || this.reloadT > 0) return;
    if (this.weapon !== 'pistol') {
      if (this.ammo[this.weapon] <= 0) { this.reload(); return; }
      this.ammo[this.weapon]--;
    }
    this.fireT = w.rate;
    const from = this.playerPos3.clone(); from.y = 1.4;
    const aim = this.aimPoint();
    // Face the aim point.
    this.playerAngleVal = Math.atan2(aim.x - from.x, aim.z - from.z);
    const pellets = w.pellets || 1;
    let hitAny = false;
    for (let i = 0; i < pellets; i++) {
      const dir = new THREE.Vector3().subVectors(aim, from).normalize();
      dir.x += (Math.random() - 0.5) * w.spread * 2;
      dir.z += (Math.random() - 0.5) * w.spread * 2;
      dir.normalize();
      const end = from.clone().addScaledVector(dir, w.range);
      // Nearest enemy within a cone of the shot.
      let best = null, bestD = Infinity;
      for (const e of this.combat.enemies) {
        if (!e.alive) continue;
        const toE = new THREE.Vector3().subVectors(e.pos.clone().setY(1.2), from);
        const along = toE.dot(dir);
        if (along < 0 || along > w.range) continue;
        const perp = toE.clone().addScaledVector(dir, -along).length();
        if (perp < 1.4 && along < bestD) { bestD = along; best = e; }
      }
      if (best) {
        const hitPos = from.clone().addScaledVector(dir, bestD);
        this.combat.fireTracer(from, hitPos, w.color);
        this.combat.spawnSparks(hitPos, 6);
        const killed = best.damage(w.damage, from);
        hitAny = true;
        if (killed) {
          this.addCash(25);
          this.toast('TARGET DOWN', '+$25 street cash.');
          this.raiseWanted(1);
        }
      } else {
        this.combat.fireTracer(from, end, w.color);
      }
    }
    this.combat.muzzleFlash(from.clone().add(new THREE.Vector3(Math.sin(this.playerAngleVal), 0, Math.cos(this.playerAngleVal)).multiplyScalar(0.8)));
    this.flashLight.position.copy(from);
    this.flashLight.intensity = 6;
    setTimeout(() => { this.flashLight.intensity = 0; }, 60);
    this.audio.gunshot(this.weapon);
    this.shakeT = Math.max(this.shakeT, 0.12);
    // Peds scatter at gunfire.
    for (const p of this.peds) if (Math.hypot(p.pos.x - from.x, p.pos.z - from.z) < 40) p.scare(from);
    if (this.weapon !== 'pistol' && this.ammo[this.weapon] === 0) this.reload();
  }
  reload() {
    if (this.reloadT > 0 || this.weapon === 'pistol') return;
    this.reloadT = 0.8;
    setTimeout(() => {
      this.ammo[this.weapon] = WEAPONS[this.weapon].mag;
      this.reloadT = 0;
    }, 800);
  }

  nearestVehicle(maxD) {
    let best = null, bestD = maxD;
    for (const v of [...this.parked, ...this.traffic]) {
      if (v.police) continue;
      const d = Math.hypot(v.pos.x - this.playerPos3.x, v.pos.z - this.playerPos3.z);
      if (d < bestD) { bestD = d; best = v; }
    }
    return best;
  }

  updatePlayer(dt) {
    const inp = this.input;
    // Camera orbit with mouse drag / arrows.
    this.camYaw -= inp.dragDX * 0.005;
    this.camPitch = Math.max(0.08, Math.min(0.9, this.camPitch + inp.dragDY * 0.003));
    this.camYaw += inp.axis('ArrowLeft', 'ArrowRight') * 1.6 * dt;
    this.camPitch = Math.max(0.08, Math.min(0.9, this.camPitch + inp.axis('ArrowDown', 'ArrowUp') * 0.8 * dt));
    if (this.vehicle) {
      const v = this.vehicle;
      const speedNorm = v.update(dt, inp, this.city, (spd) => {
        this.audio.impact();
        this.shakeT = Math.max(this.shakeT, 0.4);
        this.damagePlayer(spd * 0.4, v.pos);
      });
      this.audio.setEngine(speedNorm, true);
      // Skid marks
      if (v.skid) this.dropSkid(v);
      // Stunt ramps
      if (this.airT < 0) {
        for (const r of this.city.ramps) {
          if (Math.hypot(v.pos.x - r.x, v.pos.z - r.z) < 6 && Math.abs(v.speed) > 14) {
            this.airT = 0; this.airDur = 0.9; break;
          }
        }
      }
      if (this.airT >= 0) {
        this.airT += dt;
        const k = this.airT / this.airDur;
        v.mesh.position.y = 4.5 * Math.sin(Math.PI * Math.min(1, k));
        if (k >= 1) {
          v.mesh.position.y = 0;
          if (this.airDur > 0.5) {
            this.addCash(25);
            this.toast('STUNT JUMP', '+$25 — clean air, Dare.');
            this.audio.pickup();
          }
          this.airT = -1;
        }
      }
      // Exit vehicle
      if (inp.wasPressed('KeyE')) this.exitVehicle(false);
      if (inp.wasPressed('KeyT') && v.type === 'taxi') this.missions.startTaxi(this);
    } else {
      this.audio.setEngine(0, false);
      const sprint = inp.down('ShiftLeft') || inp.down('ShiftRight');
      const fwd = inp.axis('KeyS', 'KeyW');
      const strafe = inp.axis('KeyA', 'KeyD');
      const spd = sprint ? 9 : 5.2;
      const mx = Math.sin(this.camYaw) * fwd + Math.cos(this.camYaw) * strafe;
      const mz = Math.cos(this.camYaw) * fwd - Math.sin(this.camYaw) * strafe;
      const len = Math.hypot(mx, mz);
      this.footSpeed = len > 0.01 ? spd : 0;
      if (len > 0.01) {
        this.playerPos3.x += (mx / len) * spd * dt;
        this.playerPos3.z += (mz / len) * spd * dt;
        this.playerAngleVal = Math.atan2(mx, mz);
        const swing = Math.sin(this.time * 11) * 0.6;
        this.legL.rotation.x = swing; this.legR.rotation.x = -swing;
      } else {
        this.legL.rotation.x *= 0.8; this.legR.rotation.x *= 0.8;
      }
      this.city.collideCircle(this.playerPos3, 0.6);
      this.playerMesh.position.copy(this.playerPos3);
      this.playerMesh.rotation.y = this.playerAngleVal;
      // Enter vehicle
      if (inp.wasPressed('KeyE')) {
        const v = this.nearestVehicle(5);
        if (v) {
          if (v.ai) {
            v.ai = false;
            this.traffic = this.traffic.filter((t) => t !== v);
            this.raiseWanted(1);
            this.toast('CAR JACKED', `${v.def.name} is yours now. The owner is calling the PD.`);
          }
          this.vehicle = v;
          this.playerMesh.visible = false;
          this.audio.pickup();
        } else if (this.missions.marker && Math.hypot(this.playerPos3.x - this.missions.marker.x, this.playerPos3.z - this.missions.marker.z) < 8) {
          const next = this.missions.nextMissionIndex(this.state.missionsDone);
          if (!this.missions.active && next >= 0) this.missions.startMission(next, this);
          else if (this.missions.race === null && !this.missions.active) this.missions.startRace(this);
        }
      }
      // Shooting
      if (inp.wasPressed('Digit1')) this.weapon = 'pistol';
      if (inp.wasPressed('Digit2')) { this.weapon = 'smg'; if (this.ammo.smg <= 0) this.reload(); }
      if (inp.wasPressed('Digit3')) { this.weapon = 'shotgun'; if (this.ammo.shotgun <= 0) this.reload(); }
      if (inp.wasPressed('KeyR')) this.reload();
      const w = WEAPONS[this.weapon];
      if ((w.auto && inp.mouseDown) || (!w.auto && inp.mouseClicked)) this.shoot();
    }
    this.fireT = Math.max(0, this.fireT - dt);
  }

  dropSkid(v) {
    const back = v.forward().multiplyScalar(-v.def.len / 2);
    for (const side of [-0.8, 0.8]) {
      const pos = v.pos.clone().add(back).add(new THREE.Vector3(Math.cos(v.angle) * side, 0, -Math.sin(v.angle) * side));
      const m = new THREE.Mesh(this.skidGeo, this.skidMat);
      m.rotation.x = -Math.PI / 2; m.rotation.z = -v.angle;
      m.position.set(pos.x, 0.06, pos.z);
      this.scene.add(m);
      this.skids.push({ mesh: m, life: 6 });
      if (this.skids.length > 140) { const s = this.skids.shift(); this.scene.remove(s.mesh); }
    }
  }

  togglePause(force) {
    if (!this.started || this.over) return;
    this.paused = force !== undefined ? force : !this.paused;
    document.getElementById('pausemenu').classList.toggle('hidden', !this.paused);
    if (this.paused) this.hud.renderMissionList(document.getElementById('pauselist'), this.state.missionsDone);
  }

  updateCamera(dt) {
    const target = this.inVehicle() ? this.vehicle.pos : this.playerPos3;
    let dist = this.inVehicle() ? 11 : 9;
    let height = this.inVehicle() ? 4.2 : 3.4;
    let lookAhead = 4;
    if (this.cameraMode === 'vista') {
      this.camera.position.set(520, 90, 350);
      this.camera.lookAt(-100, 10, -100);
      return;
    }
    const yaw = this.inVehicle() ? this.vehicle.angle + Math.PI : this.camYaw + Math.PI;
    const pitch = this.camPitch;
    const cx = target.x + Math.sin(yaw) * Math.cos(pitch) * dist;
    const cz = target.z + Math.cos(yaw) * Math.cos(pitch) * dist;
    const cy = height + Math.sin(pitch) * dist * 0.6;
    const shake = this.shakeT > 0 ? 0.35 * this.shakeT : 0;
    this.camera.position.set(
      cx + (Math.random() - 0.5) * shake,
      Math.max(1.2, cy + (Math.random() - 0.5) * shake),
      cz + (Math.random() - 0.5) * shake);
    const look = new THREE.Vector3(
      target.x - Math.sin(yaw) * lookAhead * 0,
      target.y + 1.6,
      target.z - Math.cos(yaw) * lookAhead * 0);
    if (this.inVehicle()) {
      look.x = target.x + Math.sin(this.vehicle.angle) * 8;
      look.z = target.z + Math.cos(this.vehicle.angle) * 8;
    } else {
      look.x = target.x + Math.sin(this.camYaw) * 6;
      look.z = target.z + Math.cos(this.camYaw) * 6;
    }
    this.camera.lookAt(look);
  }

  updateSun() {
    // Day/night cycle: full cycle ~8 min. Sunset is the long golden stretch.
    this.clockHours += 0.0009;
    if (this.clockHours >= 24) this.clockHours -= 24;
    const h = this.clockHours;
    const day = h >= 6 && h < 18;
    const sunset = h >= 17 && h < 19.5;
    const night = h >= 19.5 || h < 6;
    if (sunset) {
      this.sun.color.setHex(0xffb36b); this.sun.intensity = 2.2;
      this.sun.position.set(-300, 160, -120);
      this.hemi.intensity = 1.1;
      this.scene.fog.color.setHex(0xff9d5c);
      this.scene.background = null;
    } else if (day) {
      this.sun.color.setHex(0xfff2d0); this.sun.intensity = 2.6;
      this.sun.position.set(-100, 400, 100);
      this.hemi.intensity = 1.1;
      this.scene.fog.color.setHex(0xbfd9e8);
    } else {
      this.sun.color.setHex(0x8fa8ff); this.sun.intensity = 0.35;
      this.sun.position.set(200, 300, -100);
      this.hemi.intensity = 0.35;
      this.scene.fog.color.setHex(0x1a2340);
    }
  }

  loop(now) {
    requestAnimationFrame(this.loop);
    let rawDt = Math.min(0.05, (now - this.lastT) / 1000);
    this.lastT = now;
    if (this.slowT > 0) { this.slowT -= rawDt; this.timeScale = 0.35; }
    else this.timeScale = 1;
    const dt = rawDt * this.timeScale;
    this.shakeT = Math.max(0, this.shakeT - rawDt * 2);
    if (this.started && !this.over && (this.input.wasPressed('KeyP') || this.input.wasPressed('Escape'))) this.togglePause();
    if (this.started && !this.over && this.input.wasPressed('KeyM')) {
      const next = this.missions.nextMissionIndex(this.state.missionsDone);
      if (next >= 0) this.toast(`NEXT: ${MISSION_DEFS[next].name}`, `${MISSION_DEFS[next].brief} — pays $${MISSION_DEFS[next].payout}. Follow the yellow marker.`);
      else this.toast('ALL MISSIONS COMPLETE', 'You own Solmar, Dare. Free roam, fares, races, packages.');
    }
    if (!this.paused && this.started && !this.over) {
      this.time += dt;
      this.updateSun();
      this.updatePlayer(dt);
      for (const c of this.traffic) c.updateAI(dt, this.city);
      for (const p of this.peds) p.update(dt, this.city, this.time);
      this.combat.update(dt);
      // Enemies act.
      for (const e of this.combat.enemies) {
        if (!e.alive) continue;
        e.update(dt, this.playerPos(), this.city, this.time, this.combat.rng);
        if (e.tryShoot(dt, this.playerPos())) {
          const from = e.pos.clone(); from.y = 1.4;
          const to = this.playerPos().clone(); to.y = 1.2;
          this.combat.fireTracer(from, to, 0xff6b6b);
          this.combat.muzzleFlash(from);
          this.audio.gunshot('smg');
          if (Math.random() < 0.45) this.damagePlayer(e.kind === 'boss' ? 14 : 8, from);
        }
      }
      // Wanted: decay when the heat is off.
      this.wantedCooldown = Math.max(0, this.wantedCooldown - dt);
      if (this.wanted > 0) {
        const near = this.police.nearestDist(this.playerPos());
        if (near > 70) {
          this.wantedDecayT += dt;
          if (this.wantedDecayT > 18) { this.setWanted(this.wanted - 1); this.wantedDecayT = 0; }
        } else this.wantedDecayT = 0;
      }
      const pSpeed = this.inVehicle() ? Math.abs(this.vehicle.speed) : this.footSpeed;
      this.police.update(dt, this.wanted, this.playerPos(), pSpeed, this.time, () => this.gameOver('busted'));
      this.missions.update(dt, this);
      // Beacon follows the current marker.
      if (this.missions.marker) {
        this.beacon.visible = true;
        this.beaconRing.visible = true;
        this.beacon.position.set(this.missions.marker.x, 30, this.missions.marker.z);
        this.beaconRing.position.set(this.missions.marker.x, 0.15, this.missions.marker.z);
        this.beacon.material.opacity = 0.16 + 0.08 * Math.sin(this.time * 4);
        this.beaconRing.scale.setScalar(1 + 0.15 * Math.sin(this.time * 4));
      } else { this.beacon.visible = false; this.beaconRing.visible = false; }
      // Skid fade
      for (let i = this.skids.length - 1; i >= 0; i--) {
        this.skids[i].life -= dt;
        if (this.skids[i].life <= 0) { this.scene.remove(this.skids[i].mesh); this.skids.splice(i, 1); }
      }
      this.audio.setSiren(this.wanted > 0, this.wanted);
      this.hud.update(dt, this);
    } else if (this.shotMode && !this.started) {
      // Shots stage themselves; keep world alive for the frame.
      this.time += dt;
      for (const p of this.peds) p.update(dt, this.city, this.time);
      for (const c of this.traffic) c.updateAI(dt, this.city);
    }
    this.updateCamera(rawDt);
    this.renderer.render(this.scene, this.camera);
    this.input.endFrame();
    // Shot readiness: a few rendered frames after staging, the frame is stable.
    if (this.shotMode && !window.__shotReady) {
      this.shotFrames++;
      if (this.shotFrames >= 5) window.__shotReady = true;
    }
  }
}

new Game();

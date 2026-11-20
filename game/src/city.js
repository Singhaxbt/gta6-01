// city.js — builds Solmar from the fixed seed: five districts, roads, towers,
// harbor cranes, containers, boats, palms, streetlights, ramps and collision
// boxes. Ground is one canvas texture so the map reads from the air.
import * as THREE from 'three';
import { makeRng } from './rng.js';

export const WORLD = 1200; // world spans [-600, 600] on x and z
export const SEED = 1337;

export function districtAt(x, z) {
  if (x > 300) return 'beach';
  if (z > 300) return 'harbor';
  if (x < -250) return 'oldtown';
  if (z < -300) return 'hills';
  return 'downtown';
}

function groundTexture(rng) {
  const S = 1024, c = document.createElement('canvas');
  c.width = S; c.height = S;
  const g = c.getContext('2d');
  const px = (x) => (x + 600) / 1200 * S;
  const pz = (z) => (z + 600) / 1200 * S;
  // Base grass / city ground
  g.fillStyle = '#5d7a4a'; g.fillRect(0, 0, S, S);
  // Downtown concrete
  g.fillStyle = '#8a8d90'; g.fillRect(px(-260), pz(-300), px(300) - px(-260), pz(300) - pz(-300));
  // Old town terracotta streets
  g.fillStyle = '#b98a5e'; g.fillRect(px(-600), pz(-300), px(-250) - px(-600), pz(300) - pz(-300));
  // Harbor concrete + docks
  g.fillStyle = '#7e7a72'; g.fillRect(px(-260), pz(300), px(430) - px(-260), pz(600) - pz(300));
  // Hills green
  g.fillStyle = '#4e7040'; g.fillRect(px(-600), pz(-600), S - px(-600), pz(-300) - pz(-600));
  // Beach sand
  g.fillStyle = '#e8d39a'; g.fillRect(px(300), pz(-300), px(430) - px(300), pz(300) - pz(-300));
  g.fillStyle = '#e8d39a'; g.fillRect(px(300), pz(-600), px(430) - px(300), pz(-300) - pz(-600));
  // Roads: downtown grid + ring + coastal + harbor + old town
  g.strokeStyle = '#2e2e33'; g.lineCap = 'round';
  const road = (x1, z1, x2, z2, w) => {
    g.lineWidth = w; g.beginPath(); g.moveTo(px(x1), pz(z1)); g.lineTo(px(x2), pz(z2)); g.stroke();
  };
  for (let x = -240; x <= 280; x += 65) road(x, -290, x, 290, 14);
  for (let z = -280; z <= 290; z += 65) road(-250, z, 290, z, 14);
  for (let z = -280; z <= 290; z += 90) road(-590, z, -260, z, 10);
  for (let x = -580; x <= -260; x += 90) road(x, -290, x, 290, 10);
  road(340, -590, 340, 590, 16); // coastal road
  road(-250, 340, 420, 340, 14); road(-250, 470, 420, 470, 14);
  for (let x = -240; x <= 420; x += 80) road(x, 300, x, 590, 12);
  road(0, -590, 0, -300, 14); // hill road
  road(-420, -460, 420, -460, 12); // hill winding road
  // Lane dashes on the main grid
  g.strokeStyle = '#f5d76e'; g.lineWidth = 2; g.setLineDash([10, 14]);
  for (let x = -240; x <= 280; x += 65) road(x, -290, x, 290, 2);
  for (let z = -280; z <= 290; z += 65) road(-250, z, 290, z, 2);
  g.setLineDash([]);
  // Downtown plaza + old town plaza
  g.fillStyle = '#c9c2b4'; g.fillRect(px(-40), pz(-40), 70, 70);
  g.fillStyle = '#d8b98a'; g.beginPath(); g.arc(px(-420), pz(0), 34, 0, 7); g.fill();
  // Park in downtown
  g.fillStyle = '#3f6b35'; g.fillRect(px(120), pz(120), 90, 90);
  // Speckle for texture
  for (let i = 0; i < 2600; i++) {
    g.fillStyle = rng.chance(0.5) ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.05)';
    g.fillRect(rng.range(0, S), rng.range(0, S), 2, 2);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function windowTexture() {
  const c = document.createElement('canvas'); c.width = 64; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#42546f'; g.fillRect(0, 0, 64, 128);
  for (let y = 4; y < 124; y += 10) for (let x = 4; x < 60; x += 10) {
    g.fillStyle = Math.random() < 0.55 ? '#ffd98a' : '#7fb2d9';
    g.fillRect(x, y, 6, 6);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class City {
  constructor(scene) {
    this.rng = makeRng(SEED);
    this.colliders = []; // {minX,maxX,minZ,maxZ}
    this.coverPoints = []; // {x,z} spots enemies can hide behind
    this.ramps = []; // {x,z,angle}
    this.build(scene);
  }
  addCollider(x, z, w, d) {
    this.colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
  }
  build(scene) {
    const rng = this.rng;
    // --- Sky: big gradient dome + sun disc + sunset clouds ---
    const skyGeo = new THREE.SphereGeometry(1400, 24, 12);
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { top: { value: new THREE.Color(0x2a1a5e) }, mid: { value: new THREE.Color(0xff7e3d) }, bot: { value: new THREE.Color(0xffc46b) } },
      vertexShader: 'varying vec3 vP; void main(){ vP=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
      fragmentShader: 'varying vec3 vP; uniform vec3 top; uniform vec3 mid; uniform vec3 bot; void main(){ float h=normalize(vP).y; vec3 c=h>0.25?mix(mid,top,smoothstep(0.25,0.9,h)):mix(bot,mid,smoothstep(-0.05,0.25,h)); gl_FragColor=vec4(c,1.0); }',
    });
    scene.add(new THREE.Mesh(skyGeo, skyMat));
    // Sun disc low in the west
    const sun = new THREE.Mesh(new THREE.CircleGeometry(55, 32),
      new THREE.MeshBasicMaterial({ color: 0xffe9a8, fog: false }));
    sun.position.set(-900, 130, -350); sun.lookAt(0, 60, 0); scene.add(sun);
    const glow = new THREE.Mesh(new THREE.CircleGeometry(110, 32),
      new THREE.MeshBasicMaterial({ color: 0xff9d4d, transparent: true, opacity: 0.35, fog: false }));
    glow.position.set(-905, 130, -350); glow.lookAt(0, 60, 0); scene.add(glow);

    // --- Ground + water ---
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(WORLD, WORLD),
      new THREE.MeshLambertMaterial({ map: groundTexture(rng) }));
    ground.rotation.x = -Math.PI / 2; scene.add(ground);
    const water = new THREE.Mesh(new THREE.PlaneGeometry(500, WORLD),
      new THREE.MeshLambertMaterial({ color: 0x1e6f9e, transparent: true, opacity: 0.92 }));
    water.rotation.x = -Math.PI / 2; water.position.set(430 + 250, 0.4, 0);
    scene.add(water); this.water = water;
    // Hills: rolling green mounds in the north
    const hillMat = new THREE.MeshLambertMaterial({ color: 0x4a6b38 });
    for (let i = 0; i < 9; i++) {
      const h = new THREE.Mesh(new THREE.SphereGeometry(rng.range(60, 130), 12, 8), hillMat);
      h.scale.y = 0.22; h.position.set(rng.range(-560, 560), -2, rng.range(-580, -330));
      scene.add(h);
    }
    // Overlook platform in the hills
    const overlook = new THREE.Mesh(new THREE.BoxGeometry(60, 4, 30),
      new THREE.MeshLambertMaterial({ color: 0x9a938a }));
    overlook.position.set(0, 6, -430); scene.add(overlook);
    this.addCollider(0, -430, 60, 30);

    // --- Buildings (instanced) ---
    const winTex = windowTexture();
    const towerMat = new THREE.MeshLambertMaterial({ map: winTex, color: 0xe8eef4 });
    const towerGeo = new THREE.BoxGeometry(1, 1, 1);
    const towerSpots = [];
    for (let gx = -240; gx <= 280; gx += 65) for (let gz = -280; gz <= 290; gz += 65) {
      if (Math.abs(gx) < 60 && Math.abs(gz) < 60) continue; // plaza
      if (gx > 100 && gx < 240 && gz > 100 && gz < 240) continue; // park
      if (rng.chance(0.72)) towerSpots.push({ x: gx + 32, z: gz + 32, w: rng.range(22, 34), d: rng.range(22, 34), h: rng.range(35, 120) });
    }
    const towers = new THREE.InstancedMesh(towerGeo, towerMat, towerSpots.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    const col = new THREE.Color();
    towerSpots.forEach((b, i) => {
      p.set(b.x, b.h / 2, b.z); s.set(b.w, b.h, b.d);
      m4.compose(p, q, s); towers.setMatrixAt(i, m4);
      col.setHSL(0.58 + rng.range(-0.04, 0.04), 0.35, rng.range(0.5, 0.75));
      towers.setColorAt(i, col);
      this.addCollider(b.x, b.z, b.w + 2, b.d + 2);
    });
    towers.instanceMatrix.needsUpdate = true; scene.add(towers);

    // Low buildings: old town + harbor warehouses + beach hotels
    const lowMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    const lowSpots = [];
    for (let i = 0; i < 130; i++) {
      const d = rng.pick(['oldtown', 'oldtown', 'harbor', 'beach']);
      let x, z, w, dd, h, hue;
      if (d === 'oldtown') { x = rng.range(-580, -280); z = rng.range(-280, 280); w = rng.range(14, 24); dd = rng.range(14, 24); h = rng.range(8, 18); hue = rng.range(0.05, 0.1); }
      else if (d === 'harbor') { x = rng.range(-240, 400); z = rng.range(320, 560); w = rng.range(24, 44); dd = rng.range(18, 30); h = rng.range(10, 18); hue = 0.55; }
      else { x = rng.range(310, 420); z = rng.range(-280, 280); w = rng.range(18, 28); dd = rng.range(18, 28); h = rng.range(16, 42); hue = 0.5; }
      lowSpots.push({ x, z, w, d: dd, h, hue });
    }
    const lows = new THREE.InstancedMesh(towerGeo, lowMat, lowSpots.length);
    lowSpots.forEach((b, i) => {
      p.set(b.x, b.h / 2, b.z); s.set(b.w, b.h, b.d);
      m4.compose(p, q, s); lows.setMatrixAt(i, m4);
      col.setHSL(b.hue, rng.range(0.3, 0.55), rng.range(0.45, 0.65));
      lows.setColorAt(i, col);
      this.addCollider(b.x, b.z, b.w + 2, b.d + 2);
      if (rng.chance(0.4)) this.coverPoints.push({ x: b.x + b.w / 2 + 3, z: b.z });
    });
    lows.instanceMatrix.needsUpdate = true; scene.add(lows);

    // --- Harbor cranes ---
    const craneMat = new THREE.MeshLambertMaterial({ color: 0xd8432a });
    const steelMat = new THREE.MeshLambertMaterial({ color: 0x5a5f66 });
    for (let i = 0; i < 4; i++) {
      const cx = -160 + i * 170, cz = 520;
      const g = new THREE.Group();
      const leg1 = new THREE.Mesh(new THREE.BoxGeometry(4, 55, 4), craneMat); leg1.position.set(-8, 27, 0);
      const leg2 = new THREE.Mesh(new THREE.BoxGeometry(4, 55, 4), craneMat); leg2.position.set(8, 27, 0);
      const top = new THREE.Mesh(new THREE.BoxGeometry(30, 4, 5), craneMat); top.position.set(0, 55, 0);
      const jib = new THREE.Mesh(new THREE.BoxGeometry(70, 3, 3), craneMat); jib.position.set(20, 58, 0);
      const cable = new THREE.Mesh(new THREE.BoxGeometry(1, 22, 1), steelMat); cable.position.set(48, 46, 0);
      const hook = new THREE.Mesh(new THREE.BoxGeometry(6, 5, 6), steelMat); hook.position.set(48, 34, 0);
      g.add(leg1, leg2, top, jib, cable, hook);
      g.position.set(cx, 0, cz); scene.add(g);
      this.addCollider(cx, cz, 22, 10);
    }
    // --- Containers (instanced, bright colors) ---
    const contSpots = [];
    for (let i = 0; i < 70; i++) {
      contSpots.push({ x: rng.range(-220, 400), z: rng.range(360, 560), y: rng.chance(0.3) ? 3.1 : 0, ry: rng.chance(0.5) ? 0 : Math.PI / 2 });
    }
    const contGeo = new THREE.BoxGeometry(12, 2.8, 2.6);
    const conts = new THREE.InstancedMesh(contGeo, new THREE.MeshLambertMaterial({ color: 0xffffff }), contSpots.length);
    contSpots.forEach((b, i) => {
      p.set(b.x, 1.4 + b.y, b.z); q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), b.ry); s.set(1, 1, 1);
      m4.compose(p, q, s); conts.setMatrixAt(i, m4);
      col.setHSL(rng.pick([0.02, 0.08, 0.35, 0.55, 0.0, 0.6]), 0.75, 0.5);
      conts.setColorAt(i, col);
      if (b.y === 0) { this.addCollider(b.x, b.z, 12, 3); this.coverPoints.push({ x: b.x, z: b.z + 4 }); }
    });
    q.identity(); conts.instanceMatrix.needsUpdate = true; scene.add(conts);

    // --- Boats in the harbor + beach ---
    const boatMat = new THREE.MeshLambertMaterial({ color: 0xf2f2f2 });
    const boatHull = new THREE.MeshLambertMaterial({ color: 0x274b63 });
    for (let i = 0; i < 8; i++) {
      const g = new THREE.Group();
      const hull = new THREE.Mesh(new THREE.BoxGeometry(10, 2.5, 4), boatHull); hull.position.y = 0.8;
      const cabin = new THREE.Mesh(new THREE.BoxGeometry(4, 2.5, 3), boatMat); cabin.position.set(-1, 3, 0);
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 7), steelMat); mast.position.set(2, 5, 0);
      g.add(hull, cabin, mast);
      g.position.set(rng.range(460, 620), 0.4, rng.range(-260, 520));
      g.rotation.y = rng.range(0, Math.PI * 2);
      scene.add(g);
    }

    // --- Palms along the beach + boardwalk ---
    const trunkMat = new THREE.MeshLambertMaterial({ color: 0x8a6b45 });
    const leafMat = new THREE.MeshLambertMaterial({ color: 0x2f8f4e });
    const palms = [];
    for (let i = 0; i < 70; i++) palms.push({ x: rng.range(305, 425), z: rng.range(-580, 580) });
    for (let i = 0; i < 30; i++) palms.push({ x: rng.range(-240, 280), z: rng.range(-280, 280), street: true });
    palms.forEach((pl) => {
      const g = new THREE.Group();
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.45, 7, 6), trunkMat);
      trunk.position.y = 3.5;
      const leaves = new THREE.Mesh(new THREE.ConeGeometry(2.6, 2.4, 7), leafMat);
      leaves.position.y = 7.6;
      g.add(trunk, leaves); g.position.set(pl.x, 0, pl.z);
      g.rotation.z = rng.range(-0.08, 0.08);
      scene.add(g);
    });

    // --- Streetlights (instanced poles with glowing heads) ---
    const poleGeo = new THREE.CylinderGeometry(0.12, 0.12, 7, 5);
    const poles = [];
    for (let gx = -240; gx <= 280; gx += 65) for (let gz = -280; gz <= 290; gz += 130) poles.push({ x: gx + 6, z: gz });
    const poleMesh = new THREE.InstancedMesh(poleGeo, steelMat, poles.length);
    poles.forEach((pl, i) => {
      p.set(pl.x, 3.5, pl.z); q.identity(); s.set(1, 1, 1);
      m4.compose(p, q, s); poleMesh.setMatrixAt(i, m4);
    });
    poleMesh.instanceMatrix.needsUpdate = true; scene.add(poleMesh);
    const lampGeo = new THREE.SphereGeometry(0.5, 8, 6);
    const lampMat = new THREE.MeshBasicMaterial({ color: 0xffe6a0 });
    const lamps = new THREE.InstancedMesh(lampGeo, lampMat, poles.length);
    poles.forEach((pl, i) => {
      p.set(pl.x, 7, pl.z); m4.compose(p, q, s); lamps.setMatrixAt(i, m4);
    });
    lamps.instanceMatrix.needsUpdate = true; scene.add(lamps);

    // --- Stunt ramps (jump wedges) ---
    const rampMat = new THREE.MeshLambertMaterial({ color: 0xffb300 });
    const rampSpots = [
      { x: 120, z: 0, ry: 0 }, { x: -100, z: 200, ry: Math.PI / 2 },
      { x: 340, z: -120, ry: Math.PI }, { x: 60, z: 420, ry: -Math.PI / 2 },
    ];
    rampSpots.forEach((r) => {
      const ramp = new THREE.Mesh(new THREE.BoxGeometry(8, 1.2, 10), rampMat);
      ramp.position.set(r.x, 0.9, r.z); ramp.rotation.x = -0.42; ramp.rotation.y = r.ry;
      scene.add(ramp);
      this.ramps.push({ x: r.x, z: r.z, angle: r.ry });
    });

    // --- Hospital (mission/respawn landmark) + Marisol's office tower ---
    const hosp = new THREE.Mesh(new THREE.BoxGeometry(40, 22, 26),
      new THREE.MeshLambertMaterial({ color: 0xf5f5f0 }));
    hosp.position.set(-180, 11, -180); scene.add(hosp);
    this.addCollider(-180, -180, 42, 28);
    const cross = new THREE.Mesh(new THREE.BoxGeometry(8, 2, 1),
      new THREE.MeshBasicMaterial({ color: 0xe53935 }));
    cross.position.set(-180, 20, -194); scene.add(cross);
    const cross2 = new THREE.Mesh(new THREE.BoxGeometry(2, 8, 1),
      new THREE.MeshBasicMaterial({ color: 0xe53935 }));
    cross2.position.set(-180, 20, -194); scene.add(cross2);
  }

  // Push a circle (x,z,r) out of building colliders. Returns true if it hit.
  collideCircle(pos, r) {
    let hit = false;
    for (let i = 0; i < this.colliders.length; i++) {
      const c = this.colliders[i];
      const cx = Math.max(c.minX, Math.min(pos.x, c.maxX));
      const cz = Math.max(c.minZ, Math.min(pos.z, c.maxZ));
      const dx = pos.x - cx, dz = pos.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 < r * r) {
        hit = true;
        if (d2 > 1e-6) {
          const d = Math.sqrt(d2);
          pos.x = cx + (dx / d) * r; pos.z = cz + (dz / d) * r;
        } else {
          pos.x += r; // dead centre — shove east
        }
      }
    }
    // World bounds + water edge (cars/peds stop at the shoreline)
    if (pos.x > 425) pos.x = 425;
    if (pos.x < -595) pos.x = -595;
    if (pos.z > 595) pos.z = 595;
    if (pos.z < -595) pos.z = -595;
    return hit;
  }
  inWater(x, z) { return x > 430; }
}

// city.js — builds the whole seeded, deterministic city of Solmar and returns
// its colliders, building rects (for the minimap), roads and landmarks.
import * as THREE from 'three';
import { PALETTE, WORLD } from './palette.js';
import { mulberry32, randRange, pick } from './util.js';

function makeWindowTexture() {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#d8cbb2';
  g.fillRect(0, 0, 64, 128);
  const rng = mulberry32(42);
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 4; col++) {
      const lit = rng() < 0.35;
      g.fillStyle = lit ? '#ffe9a8' : '#2c3e50';
      g.fillRect(6 + col * 14, 8 + row * 15, 9, 10);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeRoadTexture() {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#3a3a40';
  g.fillRect(0, 0, 64, 128);
  g.fillStyle = '#f5e9c8';
  g.fillRect(30, 8, 4, 40);
  g.fillRect(30, 72, 4, 40);
  g.fillStyle = '#c9b18c';
  g.fillRect(0, 0, 3, 128);
  g.fillRect(61, 0, 3, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeSignTexture(text) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#1d4e5e';
  g.fillRect(0, 0, 256, 64);
  g.strokeStyle = '#f5e9c8';
  g.lineWidth = 4;
  g.strokeRect(3, 3, 250, 58);
  g.fillStyle = '#ffe9a8';
  g.font = 'bold 34px sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 128, 34);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const BLOCKS_X = [
  [-175, -155], [-145, -95], [-85, -35], [-25, 25], [35, 85], [95, 145], [155, 175],
];
const BLOCKS_Z = BLOCKS_X.slice();

function isPlaza(x0, x1, z0, z1) {
  return x0 === -25 && z0 === -25;
}
function specialOf(x0, z0) {
  if (x0 === -145 && z0 === -145) return 'tower';
  if (x0 === 95 && z0 === -145) return 'hospital';
  if (x0 === 95 && z0 === 95) return 'chopshop';
  return null;
}

export function buildCity(scene) {
  const rng = mulberry32(WORLD.seed);
  const colliders = { boxes: [], circles: [] };
  const buildings = []; // {x, z, w, d, h} for the minimap + placement checks
  const boats = [];
  const animated = { sea: null, boatMeshes: [] };

  // ---- sky, light, fog ----
  scene.background = new THREE.Color(PALETTE.skyTop);
  scene.fog = new THREE.Fog(0xffe9c4, 220, 620);
  const hemi = new THREE.HemisphereLight(0xbfd9ff, 0xc9a06a, 0.9);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffe0b0, 2.2);
  sun.position.set(120, 180, 60);
  scene.add(sun);
  const sunBall = new THREE.Mesh(
    new THREE.SphereGeometry(9, 16, 12),
    new THREE.MeshBasicMaterial({ color: PALETTE.sun, fog: false }),
  );
  sunBall.position.set(180, 150, -260);
  scene.add(sunBall);
  // a few soft clouds
  const cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 });
  for (let i = 0; i < 7; i++) {
    const cloud = new THREE.Group();
    for (let j = 0; j < 3; j++) {
      const puff = new THREE.Mesh(new THREE.SphereGeometry(randRange(rng, 6, 11), 10, 8), cloudMat);
      puff.position.set(j * 9 - 9, randRange(rng, -1, 1), randRange(rng, -3, 3));
      puff.scale.y = 0.45;
      cloud.add(puff);
    }
    cloud.position.set(randRange(rng, -260, 260), randRange(rng, 90, 140), randRange(rng, -260, 180));
    scene.add(cloud);
  }

  // ---- ground, sand, sea ----
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(560, 560),
    new THREE.MeshLambertMaterial({ color: PALETTE.ground }),
  );
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);
  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(95, 560),
    new THREE.MeshLambertMaterial({ color: PALETTE.sand }),
  );
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(232.5, 0.02, 0);
  scene.add(sand);
  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(460, 760),
    new THREE.MeshLambertMaterial({ color: PALETTE.sea, transparent: true, opacity: 0.94 }),
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(482, 0.05, 0);
  scene.add(sea);
  animated.sea = sea;

  // ---- roads ----
  const roadTex = makeRoadTexture();
  const roadLen = 360;
  for (const x of WORLD.roadXs) {
    const tex = roadTex.clone();
    tex.needsUpdate = true;
    tex.repeat.set(1, roadLen / 16);
    const road = new THREE.Mesh(
      new THREE.PlaneGeometry(WORLD.roadWidth, roadLen),
      new THREE.MeshLambertMaterial({ map: tex }),
    );
    road.rotation.x = -Math.PI / 2;
    road.position.set(x, 0.03, 0);
    scene.add(road);
  }
  for (const z of WORLD.roadZs) {
    const tex = roadTex.clone();
    tex.needsUpdate = true;
    tex.repeat.set(1, roadLen / 16);
    const road = new THREE.Mesh(
      new THREE.PlaneGeometry(WORLD.roadWidth, roadLen),
      new THREE.MeshLambertMaterial({ map: tex }),
    );
    road.rotation.x = -Math.PI / 2;
    road.rotation.z = Math.PI / 2;
    road.position.set(0, 0.03, z);
    scene.add(road);
  }

  // ---- plaza + fountain (solid collider) ----
  const plaza = new THREE.Mesh(
    new THREE.PlaneGeometry(50, 50),
    new THREE.MeshLambertMaterial({ color: PALETTE.plaza }),
  );
  plaza.rotation.x = -Math.PI / 2;
  plaza.position.set(0, 0.04, 0);
  scene.add(plaza);
  const basin = new THREE.Mesh(
    new THREE.CylinderGeometry(6, 6.6, 1.1, 24),
    new THREE.MeshLambertMaterial({ color: 0xcfc4ae }),
  );
  basin.position.set(0, 0.55, 0);
  scene.add(basin);
  const water = new THREE.Mesh(
    new THREE.CylinderGeometry(5.4, 5.4, 0.25, 24),
    new THREE.MeshLambertMaterial({ color: PALETTE.fountain, transparent: true, opacity: 0.9 }),
  );
  water.position.set(0, 1.05, 0);
  scene.add(water);
  const column = new THREE.Mesh(
    new THREE.CylinderGeometry(0.7, 0.9, 3.2, 12),
    new THREE.MeshLambertMaterial({ color: 0xe8e0d0 }),
  );
  column.position.set(0, 2.4, 0);
  scene.add(column);
  const orb = new THREE.Mesh(
    new THREE.SphereGeometry(0.9, 12, 10),
    new THREE.MeshLambertMaterial({ color: PALETTE.gold, emissive: 0x664400 }),
  );
  orb.position.set(0, 4.4, 0);
  scene.add(orb);
  colliders.circles.push({ x: 0, z: 0, r: 6.6 });

  // ---- buildings ----
  const winTex = makeWindowTexture();
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const mats = PALETTE.building.map(
    (c) => new THREE.MeshLambertMaterial({ color: c, map: winTex }),
  );
  const addBuilding = (x, z, w, d, h, matIdx) => {
    const mesh = new THREE.Mesh(boxGeo, mats[matIdx % mats.length]);
    mesh.position.set(x, h / 2, z);
    mesh.scale.set(w, h, d);
    scene.add(mesh);
    buildings.push({ x, z, w, d, h });
    colliders.boxes.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
  };

  for (const [x0, x1] of BLOCKS_X) {
    for (const [z0, z1] of BLOCKS_Z) {
      if (isPlaza(x0, x1, z0, z1)) continue;
      const special = specialOf(x0, z0);
      const cx = (x0 + x1) / 2;
      const cz = (z0 + z1) / 2;
      if (special === 'tower') {
        // Solmar Tower landmark: one tall gold tower + antenna.
        addBuilding(cx, cz, 30, 30, 92, 0);
        const antenna = new THREE.Mesh(
          new THREE.CylinderGeometry(0.6, 0.9, 18, 8),
          new THREE.MeshLambertMaterial({ color: 0x888888 }),
        );
        antenna.position.set(cx, 101, cz);
        scene.add(antenna);
        const beacon = new THREE.Mesh(
          new THREE.SphereGeometry(1.2, 10, 8),
          new THREE.MeshBasicMaterial({ color: 0xff4444 }),
        );
        beacon.position.set(cx, 110, cz);
        scene.add(beacon);
        continue;
      }
      if (special === 'hospital') {
        addBuilding(cx, cz, 36, 26, 16, 4);
        const crossMat = new THREE.MeshLambertMaterial({ color: PALETTE.hospitalCross });
        const crossV = new THREE.Mesh(new THREE.BoxGeometry(2.4, 7, 0.6), crossMat);
        crossV.position.set(cx, 12, cz - 13.4);
        scene.add(crossV);
        const crossH = new THREE.Mesh(new THREE.BoxGeometry(7, 2.4, 0.6), crossMat);
        crossH.position.set(cx, 12, cz - 13.4);
        scene.add(crossH);
        continue;
      }
      if (special === 'chopshop') {
        addBuilding(cx, cz, 32, 24, 10, 5);
        continue;
      }
      const bw = x1 - x0;
      const bd = z1 - z0;
      const cols = bw < 30 ? 1 : 2;
      const rows = bd < 30 ? 1 : 2;
      for (let ci = 0; ci < cols; ci++) {
        for (let ri = 0; ri < rows; ri++) {
          if (rng() < 0.1) continue; // variety: some lots stay empty
          const cellX = x0 + ((ci + 0.5) / cols) * bw;
          const cellZ = z0 + ((ri + 0.5) / rows) * bd;
          const w = randRange(rng, 12, Math.min(20, bw / cols - 3));
          const d = randRange(rng, 12, Math.min(20, bd / rows - 3));
          const h = randRange(rng, 8, 36);
          addBuilding(
            cellX + randRange(rng, -2, 2),
            cellZ + randRange(rng, -2, 2),
            w, d, h,
            Math.floor(rng() * mats.length),
          );
        }
      }
    }
  }

  // ---- pier + marina boats ----
  const pierMat = new THREE.MeshLambertMaterial({ color: PALETTE.pier });
  const deck = new THREE.Mesh(new THREE.BoxGeometry(85, 0.8, 9), pierMat);
  deck.position.set(237, 1.1, 0);
  scene.add(deck);
  for (let i = 0; i < 6; i++) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 3, 8), pierMat);
    post.position.set(200 + i * 14, 0.2, i % 2 === 0 ? -4 : 4);
    scene.add(post);
  }
  colliders.boxes.push({ minX: 194, maxX: 280, minZ: -4.5, maxZ: 4.5 });
  for (let i = 0; i < 5; i++) {
    const bx = 268 + randRange(rng, -6, 18);
    const bz = -46 + i * 22 + randRange(rng, -4, 4);
    const boat = new THREE.Group();
    const hull = new THREE.Mesh(
      new THREE.BoxGeometry(9, 1.6, 3.4),
      new THREE.MeshLambertMaterial({ color: pick(rng, PALETTE.boatHull) }),
    );
    hull.position.y = 0.4;
    boat.add(hull);
    const cabin = new THREE.Mesh(
      new THREE.BoxGeometry(3.4, 1.6, 2.6),
      new THREE.MeshLambertMaterial({ color: 0xe8e8e8 }),
    );
    cabin.position.set(-0.8, 1.8, 0);
    boat.add(cabin);
    const mast = new THREE.Mesh(
      new THREE.CylinderGeometry(0.14, 0.14, 7, 6),
      new THREE.MeshLambertMaterial({ color: 0x5a4a3a }),
    );
    mast.position.set(1.2, 4.6, 0);
    boat.add(mast);
    boat.position.set(bx, 0, bz);
    boat.rotation.y = randRange(rng, -0.3, 0.3);
    scene.add(boat);
    boats.push(boat);
    animated.boatMeshes.push(boat);
  }

  // ---- palms (instanced trunks + fronds) ----
  const palmSpots = [];
  for (let i = 0; i < 46; i++) {
    palmSpots.push({ x: randRange(rng, 192, 246), z: randRange(rng, -240, 240) });
  }
  for (let i = 0; i < 14; i++) {
    const a = rng() * Math.PI * 2;
    palmSpots.push({ x: Math.cos(a) * randRange(rng, 12, 22), z: Math.sin(a) * randRange(rng, 12, 22) });
  }
  for (let i = 0; i < 10; i++) {
    palmSpots.push({ x: randRange(rng, -170, 170), z: pick(rng, [-158, -98, -38, 38, 98, 158]) });
  }
  const trunkGeo = new THREE.CylinderGeometry(0.28, 0.45, 6.5, 7);
  const trunkMat = new THREE.MeshLambertMaterial({ color: PALETTE.palmTrunk });
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, palmSpots.length);
  const frondGeo = new THREE.ConeGeometry(1.5, 4.2, 5);
  const frondMat = new THREE.MeshLambertMaterial({ color: PALETTE.palmLeaf });
  const fronds = new THREE.InstancedMesh(frondGeo, frondMat, palmSpots.length * 6);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const v = new THREE.Vector3();
  const s = new THREE.Vector3();
  palmSpots.forEach((p, i) => {
    e.set(0, 0, randRange(rng, -0.08, 0.08));
    q.setFromEuler(e);
    v.set(p.x, 3.25, p.z);
    s.set(1, 1, 1);
    m4.compose(v, q, s);
    trunks.setMatrixAt(i, m4);
    colliders.circles.push({ x: p.x, z: p.z, r: 0.7 });
    for (let f = 0; f < 6; f++) {
      const a = (f / 6) * Math.PI * 2 + rng() * 0.5;
      e.set(Math.PI / 2.6, 0, a, 'YXZ');
      q.setFromEuler(e);
      v.set(p.x + Math.cos(a) * 1.6, 6.6, p.z + Math.sin(a) * 1.6);
      s.set(1, 0.32, 1);
      m4.compose(v, q, s);
      fronds.setMatrixAt(i * 6 + f, m4);
    }
  });
  scene.add(trunks);
  scene.add(fronds);

  // ---- streetlights (instanced poles + lamp heads) ----
  const lightSpots = [];
  for (const x of WORLD.roadXs) {
    for (const z of [-120, -60, 0, 60, 120]) lightSpots.push({ x: x + 6.5, z });
  }
  for (const z of WORLD.roadZs) {
    for (const x of [-120, -60, 0, 60, 120]) lightSpots.push({ x, z: z + 6.5 });
  }
  const poleGeo = new THREE.CylinderGeometry(0.14, 0.18, 6, 6);
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x44484e });
  const poles = new THREE.InstancedMesh(poleGeo, poleMat, lightSpots.length);
  const headGeo = new THREE.SphereGeometry(0.5, 8, 6);
  const heads = new THREE.InstancedMesh(
    headGeo,
    new THREE.MeshLambertMaterial({ color: 0xffe9a8 }),
    lightSpots.length,
  );
  lightSpots.forEach((p, i) => {
    e.set(0, 0, 0);
    q.setFromEuler(e);
    v.set(p.x, 3, p.z);
    s.set(1, 1, 1);
    m4.compose(v, q, s);
    poles.setMatrixAt(i, m4);
    v.set(p.x, 6.1, p.z);
    m4.compose(v, q, s);
    heads.setMatrixAt(i, m4);
  });
  scene.add(poles);
  scene.add(heads);

  // ---- road signs ----
  const signDefs = [
    { text: 'SOLMAR', x: 158, z: 38, ry: -Math.PI / 2 },
    { text: 'MARINA', x: 186, z: -24, ry: -Math.PI / 2 },
    { text: 'CHOP SHOP', x: 96, z: 88, ry: Math.PI },
  ];
  const postMat = new THREE.MeshLambertMaterial({ color: 0x666666 });
  for (const sd of signDefs) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 4.4, 6), postMat);
    post.position.set(sd.x, 2.2, sd.z);
    scene.add(post);
    const board = new THREE.Mesh(
      new THREE.PlaneGeometry(9, 2.25),
      new THREE.MeshLambertMaterial({ map: makeSignTexture(sd.text), side: THREE.DoubleSide }),
    );
    board.position.set(sd.x, 4.6, sd.z);
    board.rotation.y = sd.ry;
    scene.add(board);
  }

  const landmarks = {
    tower: { x: -120, z: -120 },
    hospital: { x: 120, z: -120 },
    chopShop: { x: 120, z: 120 },
    plaza: { x: 0, z: 0 },
    marina: { x: 215, z: 40 },
    beach: { x: 215, z: 0 },
    pier: { x: 240, z: 0 },
  };

  function update(dt, time) {
    // Gentle sea shimmer + boat bob; purely cosmetic.
    if (animated.sea) animated.sea.position.y = 0.05 + Math.sin(time * 0.6) * 0.06;
    for (const b of animated.boatMeshes) {
      b.position.y = Math.sin(time * 0.8 + b.position.z) * 0.12;
      b.rotation.z = Math.sin(time * 0.5 + b.position.x) * 0.02;
    }
  }

  return { colliders, buildings, roads: { xs: WORLD.roadXs, zs: WORLD.roadZs, width: WORLD.roadWidth }, landmarks, update, buildingCount: buildings.length };
}

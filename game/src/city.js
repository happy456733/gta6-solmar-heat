// Solmar Heat — the city of Solmar: ground, roads, buildings, palms, beach,
// ocean, clouds and the day/night sun. All textures are drawn on canvas at
// runtime; no image files are loaded.
import * as THREE from 'three';
import { CFG, W, STREETS, rand, randi, pick, mulberry32, makeCanvas, canvasTexture, clamp } from './world.js';

const PALETTE = [
  0xf2d8a7, 0xe8b48a, 0xd98c6a, 0x9fc3c9, 0x7fa8b8, 0xc9a06a,
  0xe6c9c9, 0xb8c9a3, 0xd9b8d0, 0xf0e0c0, 0x8fb8a8, 0xc9c9c9,
];
const GLASS = [0x5a7a8a, 0x6a8a9a, 0x4a6a7a, 0x7a9aaa];

function facadeTexture(base, windows, lit) {
  const c = makeCanvas(128, 256);
  const g = c.getContext('2d');
  g.fillStyle = base;
  g.fillRect(0, 0, 128, 256);
  // subtle vertical shading
  const grad = g.createLinearGradient(0, 0, 128, 0);
  grad.addColorStop(0, 'rgba(0,0,0,0.18)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0.10)');
  grad.addColorStop(1, 'rgba(0,0,0,0.18)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 256);
  const cols = 6, rows = 12;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const px = 10 + x * 19, py = 12 + y * 20;
      const isLit = Math.random() < lit;
      g.fillStyle = isLit ? '#ffd98a' : 'rgba(20,30,44,0.85)';
      g.fillRect(px, py, 12, 13);
    }
  }
  // ground-floor shopfront
  g.fillStyle = 'rgba(20,20,28,0.9)';
  g.fillRect(6, 232, 116, 20);
  g.fillStyle = '#ffd98a';
  g.fillRect(10, 236, 108, 3);
  return canvasTexture(c);
}

function groundTexture() {
  const S = 2048, G = CFG.GROUND;
  const c = makeCanvas(S, S);
  const g = c.getContext('2d');
  const px = (v) => ((v + G / 2) / G) * S; // world -> canvas
  const sc = S / G;
  // base: warm concrete
  g.fillStyle = '#b8ab8e';
  g.fillRect(0, 0, S, S);
  // blocks: pale pavement with a green tint for parks
  for (let i = -4; i < 4; i++) {
    for (let j = -4; j < 4; j++) {
      const x0 = i * CFG.PITCH + CFG.STREET / 2, z0 = j * CFG.PITCH + CFG.STREET / 2;
      const w = CFG.BLOCK;
      const isPark = (i === 1 && j === -1) || (i === -2 && j === 2);
      g.fillStyle = isPark ? '#7fae6a' : '#c9bfa4';
      g.fillRect(px(x0), px(z0), w * sc, w * sc);
      if (isPark) {
        g.strokeStyle = '#e8dcc0';
        g.lineWidth = 3;
        g.strokeRect(px(x0) + 8, px(z0) + 8, w * sc - 16, w * sc - 16);
        g.beginPath();
        g.moveTo(px(x0), px(z0 + w / 2));
        g.lineTo(px(x0 + w), px(z0 + w / 2));
        g.moveTo(px(x0 + w / 2), px(z0));
        g.lineTo(px(x0 + w / 2), px(z0 + w));
        g.stroke();
      }
    }
  }
  // roads
  g.fillStyle = '#33333a';
  for (const s of STREETS) {
    g.fillRect(px(s - CFG.STREET / 2), 0, CFG.STREET * sc, S);
    g.fillRect(0, px(s - CFG.STREET / 2), S, CFG.STREET * sc);
  }
  // lane dashes
  g.fillStyle = '#e8c85a';
  for (const s of STREETS) {
    for (let v = -CFG.HALF; v < CFG.HALF; v += 18) {
      g.fillRect(px(v), px(s - 0.6), 9 * sc, 1.2 * sc);
      g.fillRect(px(s - 0.6), px(v), 1.2 * sc, 9 * sc);
    }
  }
  // crosswalks at every intersection (narrow stripes, wide gaps, so they read as dashes)
  g.fillStyle = 'rgba(240,240,235,0.75)';
  for (const sx of STREETS) {
    for (const sz of STREETS) {
      for (let k = -2; k <= 2; k++) {
        g.fillRect(px(sx + k * 4.6 - 0.6), px(sz - CFG.STREET / 2 + 1), 1.2 * sc, 3.4 * sc);
        g.fillRect(px(sx + k * 4.6 - 0.6), px(sz + CFG.STREET / 2 - 4.4), 1.2 * sc, 3.4 * sc);
        g.fillRect(px(sx - CFG.STREET / 2 + 1), px(sz + k * 4.6 - 0.6), 3.4 * sc, 1.2 * sc);
        g.fillRect(px(sx + CFG.STREET / 2 - 4.4), px(sz + k * 4.6 - 0.6), 3.4 * sc, 1.2 * sc);
      }
    }
  }
  // beach + ocean (south edge, +z)
  const beachY = px(CFG.BEACH_Z);
  g.fillStyle = '#ecd9a0';
  g.fillRect(0, beachY, S, px(CFG.WATER_Z) - beachY);
  const og = g.createLinearGradient(0, px(CFG.WATER_Z), 0, S);
  og.addColorStop(0, '#2a9ab8');
  og.addColorStop(1, '#0a5a8a');
  g.fillStyle = og;
  g.fillRect(0, px(CFG.WATER_Z), S, S - px(CFG.WATER_Z));
  // foam line
  g.fillStyle = 'rgba(255,255,255,0.55)';
  g.fillRect(0, px(CFG.WATER_Z) - 2, S, 4);
  // boardwalk
  g.fillStyle = '#8a6a4a';
  g.fillRect(0, beachY - 8, S, 8);
  return canvasTexture(c);
}

function makePalm(rng) {
  const group = new THREE.Group();
  const h = 5 + rng() * 2.5;
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x8a6a4a });
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.24, h, 6), trunkMat);
  trunk.position.y = h / 2;
  trunk.rotation.z = (rng() - 0.5) * 0.16;
  group.add(trunk);
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x2e8a4a, side: THREE.DoubleSide });
  for (let i = 0; i < 7; i++) {
    const leaf = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 3.4), leafMat);
    const a = (i / 7) * Math.PI * 2;
    leaf.position.set(Math.cos(a) * 0.9, h + 0.15, Math.sin(a) * 0.9);
    leaf.rotation.set(Math.sin(a) * 1.05, 0, -Math.cos(a) * 1.05);
    leaf.rotation.y = -a;
    group.add(leaf);
  }
  const nuts = new THREE.Mesh(new THREE.SphereGeometry(0.28, 6, 5),
    new THREE.MeshLambertMaterial({ color: 0x6a4a2a }));
  nuts.position.y = h - 0.1;
  group.add(nuts);
  return group;
}

function makeLamp() {
  const group = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color: 0x3a3a42 });
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 6.4, 6), mat);
  pole.position.y = 3.2;
  group.add(pole);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.12, 0.12), mat);
  arm.position.set(0.8, 6.3, 0);
  group.add(arm);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0xffe9a8 }));
  bulb.position.set(1.6, 6.2, 0);
  bulb.name = 'lampbulb';
  group.add(bulb);
  return group;
}

export function buildCity() {
  const rng = mulberry32(20261117);
  const scene = W.scene;
  const city = { sun: null, moon: null, hemi: null, water: null, clouds: [], lamps: [], update: null };

  // --- ground ---
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(CFG.GROUND, CFG.GROUND),
    new THREE.MeshLambertMaterial({ map: groundTexture() }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // --- buildings ---
  const facadeMats = [];
  for (let i = 0; i < 8; i++) {
    const base = '#' + pick(PALETTE).toString(16).padStart(6, '0');
    facadeMats.push(new THREE.MeshLambertMaterial({ map: facadeTexture(base, 0, 0.12) }));
  }
  const glassMats = GLASS.map((c) => new THREE.MeshLambertMaterial({ color: c }));
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x4a4a52 });
  const downtown = (x, z) => Math.hypot(x, z) < 150;
  const parkBlocks = new Set(['1,-1', '-2,2']);
  // central plaza + story blocks (garage, safehouse, bank) stay clear so their
  // landmarks and mission markers are never walled off by random buildings
  const skipBlocks = new Set(['0,0', '0,-1', '-1,0', '1,0', '-2,-1', '-1,-2']);

  for (let i = -4; i < 4; i++) {
    for (let j = -4; j < 4; j++) {
      const key = `${i},${j}`;
      if (parkBlocks.has(key) || skipBlocks.has(key)) continue;
      const bx = i * CFG.PITCH + CFG.STREET / 2;
      const bz = j * CFG.PITCH + CFG.STREET / 2;
      const cx = bx + CFG.BLOCK / 2, cz = bz + CFG.BLOCK / 2;
      const n = downtown(cx, cz) ? (rng() < 0.5 ? 1 : 2) : randi(1, 3);
      for (let k = 0; k < n; k++) {
        const w = rand(14, 26), d = rand(14, 26);
        const h = downtown(cx, cz) ? rand(28, 68) : rand(7, 26);
        const ox = bx + 4 + rng() * (CFG.BLOCK - 8 - w);
        const oz = bz + 4 + rng() * (CFG.BLOCK - 8 - d);
        const mat = rng() < 0.3 ? pick(glassMats) : pick(facadeMats);
        const b = new THREE.Mesh(boxGeo, mat);
        b.scale.set(w, h, d);
        b.position.set(ox + w / 2, h / 2, oz + d / 2);
        b.castShadow = h > 20;
        b.receiveShadow = true;
        scene.add(b);
        const roof = new THREE.Mesh(boxGeo, roofMat);
        roof.scale.set(w * 0.92, 0.5, d * 0.92);
        roof.position.set(ox + w / 2, h + 0.25, oz + d / 2);
        scene.add(roof);
        W.colliders.push({ minX: ox, maxX: ox + w, minZ: oz, maxZ: oz + d });
        W.buildings.push({ minX: ox, maxX: ox + w, minZ: oz, maxZ: oz + d, h });
        if (h > 40) { // rooftop beacon
          const bc = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6),
            new THREE.MeshBasicMaterial({ color: 0xff4444 }));
          bc.position.set(ox + w / 2, h + 1.2, oz + d / 2);
          bc.name = 'beacon';
          scene.add(bc);
        }
      }
    }
  }

  // --- central plaza: fountain + benches ---
  const plaza = new THREE.Group();
  const fountain = new THREE.Mesh(new THREE.CylinderGeometry(7, 8, 1.2, 20),
    new THREE.MeshLambertMaterial({ color: 0x9aa8b8 }));
  fountain.position.y = 0.6;
  plaza.add(fountain);
  const waterTop = new THREE.Mesh(new THREE.CylinderGeometry(6.4, 6.4, 0.3, 20),
    new THREE.MeshPhongMaterial({ color: 0x3a9ac8, shininess: 120 }));
  waterTop.position.y = 1.25;
  plaza.add(waterTop);
  plaza.position.set(0, 0, 0);
  scene.add(plaza);
  W.colliders.push({ minX: -8, maxX: 8, minZ: -8, maxZ: 8 });

  // --- palms: sidewalks + beach ---
  for (let i = 0; i < 90; i++) {
    const s = pick(STREETS);
    const along = rand(-CFG.HALF, CFG.HALF);
    const side = pick([-1, 1]);
    const x = rng() < 0.5 ? s + side * (CFG.STREET / 2 + 2.5) : along;
    const z = rng() < 0.5 ? along : s + side * (CFG.STREET / 2 + 2.5);
    if (Math.abs(x) > CFG.HALF || Math.abs(z) > CFG.HALF) continue;
    const palm = makePalm(rng);
    palm.position.set(x, 0, z);
    palm.rotation.y = rng() * Math.PI * 2;
    scene.add(palm);
  }
  for (let i = 0; i < 16; i++) {
    const palm = makePalm(rng);
    palm.position.set(rand(-300, 300), 0, rand(CFG.BEACH_Z + 4, CFG.BEACH_Z + 22));
    palm.rotation.y = rng() * Math.PI * 2;
    scene.add(palm);
  }

  // --- street lamps at intersections ---
  for (const sx of STREETS) {
    for (const sz of STREETS) {
      if (Math.abs(sx) > CFG.HALF || Math.abs(sz) > CFG.HALF) continue;
      const lamp = makeLamp();
      lamp.position.set(sx + CFG.STREET / 2 + 1.2, 0, sz + CFG.STREET / 2 + 1.2);
      lamp.rotation.y = Math.PI / 4;
      scene.add(lamp);
      city.lamps.push(lamp);
    }
  }

  // --- ocean plane (animated) ---
  const waterGeo = new THREE.PlaneGeometry(760, 120);
  const waterMat = new THREE.MeshPhongMaterial({ color: 0x1a7aa8, shininess: 160, transparent: true, opacity: 0.92 });
  const water = new THREE.Mesh(waterGeo, waterMat);
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, 0.4, CFG.WATER_Z + 60);
  scene.add(water);
  city.water = water;

  // --- clouds ---
  const cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 });
  for (let i = 0; i < 14; i++) {
    const cl = new THREE.Group();
    for (let k = 0; k < 4; k++) {
      const puff = new THREE.Mesh(new THREE.SphereGeometry(rand(6, 13), 8, 6), cloudMat);
      puff.position.set(rand(-14, 14), rand(-1, 1), rand(-6, 6));
      puff.scale.y = 0.45;
      cl.add(puff);
    }
    cl.position.set(rand(-380, 380), rand(70, 110), rand(-380, 380));
    cl.userData.speed = rand(0.6, 1.6);
    scene.add(cl);
    city.clouds.push(cl);
  }

  // --- lights ---
  const hemi = new THREE.HemisphereLight(0xbfd8ff, 0x8a7a5a, 0.9);
  scene.add(hemi);
  city.hemi = hemi;
  const sun = new THREE.DirectionalLight(0xffd9a0, 2.2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -320; sun.shadow.camera.right = 320;
  sun.shadow.camera.top = 320; sun.shadow.camera.bottom = -320;
  sun.shadow.camera.far = 900;
  sun.shadow.bias = -0.0004;
  scene.add(sun);
  scene.add(sun.target);
  city.sun = sun;
  const moon = new THREE.DirectionalLight(0x8aa8ff, 0.0);
  moon.position.set(-120, 200, -80);
  scene.add(moon);
  city.moon = moon;

  // --- distant skyline silhouettes (north edge) ---
  const silMat = new THREE.MeshBasicMaterial({ color: 0x8a94a8, fog: true });
  for (let i = 0; i < 18; i++) {
    const h = rand(40, 110);
    const sil = new THREE.Mesh(boxGeo, silMat);
    sil.scale.set(rand(18, 34), h, 18);
    sil.position.set(rand(-420, 420), h / 2, -rand(360, 420));
    scene.add(sil);
  }

  scene.fog = new THREE.Fog(0xcfe0f0, 320, 900);

  city.update = (dt) => {
    const t = W.dayTime; // 0..1, full 24h: 0 dawn, 0.25 noon, 0.5 dusk, 0.75 midnight
    const ang = t * Math.PI * 2;
    const sunH = Math.sin(ang); // 1 at noon, -1 at midnight
    const day = clamp(sunH * 1.6, 0, 1);
    const dusk = clamp(1 - Math.abs(t - 0.5) * 4, 0, 1) * (1 - day);
    sun.position.set(Math.cos(ang) * 420, 60 + sunH * 320, 180);
    sun.intensity = 0.1 + day * 2.2;
    sun.color.setHSL(0.09 + day * 0.02, 0.55, 0.55 + day * 0.15);
    moon.intensity = day < 0.15 ? 1.0 : 0;
    hemi.intensity = 0.45 + day * 0.55;
    const sky = new THREE.Color();
    if (day > 0.5) sky.setHSL(0.58, 0.55, 0.62 + day * 0.12);
    else if (t < 0.5) sky.setHSL(0.07 + dusk * 0.03, 0.6, 0.42 + day * 0.1); // dawn/dusk orange
    else sky.setHSL(0.62, 0.4, 0.2 + day * 0.1); // night
    scene.background = sky;
    scene.fog.color.copy(sky);
    // lamps glow at night
    const night = 1 - day;
    for (const lamp of city.lamps) {
      lamp.traverse((o) => {
        if (o.name === 'lampbulb') o.material.color.setHex(night > 0.4 ? 0xffe9a8 : 0x8a8a7a);
      });
    }
    // water shimmer
    water.position.y = 0.4 + Math.sin(W.elapsed * 0.7) * 0.15;
    // clouds drift
    for (const cl of city.clouds) {
      cl.position.x += cl.userData.speed * dt;
      if (cl.position.x > 420) cl.position.x = -420;
    }
    // follow the player with the shadow camera
    const p = W.player ? W.player.pos : { x: 0, z: 0 };
    sun.target.position.set(p.x, 0, p.z);
    sun.position.set(p.x + Math.cos(ang) * 420, 60 + sunH * 320, p.z + 180);
  };

  W.city = city;
  return city;
}

// Random point on a road (for spawning cars).
export function randomRoadPoint(rng = Math.random) {
  const horizontal = rng() < 0.5;
  const s = pick(STREETS);
  const along = rand(-CFG.HALF + 20, CFG.HALF - 20);
  return horizontal ? { x: along, z: s } : { x: s, z: along };
}
// Random sidewalk point (for pedestrians).
export function randomSidewalkPoint(rng = Math.random) {
  const s = pick(STREETS);
  const along = rand(-CFG.HALF + 10, CFG.HALF - 10);
  const side = pick([-1, 1]);
  const off = CFG.STREET / 2 + 3 + rng() * 3;
  return rng() < 0.5
    ? { x: along, z: s + side * off }
    : { x: s + side * off, z: along };
}

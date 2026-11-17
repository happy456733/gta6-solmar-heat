// Solmar Heat — shared world state, constants and small helpers.
// Every game module imports this one; main.js fills W at boot.
import * as THREE from 'three';

export const CFG = {
  PITCH: 72, // distance between street centrelines
  STREET: 16, // street width
  HALF: 296, // city playable half-extent (roads run -288..288)
  GROUND: 760, // ground plane size
  BEACH_Z: 322, // sand strip starts here (south edge)
  WATER_Z: 352, // ocean starts here
  BLOCK: 56, // block size between streets
  DAY_LENGTH: 600, // seconds for a full day cycle
  GRAVITY: 26,
  WALK_SPEED: 7,
  RUN_SPEED: 11.5,
};

// Mutable game state, filled in by main.js and the systems.
export const W = {
  scene: null,
  camera: null,
  renderer: null,
  clock: null,
  elapsed: 0,
  dayTime: 0.32, // 0..1, 0.25 = dawn, 0.5 = noon, 0.75 = dusk
  mode: 'menu', // menu | play | paused | busted | wasted
  timeScale: 1,
  shotMode: null, // 'chase' | 'city' | 'mission' | 'night' when ?shot= is set
  shotCamYaw: undefined, // front-quarter camera angle for chase/night shots
  shotCamDist: undefined,
  input: { keys: new Set(), mouseDX: 0, mouseDY: 0, locked: false, click: false },
  camYaw: Math.PI / 2, // camera sits at pos + dist*(sin cy, cos cy); PI/2 = behind the player at spawn
  camPitch: 0.32,
  camDist: 9,
  player: null, // { pos, vel, heading, onFoot, car, health, mesh, ... }
  cash: 0,
  wanted: 0,
  heat: 0, // 0..5+, floor(heat) = wanted stars
  lastCrime: -999,
  lastShot: -999,
  cars: [], // all cars (player, traffic, police)
  traffic: [],
  policeCars: [],
  cops: [],
  peds: [],
  parked: [],
  buildings: [], // { minX, maxX, minZ, maxZ, h }
  colliders: [], // building AABBs {minX,maxX,minZ,maxZ}
  pickups: [], // cash drop meshes
  city: null, // handles from city.js (sun, moon, water, clouds, update)
  missions: null,
  hud: null,
  audio: null,
  effects: null,
  save: null,
  stats: { carsStolen: 0, pedsHit: 0, missionsDone: 0, distance: 0 },
};

export function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
export function lerp(a, b, t) { return a + (b - a) * t; }
export function rand(a = 1, b) { return b === undefined ? Math.random() * a : a + Math.random() * (b - a); }
export function randi(a, b) { return Math.floor(rand(a, b + 1)); }
export function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
export function mulberry32(seed) {
  let s = seed >>> 0;
  return function () {
    s |= 0; s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function angleDiff(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}
export function angleLerp(a, b, t) { return a + angleDiff(a, b) * t; }

// Street centrelines, -288..288 step 72.
export const STREETS = [];
for (let i = -4; i <= 4; i++) STREETS.push(i * CFG.PITCH);

export function nearestStreet(v) {
  let best = STREETS[0];
  for (const s of STREETS) if (Math.abs(v - s) < Math.abs(v - best)) best = s;
  return best;
}
// True when (x,z) is on a road (within the street half-width + kerb).
export function isOnRoad(x, z) {
  const hw = CFG.STREET / 2 + 1.5;
  for (const s of STREETS) {
    if (Math.abs(x - s) < hw || Math.abs(z - s) < hw) return true;
  }
  return false;
}
// Clamp a point inside the playable city.
export function clampToCity(p) {
  p.x = clamp(p.x, -CFG.HALF, CFG.HALF);
  p.z = clamp(p.z, -CFG.HALF, CFG.BEACH_Z + 26);
  return p;
}
// Circle (x,z,r) vs building AABBs: push the circle out, return corrected pos.
export function collideCircle(x, z, r) {
  for (const b of W.colliders) {
    const cx = clamp(x, b.minX, b.maxX);
    const cz = clamp(z, b.minZ, b.maxZ);
    const dx = x - cx, dz = z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 < r * r) {
      if (d2 > 0.0001) {
        const d = Math.sqrt(d2);
        x = cx + (dx / d) * r;
        z = cz + (dz / d) * r;
      } else {
        // centre inside the box: push out along the smallest penetration axis
        const pl = x - (b.minX - r), pr = (b.maxX + r) - x;
        const pt = z - (b.minZ - r), pb = (b.maxZ + r) - z;
        const m = Math.min(pl, pr, pt, pb);
        if (m === pl) x = b.minX - r; else if (m === pr) x = b.maxX + r;
        else if (m === pt) z = b.minZ - r; else z = b.maxZ + r;
      }
    }
  }
  return { x, z };
}
export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}
export function canvasTexture(canvas) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

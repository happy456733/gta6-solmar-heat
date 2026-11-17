// Solmar Heat — particle bursts (sparks, smoke, muzzle flash) and camera shake.
import * as THREE from 'three';
import { W, rand } from './world.js';

export function createEffects() {
  const E = { points: [], shakeAmt: 0, shakeT: 0 };
  const MAX = 420;
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(MAX * 3);
  const col = new Float32Array(MAX * 3);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mat = new THREE.PointsMaterial({ size: 0.55, vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false });
  const cloud = new THREE.Points(geo, mat);
  cloud.frustumCulled = false;
  W.scene.add(cloud);

  function spawn(x, y, z, vx, vy, vz, life, r, g, b) {
    if (E.points.length >= MAX) E.points.shift();
    E.points.push({ x, y, z, vx, vy, vz, life, maxLife: life, r, g, b });
  }
  E.sparks = (p, n = 14) => {
    for (let i = 0; i < n; i++) {
      const a = rand(Math.PI * 2), s = rand(3, 11);
      spawn(p.x, p.y + 0.4, p.z, Math.cos(a) * s, rand(2, 8), Math.sin(a) * s, rand(0.25, 0.6), 1, rand(0.6, 1), 0.35);
    }
  };
  E.smoke = (p, n = 8) => {
    for (let i = 0; i < n; i++) {
      spawn(p.x + rand(-0.5, 0.5), p.y + rand(0.3, 1), p.z + rand(-0.5, 0.5),
        rand(-0.6, 0.6), rand(1, 2.6), rand(-0.6, 0.6), rand(0.8, 1.6), 0.32, 0.32, 0.34);
    }
  };
  E.muzzle = (p, dir) => {
    for (let i = 0; i < 7; i++) {
      spawn(p.x, p.y, p.z, dir.x * rand(14, 22) + rand(-2, 2), rand(-1, 2), dir.z * rand(14, 22) + rand(-2, 2),
        rand(0.08, 0.16), 1, 0.85, 0.3);
    }
  };
  E.cashBurst = (p) => {
    for (let i = 0; i < 18; i++) {
      const a = rand(Math.PI * 2), s = rand(2, 7);
      spawn(p.x, p.y + 0.5, p.z, Math.cos(a) * s, rand(3, 8), Math.sin(a) * s, rand(0.5, 1), 0.3, 1, 0.4);
    }
  };
  E.shake = (amt) => { E.shakeAmt = Math.max(E.shakeAmt, amt); E.shakeT = 0.35; };
  E.applyShake = (cam) => {
    if (E.shakeT > 0) {
      cam.position.x += rand(-1, 1) * E.shakeAmt * E.shakeT;
      cam.position.y += rand(-1, 1) * E.shakeAmt * E.shakeT * 0.6;
      E.shakeT -= 1 / 60;
      if (E.shakeT <= 0) E.shakeAmt = 0;
    }
  };
  E.update = (dt) => {
    const pa = geo.attributes.position.array;
    const ca = geo.attributes.color.array;
    for (let i = 0; i < MAX; i++) {
      const pt = E.points[i];
      if (!pt) { pa[i * 3 + 1] = -999; continue; }
      pt.life -= dt;
      if (pt.life <= 0) { E.points.splice(i, 1); i--; pa[i * 3 + 1] = -999; continue; }
      pt.vy -= 9 * dt;
      pt.x += pt.vx * dt; pt.y += pt.vy * dt; pt.z += pt.vz * dt;
      if (pt.y < 0.05) { pt.y = 0.05; pt.vy *= -0.3; pt.vx *= 0.7; pt.vz *= 0.7; }
      pa[i * 3] = pt.x; pa[i * 3 + 1] = pt.y; pa[i * 3 + 2] = pt.z;
      const f = pt.life / pt.maxLife;
      ca[i * 3] = pt.r * f; ca[i * 3 + 1] = pt.g * f; ca[i * 3 + 2] = pt.b * f;
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
  };
  return E;
}

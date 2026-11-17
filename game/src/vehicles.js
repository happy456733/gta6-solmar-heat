// Solmar Heat — cars: the boxy low-poly car factory, arcade driving physics,
// parked cars to steal, and traffic that follows the street grid.
import * as THREE from 'three';
import { CFG, W, STREETS, rand, randi, pick, clamp, lerp, angleDiff, angleLerp, collideCircle, clampToCity } from './world.js';
import { randomRoadPoint } from './city.js';

const CAR_COLORS = [
  0xd83a2e, 0x2e7ad8, 0xe8b13a, 0x3aa84a, 0x8a3ad8, 0xd8d8d8,
  0x2a2a2e, 0xe87a2e, 0x3ad8c8, 0xa84a6a, 0x6a8a2e, 0xf0e8d8,
];
const TRUCK_COLORS = [0x8a6a3a, 0x5a6a7a, 0x9a3a3a];

export function makeCar(color, opts = {}) {
  const group = new THREE.Group();
  const isTruck = !!opts.truck;
  const bodyMat = new THREE.MeshLambertMaterial({ color });
  const darkMat = new THREE.MeshLambertMaterial({ color: 0x1a1a20 });
  const glassMat = new THREE.MeshPhongMaterial({ color: 0x2a3a4a, shininess: 120 });
  const len = isTruck ? 6.4 : 4.4;
  const body = new THREE.Mesh(new THREE.BoxGeometry(len, 0.72, 2.0), bodyMat);
  body.position.y = 0.62;
  body.castShadow = true;
  group.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(isTruck ? 1.6 : 2.3, 0.62, 1.78), isTruck ? bodyMat : glassMat);
  cabin.position.set(isTruck ? 1.9 : -0.25, 1.28, 0);
  cabin.castShadow = true;
  group.add(cabin);
  if (isTruck) {
    const bed = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.9, 1.9), darkMat);
    bed.position.set(-1.3, 1.2, 0);
    group.add(bed);
  }
  // bumpers
  const bump = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.3, 2.05), darkMat);
  bump.position.set(len / 2, 0.42, 0);
  group.add(bump);
  const bump2 = bump.clone();
  bump2.position.x = -len / 2;
  group.add(bump2);
  // headlights / taillights
  const hlMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });
  const tlMat = new THREE.MeshBasicMaterial({ color: 0xff2a2a });
  for (const z of [-0.65, 0.65]) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.18, 0.34), hlMat);
    hl.position.set(len / 2 + 0.02, 0.72, z);
    group.add(hl);
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.18, 0.34), tlMat);
    tl.position.set(-len / 2 - 0.02, 0.72, z);
    group.add(tl);
  }
  // wheels
  const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.3, 12);
  wheelGeo.rotateX(Math.PI / 2);
  const wheels = [];
  for (const [wx, wz] of [[1.45, 0.95], [1.45, -0.95], [-1.45, 0.95], [-1.45, -0.95]]) {
    const w = new THREE.Mesh(wheelGeo, darkMat);
    w.position.set(wx, 0.38, wz);
    group.add(w);
    wheels.push(w);
  }
  let lightBar = null;
  if (opts.police) {
    const bar = new THREE.Group();
    const r = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.5), new THREE.MeshBasicMaterial({ color: 0xff2222 }));
    r.position.x = -0.28;
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.5), new THREE.MeshBasicMaterial({ color: 0x2244ff }));
    b.position.x = 0.28;
    bar.add(r); bar.add(b);
    bar.position.set(-0.25, 1.72, 0);
    group.add(bar);
    lightBar = bar;
  }
  const car = {
    group, wheels, lightBar, color,
    pos: new THREE.Vector3(0, 0, 0),
    heading: 0, speed: 0, steer: 0,
    health: 100, maxHealth: 100,
    isPolice: !!opts.police, isTruck, isPlayer: false,
    radius: isTruck ? 3.1 : 2.4,
    path: [], wp: 0, cruise: rand(9, 13), stuck: 0,
    name: opts.name || pick(['Comet', 'Vortex', 'Sunrunner', 'Marlin', 'Dune', 'Falcon', 'Breeze']),
  };
  group.position.copy(car.pos);
  return car;
}

export function placeCar(car, x, z, heading) {
  car.pos.set(x, 0, z);
  car.heading = heading;
  car.group.position.copy(car.pos);
  car.group.rotation.y = -heading;
  W.scene.add(car.group);
  W.cars.push(car);
  return car;
}

function lanePoint(ix, iz, dx, dz) {
  // right-hand lane offset for travel direction (dx,dz)
  const ox = dz === 0 ? 0 : (dz > 0 ? -3.4 : 3.4);
  const oz = dx === 0 ? 0 : (dx > 0 ? 3.4 : -3.4);
  return { x: ix * CFG.PITCH + ox, z: iz * CFG.PITCH + oz };
}

export function randomRoute(len = 6, startIx, startIz) {
  let ix = startIx !== undefined ? startIx : randi(-4, 4);
  let iz = startIz !== undefined ? startIz : randi(-4, 4);
  const pts = [{ x: ix * CFG.PITCH, z: iz * CFG.PITCH }];
  let dx = pick([-1, 0, 1]), dz = dx === 0 ? pick([-1, 1]) : 0;
  for (let i = 0; i < len; i++) {
    if (Math.random() < 0.35) { // turn
      if (dx !== 0) { dz = pick([-1, 1]); dx = 0; } else { dx = pick([-1, 1]); dz = 0; }
    }
    ix = clamp(ix + dx, -4, 4);
    iz = clamp(iz + dz, -4, 4);
    pts.push(lanePoint(ix, iz, dx, dz));
  }
  return pts;
}

export function spawnTrafficCar(nearPlayer) {
  const p = randomRoadPoint();
  if (nearPlayer && W.player) {
    const d = Math.hypot(p.x - W.player.pos.x, p.z - W.player.pos.z);
    if (d < 60) return null;
  }
  const car = makeCar(pick(CAR_COLORS), { truck: Math.random() < 0.15 });
  const route = randomRoute(randi(5, 9));
  car.path = route;
  car.wp = 1;
  const first = route[0], second = route[1] || route[0];
  car.heading = Math.atan2(-(second.z - first.z), second.x - first.x);
  placeCar(car, route[0].x, route[0].z, car.heading);
  car.speed = car.cruise * 0.7;
  W.traffic.push(car);
  return car;
}

export function spawnParkedCar(x, z, heading, color) {
  const car = makeCar(color ?? pick(CAR_COLORS));
  car.health = 100;
  placeCar(car, x, z, heading);
  W.parked.push(car);
  return car;
}

function carAhead(car, dist) {
  const fx = Math.cos(car.heading), fz = -Math.sin(car.heading);
  let best = null;
  for (const o of W.cars) {
    if (o === car || o.health <= 0) continue;
    const dx = o.pos.x - car.pos.x, dz = o.pos.z - car.pos.z;
    const fwd = dx * fx + dz * fz;
    if (fwd > 0 && fwd < dist && Math.abs(dx * -fz + dz * fx) < 3.2) {
      if (!best || fwd < best) best = fwd;
    }
  }
  return best;
}

export function updateTraffic(dt) {
  const p = W.player ? W.player.pos : null;
  for (let i = W.traffic.length - 1; i >= 0; i--) {
    const car = W.traffic[i];
    if (car.health <= 0) continue;
    if (p && Math.hypot(car.pos.x - p.x, car.pos.z - p.z) > 300) {
      // recycle far-away traffic
      W.scene.remove(car.group);
      W.cars.splice(W.cars.indexOf(car), 1);
      W.traffic.splice(i, 1);
      continue;
    }
    const tgt = car.path[car.wp];
    if (!tgt) {
      // new route starts at the intersection the car just reached, so it
      // never cuts across a block to find its next waypoint
      const ix = clamp(Math.round(car.pos.x / CFG.PITCH), -4, 4);
      const iz = clamp(Math.round(car.pos.z / CFG.PITCH), -4, 4);
      car.path = randomRoute(randi(5, 9), ix, iz);
      car.wp = 1;
      continue;
    }
    const dx = tgt.x - car.pos.x, dz = tgt.z - car.pos.z;
    const dist = Math.hypot(dx, dz);
    const wantHeading = Math.atan2(-dz, dx);
    car.heading = angleLerp(car.heading, wantHeading, clamp(2.2 * dt, 0, 1));
    const ahead = carAhead(car, 14);
    let targetSpeed = car.cruise;
    if (ahead !== null) targetSpeed = Math.min(targetSpeed, Math.max(0, (ahead - 8) * 0.8));
    if (dist < 12) targetSpeed = Math.min(targetSpeed, 7);
    car.speed = lerp(car.speed, targetSpeed, clamp(1.6 * dt, 0, 1));
    car.pos.x += Math.cos(car.heading) * car.speed * dt;
    car.pos.z += -Math.sin(car.heading) * car.speed * dt;
    if (dist < 5) car.wp++;
    car.group.position.copy(car.pos);
    car.group.rotation.y = -car.heading;
    spinWheels(car, dt);
  }
  // keep the streets busy
  if (W.traffic.length < 14 && Math.random() < dt * 0.5) spawnTrafficCar(true);
}

function spinWheels(car, dt) {
  const w = car.speed * dt / 0.38;
  for (const wheel of car.wheels) wheel.rotation.z -= w;
  if (car.wheels[0]) car.wheels[0].rotation.y = car.steer * 0.5;
  if (car.wheels[1]) car.wheels[1].rotation.y = car.steer * 0.5;
}

// Arcade driving for the player's car. Returns collision info.
export function drivePlayerCar(car, dt, input) {
  const fwd = input.keys.has('KeyW') || input.keys.has('ArrowUp');
  const back = input.keys.has('KeyS') || input.keys.has('ArrowDown');
  const left = input.keys.has('KeyA') || input.keys.has('ArrowLeft');
  const right = input.keys.has('KeyD') || input.keys.has('ArrowRight');
  const brake = input.keys.has('Space');
  const maxF = 34, maxR = 13;
  if (fwd) car.speed += 22 * dt;
  if (back) car.speed -= (car.speed > 0.5 ? 30 : 14) * dt;
  if (!fwd && !back) car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 8 * dt);
  if (brake) {
    car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 34 * dt);
    if (Math.abs(car.speed) > 6) {
      W.effects.smoke({ x: car.pos.x, y: 0.4, z: car.pos.z }, 2);
      W.audio.setSkid(true);
    }
  } else W.audio.setSkid(false);
  car.speed = clamp(car.speed, -maxR, maxF);
  const steerTarget = (left ? 1 : 0) - (right ? 1 : 0);
  const steerMax = 0.62 * clamp(1 - Math.abs(car.speed) / 40, 0.35, 1);
  car.steer = lerp(car.steer, steerTarget * steerMax, clamp(8 * dt, 0, 1));
  const turnRate = car.steer * clamp(Math.abs(car.speed) / 8, 0, 1) * (brake ? 1.5 : 1);
  car.heading += turnRate * dt * Math.sign(car.speed || 1);
  const nx = car.pos.x + Math.cos(car.heading) * car.speed * dt;
  const nz = car.pos.z + -Math.sin(car.heading) * car.speed * dt;
  const hit = collideCircle(nx, nz, car.radius * 0.85);
  const crashed = Math.abs(hit.x - nx) > 0.01 || Math.abs(hit.z - nz) > 0.01;
  if (crashed && Math.abs(car.speed) > 6) {
    const impact = Math.abs(car.speed);
    car.health -= impact * 0.9;
    W.audio.crash(impact > 16);
    W.effects.sparks({ x: hit.x, y: 0.8, z: hit.z }, Math.floor(impact));
    W.effects.shake(Math.min(0.5, impact * 0.02));
    car.speed *= -0.25;
    W.stats.distance += 0;
  }
  car.pos.x = hit.x; car.pos.z = hit.z;
  clampToCity(car.pos);
  car.group.position.copy(car.pos);
  car.group.rotation.y = -car.heading;
  spinWheels(car, dt);
  // car vs car bumps
  for (const o of W.cars) {
    if (o === car || o.health <= 0) continue;
    const dx = o.pos.x - car.pos.x, dz = o.pos.z - car.pos.z;
    const d = Math.hypot(dx, dz);
    const min = car.radius + o.radius - 0.8;
    if (d < min && d > 0.01) {
      const push = (min - d) / 2;
      const nx2 = dx / d, nz2 = dz / d;
      o.pos.x += nx2 * push; o.pos.z += nz2 * push;
      o.group.position.copy(o.pos);
      if (Math.abs(car.speed) > 8) {
        const dmg = Math.abs(car.speed) * 0.7;
        o.health -= dmg;
        car.health -= dmg * 0.5;
        W.audio.crash(dmg > 14);
        W.effects.sparks({ x: (car.pos.x + o.pos.x) / 2, y: 0.9, z: (car.pos.z + o.pos.z) / 2 }, 10);
        car.speed *= 0.55;
        if (o.isPolice) W.police.onRam(o, dmg);
      }
    }
  }
  if (car.health <= 0 && !car.dead) {
    car.dead = true;
    W.effects.smoke(car.pos, 20);
  }
  if (car.dead) W.audio.setEngine(0, false);
  else W.audio.setEngine(clamp(Math.abs(car.speed) / maxF, 0, 1), true);
  return { crashed };
}

export function nearestCar(pos, maxDist, includeTraffic = true) {
  let best = null, bestD = maxDist;
  for (const car of W.cars) {
    if (car.health <= 0 || car.dead) continue;
    if (!includeTraffic && W.traffic.includes(car)) continue;
    const d = Math.hypot(car.pos.x - pos.x, car.pos.z - pos.z);
    if (d < bestD) { bestD = d; best = car; }
  }
  return best;
}

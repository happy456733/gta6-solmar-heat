// Solmar Heat — Jax Cole on foot and behind the wheel: movement, jumping,
// stealing cars, punching, shooting, and the third-person camera.
import * as THREE from 'three';
import { CFG, W, rand, clamp, lerp, angleLerp, collideCircle, clampToCity } from './world.js';
import { nearestCar, drivePlayerCar } from './vehicles.js';
import { knockPedDown } from './peds.js';

export function createPlayer() {
  const group = new THREE.Group();
  const skin = new THREE.MeshLambertMaterial({ color: 0xc98a5a });
  const jacket = new THREE.MeshLambertMaterial({ color: 0x2a6a8a });
  const pants = new THREE.MeshLambertMaterial({ color: 0x2a2a30 });
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.27, 12, 10), skin);
  head.position.y = 1.64;
  head.castShadow = true;
  group.add(head);
  // hair + cap
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.29, 0.12, 12),
    new THREE.MeshLambertMaterial({ color: 0xd83a2e }));
  cap.position.y = 1.86;
  group.add(cap);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.64, 0.32), jacket);
  torso.position.y = 1.14;
  torso.castShadow = true;
  group.add(torso);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.21, 0.74, 0.23), pants);
  legL.position.set(0, 0.44, 0.15);
  group.add(legL);
  const legR = legL.clone();
  legR.position.z = -0.15;
  group.add(legR);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.6, 0.17), jacket);
  armL.position.set(0, 1.14, 0.38);
  group.add(armL);
  const armR = armL.clone();
  armR.position.z = -0.38;
  group.add(armR);
  // pistol in the right hand
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.09, 0.09),
    new THREE.MeshLambertMaterial({ color: 0x1a1a1a }));
  gun.position.set(0.1, 0.82, -0.38);
  gun.visible = false;
  group.add(gun);

  const P = {
    group, legL, legR, armL, armR, gun,
    pos: new THREE.Vector3(0, 0, 36),
    vel: new THREE.Vector3(),
    heading: Math.PI,
    onFoot: true,
    car: null,
    health: 100,
    vy: 0, grounded: true,
    walkPhase: 0,
    punchT: 0, shootT: 0, armed: false,
    interactT: 0,
  };
  group.position.copy(P.pos);
  W.scene.add(group);
  W.player = P;
  return P;
}

function shoot(P) {
  if (P.shootT > 0 || !P.onFoot) return;
  P.shootT = 0.28;
  P.armed = true;
  P.gun.visible = true;
  W.lastShot = W.elapsed;
  W.audio.gunshot();
  const dir = new THREE.Vector3(Math.cos(P.heading), 0, -Math.sin(P.heading));
  const origin = P.pos.clone();
  origin.y = 1.35;
  const muzzle = origin.clone().add(dir.clone().multiplyScalar(0.8));
  W.effects.muzzle(muzzle, dir);
  // raycast manually against peds, cops and cars
  let best = null, bestD = 60;
  const test = (x, z, r, obj) => {
    const dx = x - origin.x, dz = z - origin.z;
    const fwd = dx * dir.x + dz * dir.z;
    if (fwd < 0 || fwd > bestD) return;
    const side = Math.abs(dx * -dir.z + dz * dir.x);
    if (side < r + 0.4) { bestD = fwd; best = obj; }
  };
  for (const ped of W.peds) if (ped.state !== 'down') test(ped.pos.x, ped.pos.z, 0.5, { kind: 'ped', ped });
  for (const cop of W.cops) test(cop.pos.x, cop.pos.z, 0.5, { kind: 'cop', cop });
  for (const car of W.cars) test(car.pos.x, car.pos.z, car.radius, { kind: 'car', car });
  if (best) {
    const hitPos = origin.clone().add(dir.clone().multiplyScalar(bestD));
    hitPos.y = 1;
    W.effects.sparks(hitPos, 8);
    if (best.kind === 'ped') knockPedDown(best.ped, false);
    else if (best.kind === 'cop') {
      W.cops.splice(W.cops.indexOf(best.cop), 1);
      W.scene.remove(best.cop.group);
      W.police.addHeat(1.5);
      W.audio.punch();
    } else if (best.kind === 'car') {
      best.car.health -= 34;
      if (best.car.isPolice) W.police.addHeat(1);
      if (best.car.health <= 0 && !best.car.dead) {
        best.car.dead = true;
        W.effects.smoke(best.car.pos, 20);
        W.audio.crash(true);
      }
    }
  }
}

function punch(P) {
  if (P.punchT > 0 || !P.onFoot) return;
  P.punchT = 0.45;
  W.audio.punch();
  const dir = new THREE.Vector3(Math.cos(P.heading), 0, -Math.sin(P.heading));
  for (const ped of W.peds) {
    if (ped.state === 'down') continue;
    const d = Math.hypot(ped.pos.x - P.pos.x, ped.pos.z - P.pos.z);
    if (d < 2.2) knockPedDown(ped, false);
  }
  for (const cop of [...W.cops]) {
    const d = Math.hypot(cop.pos.x - P.pos.x, cop.pos.z - P.pos.z);
    if (d < 2.2) {
      W.cops.splice(W.cops.indexOf(cop), 1);
      W.scene.remove(cop.group);
      W.police.addHeat(1);
    }
  }
}

export function updatePlayer(dt) {
  const P = W.player;
  const input = W.input;
  if (!P) return;
  P.punchT = Math.max(0, P.punchT - dt);
  P.shootT = Math.max(0, P.shootT - dt);
  P.interactT = Math.max(0, P.interactT - dt);

  if (P.onFoot) {
    // --- on foot ---
    const fwd = (input.keys.has('KeyW') || input.keys.has('ArrowUp') ? 1 : 0)
      - (input.keys.has('KeyS') || input.keys.has('ArrowDown') ? 1 : 0);
    const strafe = (input.keys.has('KeyD') || input.keys.has('ArrowRight') ? 1 : 0)
      - (input.keys.has('KeyA') || input.keys.has('ArrowLeft') ? 1 : 0);
    const sprint = input.keys.has('ShiftLeft') || input.keys.has('ShiftRight');
    const speed = sprint ? CFG.RUN_SPEED : CFG.WALK_SPEED;
    // movement relative to camera yaw: W moves away from the camera,
    // D moves to the camera's right (view = (-sin cy, -cos cy))
    const yaw = W.camYaw;
    const mx = -Math.sin(yaw) * fwd + Math.cos(yaw) * strafe;
    const mz = -Math.cos(yaw) * fwd - Math.sin(yaw) * strafe;
    const moving = Math.abs(mx) + Math.abs(mz) > 0.01;
    if (moving) {
      const len = Math.hypot(mx, mz);
      const vx = (mx / len) * speed, vz = (mz / len) * speed;
      P.vel.x = lerp(P.vel.x, vx, clamp(10 * dt, 0, 1));
      P.vel.z = lerp(P.vel.z, vz, clamp(10 * dt, 0, 1));
      P.heading = angleLerp(P.heading, Math.atan2(-vz, vx), clamp(12 * dt, 0, 1));
    } else {
      P.vel.x = lerp(P.vel.x, 0, clamp(10 * dt, 0, 1));
      P.vel.z = lerp(P.vel.z, 0, clamp(10 * dt, 0, 1));
    }
    // jump + gravity (Space edge-triggered, so a quick tap is never lost)
    if (input.pressed.has('Space') && P.grounded) { P.vy = 9.5; P.grounded = false; }
    P.vy -= CFG.GRAVITY * dt;
    P.pos.y += P.vy * dt;
    if (P.pos.y <= 0) { P.pos.y = 0; P.vy = 0; P.grounded = true; }
    const nx = P.pos.x + P.vel.x * dt;
    const nz = P.pos.z + P.vel.z * dt;
    const hit = collideCircle(nx, nz, 0.5);
    P.pos.x = hit.x; P.pos.z = hit.z;
    clampToCity(P.pos);
    // bump into peds while sprinting knocks them down
    if (Math.hypot(P.vel.x, P.vel.z) > 9) {
      for (const ped of W.peds) {
        if (ped.state === 'down') continue;
        if (Math.hypot(ped.pos.x - P.pos.x, ped.pos.z - P.pos.z) < 1.1) knockPedDown(ped, false);
      }
    }
    // walk animation
    const spd = Math.hypot(P.vel.x, P.vel.z);
    P.walkPhase += dt * spd * 1.9;
    const swing = Math.sin(P.walkPhase) * clamp(spd / CFG.WALK_SPEED, 0, 1) * 0.6;
    P.legL.rotation.x = swing;
    P.legR.rotation.x = -swing;
    P.armL.rotation.x = -swing * 0.8;
    P.armR.rotation.x = swing * 0.8;
    if (P.punchT > 0.2) P.armR.rotation.x = -1.4;
    P.group.position.copy(P.pos);
    P.group.rotation.y = -P.heading;
    // enter a car (E edge-triggered)
    if (input.pressed.has('KeyE') && P.interactT <= 0) {
      const car = nearestCar(P.pos, 4.5);
      if (car) enterCar(P, car);
    }
    // combat (F edge-triggered)
    if (input.pressed.has('KeyF')) punch(P);
    if (input.click) { shoot(P); input.click = false; }
    W.audio.setEngine(0, false);
  } else if (P.car) {
    // --- driving --- (local ref: exitCar() below nulls P.car)
    const car = P.car;
    drivePlayerCar(car, dt, input);
    P.pos.copy(car.pos);
    P.heading = car.heading;
    P.group.visible = false;
    if (input.pressed.has('KeyE') && P.interactT <= 0) exitCar(P);
    if (input.keys.has('KeyF')) W.audio.horn();
    W.stats.distance += Math.abs(car.speed) * dt;
  }
  // consume this frame's edge-triggered presses
  input.pressed.clear();

  // --- health regen + death ---
  if (P.health < 100 && W.elapsed - W.lastCrime > 8) P.health = Math.min(100, P.health + 4 * dt);
  if (P.health <= 0 && W.mode === 'play') W.missions.onWasted();
  // --- camera ---
  updateCamera(dt);
}

function enterCar(P, car) {
  P.interactT = 0.6;
  P.onFoot = false;
  P.car = car;
  car.isPlayer = true;
  P.group.visible = false;
  W.audio.click();
  W.hud.toast(`${car.name} — yours now. Drive safe... or don't.`);
  // stealing a parked or traffic car in front of witnesses draws heat
  const witnessed = W.peds.some((ped) => Math.hypot(ped.pos.x - P.pos.x, ped.pos.z - P.pos.z) < 22 && ped.state !== 'down')
    || W.policeCars.some((c) => Math.hypot(c.pos.x - P.pos.x, c.pos.z - P.pos.z) < 40);
  if (W.parked.includes(car) || W.traffic.includes(car)) {
    W.stats.carsStolen++;
    if (witnessed) W.police.addHeat(1);
    // a traffic car stops being traffic once stolen
    const ti = W.traffic.indexOf(car);
    if (ti >= 0) W.traffic.splice(ti, 1);
    const pi = W.parked.indexOf(car);
    if (pi >= 0) W.parked.splice(pi, 1);
  }
}

function exitCar(P) {
  P.interactT = 0.6;
  const car = P.car;
  car.isPlayer = false;
  P.car = null;
  P.onFoot = true;
  P.group.visible = true;
  const side = 2.6;
  P.pos.set(car.pos.x + Math.cos(car.heading + Math.PI / 2) * side, 0, car.pos.z + -Math.sin(car.heading + Math.PI / 2) * side);
  const hit = collideCircle(P.pos.x, P.pos.z, 0.5);
  P.pos.x = hit.x; P.pos.z = hit.z;
  P.group.position.copy(P.pos);
  car.speed = 0;
  W.audio.setEngine(0, false);
  W.audio.setSkid(false);
}

function updateCamera(dt) {
  const P = W.player;
  const cam = W.camera;
  // mouse orbit (pointer lock) or keys
  if (W.input.locked) {
    W.camYaw -= W.input.mouseDX * 0.0026;
    W.camPitch = clamp(W.camPitch + W.input.mouseDY * 0.0022, -0.15, 1.1);
    W.input.mouseDX = 0; W.input.mouseDY = 0;
  }
  if (W.shotMode) {
    // cinematic angle for screenshots: a front-quarter view so a chase shows
    // the player car AND the police behind it in the same frame
    const target = W.shotCamYaw !== undefined ? W.shotCamYaw : P.heading - Math.PI / 2;
    W.camYaw = angleLerp(W.camYaw, target, clamp(2 * dt, 0, 1));
  } else if (!P.onFoot) {
    // chase cam follows the car's heading, mouse can look around briefly
    const target = P.heading - Math.PI / 2;
    W.camYaw = angleLerp(W.camYaw, target, clamp(2.2 * dt, 0, 1));
  }
  const dist = W.shotCamDist || (P.onFoot ? 7.5 : 10.5);
  const height = P.onFoot ? 3.2 : 4.2;
  const pitch = W.shotMode && W.shotCamPitch !== undefined ? W.shotCamPitch : W.camPitch;
  const tx = P.pos.x + Math.sin(W.camYaw) * dist * Math.cos(pitch);
  const tz = P.pos.z + Math.cos(W.camYaw) * dist * Math.cos(pitch);
  const ty = (P.pos.y + height) + Math.sin(pitch) * dist;
  const k = clamp(6 * dt, 0, 1);
  cam.position.x = lerp(cam.position.x, tx, k);
  cam.position.y = lerp(cam.position.y, ty, k);
  cam.position.z = lerp(cam.position.z, tz, k);
  cam.lookAt(P.pos.x, P.pos.y + 1.6, P.pos.z);
  W.effects.applyShake(cam);
}

// Solmar Heat — pedestrians: sidewalk walkers who stroll, chat, panic and run
// when a car screams past or a shot rings out.
import * as THREE from 'three';
import { CFG, W, STREETS, rand, randi, pick, clamp, lerp, angleLerp, collideCircle, randomSidewalkPoint } from './world.js';

const SHIRTS = [0xe84a4a, 0x4a8ae8, 0x4ae87a, 0xe8d84a, 0xe84ac8, 0x8a4ae8, 0xf0f0f0, 0x3a3a3a, 0x4aa8a8];
const SKINS = [0xe8b88a, 0xc98a5a, 0x8a5a3a, 0xf0c8a0, 0x6a4a2a];
const PANTS = [0x2a3a5a, 0x3a3a3a, 0x5a4a3a, 0x6a6a6a];

export function makePed() {
  const group = new THREE.Group();
  const skin = new THREE.MeshLambertMaterial({ color: pick(SKINS) });
  const shirt = new THREE.MeshLambertMaterial({ color: pick(SHIRTS) });
  const pants = new THREE.MeshLambertMaterial({ color: pick(PANTS) });
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 8), skin);
  head.position.y = 1.62;
  head.castShadow = true;
  group.add(head);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.62, 0.3), shirt);
  torso.position.y = 1.12;
  torso.castShadow = true;
  group.add(torso);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.72, 0.22), pants);
  legL.position.set(0, 0.42, 0.14);
  group.add(legL);
  const legR = legL.clone();
  legR.position.z = -0.14;
  group.add(legR);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.58, 0.16), shirt);
  armL.position.set(0, 1.12, 0.36);
  group.add(armL);
  const armR = armL.clone();
  armR.position.z = -0.36;
  group.add(armR);
  const ped = {
    group, legL, legR, armL, armR,
    pos: new THREE.Vector3(0, 0, 0),
    heading: rand(Math.PI * 2), speed: rand(1.2, 2.2),
    state: 'walk', // walk | flee | down | dead
    target: null, panic: 0, walkPhase: rand(Math.PI * 2), downT: 0,
  };
  group.position.copy(ped.pos);
  return ped;
}

export function spawnPed(nearPlayer) {
  const p = randomSidewalkPoint();
  if (nearPlayer && W.player) {
    if (Math.hypot(p.x - W.player.pos.x, p.z - W.player.pos.z) < 25) return null;
  }
  const ped = makePed();
  ped.pos.set(p.x, 0, p.z);
  ped.target = randomSidewalkPoint();
  ped.group.position.copy(ped.pos);
  W.scene.add(ped.group);
  W.peds.push(ped);
  return ped;
}

function pickNewTarget(ped) {
  ped.target = randomSidewalkPoint();
}

export function updatePeds(dt) {
  const player = W.player;
  for (let i = W.peds.length - 1; i >= 0; i--) {
    const ped = W.peds[i];
    if (ped.state === 'down') {
      ped.downT -= dt;
      ped.group.rotation.x = lerp(ped.group.rotation.x, -Math.PI / 2, clamp(6 * dt, 0, 1));
      if (ped.downT <= 0) {
        ped.state = 'walk';
        ped.group.rotation.x = 0;
        pickNewTarget(ped);
      }
      continue;
    }
    // panic triggers: fast player car nearby, or a gunshot recently
    let flee = ped.state === 'flee';
    if (player) {
      const d = Math.hypot(ped.pos.x - player.pos.x, ped.pos.z - player.pos.z);
      const carSpeed = player.car ? Math.abs(player.car.speed) : 0;
      if (d < 9 && ((!player.onFoot && carSpeed > 8) || W.lastShot > W.elapsed - 2)) {
        flee = true;
        ped.panic = 3;
      }
    }
    if (ped.panic > 0) { ped.panic -= dt; flee = true; }
    if (flee) {
      ped.state = 'flee';
      // run away from the player
      const dx = ped.pos.x - (player ? player.pos.x : 0);
      const dz = ped.pos.z - (player ? player.pos.z : 0);
      const want = Math.atan2(-dz, dx);
      ped.heading = angleLerp(ped.heading, want, clamp(5 * dt, 0, 1));
      ped.speed = lerp(ped.speed, 6.5, clamp(3 * dt, 0, 1));
      if (ped.panic <= 0 && Math.hypot(dx, dz) > 30) { ped.state = 'walk'; pickNewTarget(ped); }
    } else {
      ped.state = 'walk';
      ped.speed = lerp(ped.speed, rand(1.2, 2.2), clamp(0.2 * dt, 0, 1));
      const t = ped.target;
      if (!t) { pickNewTarget(ped); continue; }
      const dx = t.x - ped.pos.x, dz = t.z - ped.pos.z;
      const dist = Math.hypot(dx, dz);
      const want = Math.atan2(-dz, dx);
      ped.heading = angleLerp(ped.heading, want, clamp(3 * dt, 0, 1));
      if (dist < 3) pickNewTarget(ped);
    }
    const nx = ped.pos.x + Math.cos(ped.heading) * ped.speed * dt;
    const nz = ped.pos.z + -Math.sin(ped.heading) * ped.speed * dt;
    const hit = collideCircle(nx, nz, 0.5);
    ped.pos.x = hit.x; ped.pos.z = hit.z;
    ped.pos.x = clamp(ped.pos.x, -CFG.HALF, CFG.HALF);
    ped.pos.z = clamp(ped.pos.z, -CFG.HALF, CFG.BEACH_Z + 20);
    ped.group.position.copy(ped.pos);
    ped.group.rotation.y = -ped.heading;
    // walk cycle
    ped.walkPhase += dt * ped.speed * 2.4;
    const swing = Math.sin(ped.walkPhase) * 0.55;
    ped.legL.rotation.x = swing;
    ped.legR.rotation.x = -swing;
    ped.armL.rotation.x = -swing * 0.7;
    ped.armR.rotation.x = swing * 0.7;
    ped.group.position.y = Math.abs(Math.sin(ped.walkPhase)) * 0.05;
  }
  if (W.peds.length < 26 && Math.random() < dt * 0.8) spawnPed(true);
}

// A ped was hit by a car or a bullet.
export function knockPedDown(ped, byCar) {
  if (ped.state === 'down') return;
  ped.state = 'down';
  ped.downT = byCar ? 6 : 9999;
  W.stats.pedsHit++;
  W.police.addHeat(byCar ? 0.6 : 1.2);
  W.effects.sparks(ped.pos, 6);
  W.audio.punch();
  if (byCar) W.effects.shake(0.25);
}

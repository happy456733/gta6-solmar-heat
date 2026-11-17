// Solmar Heat — the wanted system: heat rises with crimes, Solmar PD cars
// chase and ram, foot cops chase on foot, and getting caught means BUSTED.
import * as THREE from 'three';
import { CFG, W, rand, pick, clamp, lerp, angleLerp, collideCircle } from './world.js';
import { randomRoadPoint } from './city.js';
import { makeCar, placeCar } from './vehicles.js';

export function createPolice() {
  const P = {
    escapeTimer: 0,
    bustedTimer: 0,
    sirenNear: false,
  };

  P.addHeat = (n) => {
    W.heat = clamp(W.heat + n, 0, 5.9);
    W.wanted = Math.floor(W.heat);
    W.lastCrime = W.elapsed;
    P.escapeTimer = 0;
  };
  P.setWanted = (n) => {
    W.heat = n;
    W.wanted = Math.floor(n);
    W.lastCrime = W.elapsed;
    P.escapeTimer = 0;
  };
  // Called when the player rams a police car.
  P.onRam = (policeCar, dmg) => {
    P.addHeat(0.5);
    policeCar.ramCooldown = 1;
  };

  function spawnPoliceCar() {
    const p = randomRoadPoint();
    const car = makeCar(0xe8e8e8, { police: true, name: 'SPPD Interceptor' });
    // black-and-white livery: darken the cabin
    car.group.children.forEach((c) => { if (c.material && c.material.color && c.position.y > 1.1) c.material = new THREE.MeshLambertMaterial({ color: 0x1a1a20 }); });
    const first = randomRoadPoint();
    car.heading = Math.atan2(-(first.z - p.z), first.x - p.x);
    placeCar(car, p.x, p.z, car.heading);
    car.speed = 10;
    car.ramCooldown = 0;
    car.sirenPhase = rand(Math.PI * 2);
    W.policeCars.push(car);
    return car;
  }

  function spawnCop() {
    const player = W.player;
    if (!player) return null;
    const a = rand(Math.PI * 2);
    const x = clamp(player.pos.x + Math.cos(a) * rand(18, 30), -CFG.HALF, CFG.HALF);
    const z = clamp(player.pos.z + Math.sin(a) * rand(18, 30), -CFG.HALF, CFG.BEACH_Z);
    const group = new THREE.Group();
    const navy = new THREE.MeshLambertMaterial({ color: 0x1a2a5a });
    const skin = new THREE.MeshLambertMaterial({ color: 0xc98a5a });
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 8), skin);
    head.position.y = 1.62;
    group.add(head);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.28, 0.12, 10), navy);
    cap.position.y = 1.82;
    group.add(cap);
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.62, 0.32), navy);
    torso.position.y = 1.12;
    group.add(torso);
    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.72, 0.22), navy);
    legL.position.set(0, 0.42, 0.14);
    group.add(legL);
    const legR = legL.clone();
    legR.position.z = -0.14;
    group.add(legR);
    group.position.set(x, 0, z);
    W.scene.add(group);
    const cop = { group, legL, legR, pos: new THREE.Vector3(x, 0, z), heading: 0, speed: 0, phase: rand(6), bust: 0 };
    W.cops.push(cop);
    return cop;
  }

  P.update = (dt) => {
    const player = W.player;
    if (!player) return;
    // --- heat decay: wanted fades once the heat is off ---
    const sinceCrime = W.elapsed - W.lastCrime;
    if (W.wanted > 0 && sinceCrime > 14) {
      // decay faster when no police can see the player
      let nearest = 999;
      for (const c of W.policeCars) nearest = Math.min(nearest, Math.hypot(c.pos.x - player.pos.x, c.pos.z - player.pos.z));
      for (const c of W.cops) nearest = Math.min(nearest, Math.hypot(c.pos.x - player.pos.x, c.pos.z - player.pos.z));
      const hidden = nearest > 55;
      W.heat -= dt * (hidden ? 0.16 : 0.05);
      if (W.heat < 0) W.heat = 0;
      const nw = Math.floor(W.heat);
      if (nw < W.wanted) {
        W.wanted = nw;
        if (nw === 0) {
          W.hud.toast('You lost the cops. Stay clean, Jax.');
          W.audio.missionDone();
        }
      }
    }
    // --- spawn police to match the wanted level ---
    const wantCars = W.wanted === 0 ? 0 : Math.min(2 + W.wanted, 6);
    while (W.policeCars.length < wantCars) spawnPoliceCar();
    while (W.policeCars.length > wantCars) {
      const c = W.policeCars.pop();
      W.scene.remove(c.group);
      W.cars.splice(W.cars.indexOf(c), 1);
    }
    const wantCops = (W.wanted >= 1 && player.onFoot) ? Math.min(W.wanted, 4) : 0;
    while (W.cops.length < wantCops) spawnCop();
    while (W.cops.length > wantCops) {
      const c = W.cops.pop();
      W.scene.remove(c.group);
    }
    // --- police cars chase ---
    let siren = false;
    for (const car of W.policeCars) {
      if (car.health <= 0) continue;
      const dx = player.pos.x - car.pos.x, dz = player.pos.z - car.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 90) siren = true;
      const wantHeading = Math.atan2(-dz, dx);
      const turn = clamp(angleLerp(car.heading, wantHeading, 1) * 1.6, -1, 1);
      const topSpeed = 17 + W.wanted * 2.4;
      car.speed = lerp(car.speed, topSpeed, clamp(1.4 * dt, 0, 1));
      car.heading += turn * clamp(2.4 * dt, 0, 1) * (car.speed > 1 ? 1 : 0);
      const nx = car.pos.x + Math.cos(car.heading) * car.speed * dt;
      const nz = car.pos.z + -Math.sin(car.heading) * car.speed * dt;
      const hit = collideCircle(nx, nz, car.radius * 0.85);
      car.pos.x = hit.x; car.pos.z = hit.z;
      car.group.position.copy(car.pos);
      car.group.rotation.y = -car.heading;
      for (const wheel of car.wheels) wheel.rotation.z -= (car.speed * dt) / 0.38;
      // flashing light bar
      if (car.lightBar) {
        car.sirenPhase += dt * 9;
        const on = Math.sin(car.sirenPhase) > 0;
        car.lightBar.children[0].material.color.setHex(on ? 0xff2222 : 0x551111);
        car.lightBar.children[1].material.color.setHex(on ? 0x111155 : 0x2244ff);
      }
      // ram the player
      if (dist < car.radius + 2.2) {
        if (player.onFoot) {
          player.health -= 22 * dt;
          W.effects.shake(0.3);
          if (Math.random() < dt * 2) W.audio.crash(false);
        } else if (player.car && car.ramCooldown <= 0) {
          player.car.health -= 9;
          car.health -= 4;
          car.ramCooldown = 1.2;
          W.audio.crash(true);
          W.effects.sparks({ x: (car.pos.x + player.pos.x) / 2, y: 0.9, z: (car.pos.z + player.pos.z) / 2 }, 12);
          W.effects.shake(0.4);
          player.car.speed *= 0.6;
        }
      }
      car.ramCooldown = Math.max(0, (car.ramCooldown || 0) - dt);
      // police cars wrecked by ramming stay wrecked and smoke
      if (car.health <= 0 && !car.dead) {
        car.dead = true;
        W.effects.smoke(car.pos, 22);
        W.audio.crash(true);
      }
      if (car.dead) car.speed = lerp(car.speed, 0, clamp(2 * dt, 0, 1));
    }
    // --- foot cops chase ---
    for (const cop of W.cops) {
      const dx = player.pos.x - cop.pos.x, dz = player.pos.z - cop.pos.z;
      const dist = Math.hypot(dx, dz);
      const want = Math.atan2(-dz, dx);
      cop.heading = angleLerp(cop.heading, want, clamp(4 * dt, 0, 1));
      cop.speed = lerp(cop.speed, dist > 2 ? 7.2 : 0, clamp(2 * dt, 0, 1));
      const nx = cop.pos.x + Math.cos(cop.heading) * cop.speed * dt;
      const nz = cop.pos.z + -Math.sin(cop.heading) * cop.speed * dt;
      const hit = collideCircle(nx, nz, 0.5);
      cop.pos.x = hit.x; cop.pos.z = hit.z;
      cop.group.position.copy(cop.pos);
      cop.group.rotation.y = -cop.heading;
      cop.phase += dt * cop.speed * 2.4;
      const swing = Math.sin(cop.phase) * 0.55;
      cop.legL.rotation.x = swing;
      cop.legR.rotation.x = -swing;
      // busted: a cop stays on the player
      if (dist < 1.8 && player.onFoot) {
        cop.bust += dt;
        player.health -= 6 * dt;
        if (cop.bust > 1.6) {
          W.missions.onBusted();
          return;
        }
      } else cop.bust = Math.max(0, cop.bust - dt * 2);
    }
    // siren audio when police are close
    if (siren !== P.sirenNear) { P.sirenNear = siren; W.audio.setSiren(siren); }
  };

  W.police = P;
  return P;
}

// Solmar Heat — the story of Jax Cole: six jobs for fixer Lena Torres to pay
// off a debt to King Bell, plus cash pickups scattered around Solmar.
import * as THREE from 'three';
import { CFG, W, rand, randi, pick, clamp, lerp, angleLerp, collideCircle } from './world.js';
import { randomSidewalkPoint } from './city.js';
import { makeCar, placeCar, spawnParkedCar, randomRoute } from './vehicles.js';

// Key places in Solmar (world coords).
export const PLACES = {
  garage: { x: 108, z: 36, name: "Lena's Garage" },
  safehouse: { x: -108, z: -36, name: 'Safehouse' },
  docks: { x: 216, z: 300, name: 'Solmar Docks' },
  bank: { x: -36, z: -108, name: 'Solmar First Bank' },
  plaza: { x: 0, z: 0, name: 'Solmar Plaza' },
};

const MISSIONS = [
  {
    id: 'homecoming', title: 'Homecoming', giver: 'Lena Torres', reward: 200,
    briefing: 'Jax, you\'re back in Solmar and you owe King Bell. First job\'s easy: walk to my garage, take the orange Comet, and bring it to the safehouse.',
    steps: [
      { type: 'goto', pos: [108, 36], r: 7, text: 'Walk to Lena\'s garage' },
      { type: 'enterCar', text: 'Get in the orange Comet' },
      { type: 'goto', pos: [-108, -36], r: 9, text: 'Drive the Comet to the safehouse', inCar: true },
    ],
  },
  {
    id: 'pickup', title: 'The Pickup', giver: 'Lena Torres', reward: 350,
    briefing: 'A package is waiting at the docks. Pick it up, bring it to my garage. The SPPD watches the docks — keep it clean.',
    steps: [
      { type: 'goto', pos: [216, 300], r: 9, text: 'Drive to the Solmar Docks', inCar: true },
      { type: 'grab', pos: [216, 300], r: 6, text: 'Grab the package (drive into the marker)' },
      { type: 'goto', pos: [108, 36], r: 8, text: 'Deliver the package to Lena\'s garage' },
    ],
  },
  {
    id: 'clockwork', title: 'Clockwork', giver: 'Lena Torres', reward: 400,
    briefing: 'A client needs a driver who can thread this city like a needle. Hit all four checkpoints in 100 seconds. No excuses.',
    steps: [
      { type: 'timed', checkpoints: [[288, 0], [0, 288], [-288, 0], [0, -288]], time: 100, text: 'Hit the checkpoints' },
    ],
  },
  {
    id: 'heatwave', title: 'Heat Wave', giver: 'Lena Torres', reward: 450,
    briefing: 'A spotter made you at the docks. Two stars, Jax — lose the cops and stay out of sight till the heat dies.',
    steps: [
      { type: 'loseWanted', text: 'Lose the cops — stay out of sight' },
    ],
  },
  {
    id: 'vault', title: 'The Vault Job', giver: 'Lena Torres', reward: 800,
    briefing: 'Solmar First Bank. Walk in, grab the cash, walk out. The alarm will trip — three stars. Get the money to the safehouse.',
    steps: [
      { type: 'goto', pos: [-36, -108], r: 8, text: 'Drive to Solmar First Bank', inCar: true },
      { type: 'grab', pos: [-36, -108], r: 6, text: 'Grab the cash (on foot, into the marker)' },
      { type: 'goto', pos: [-108, -36], r: 9, text: 'Escape to the safehouse with the cash' },
    ],
  },
  {
    id: 'ransom', title: "King's Ransom", giver: 'Lena Torres', reward: 1200,
    briefing: 'King Bell\'s courier van is rolling through Solmar with the week\'s take. Ram it till it stops, grab the cash, bring it to me. End this debt, Jax.',
    steps: [
      { type: 'chase', text: 'Ram the courier van until it stops' },
      { type: 'grab', pos: null, r: 6, text: 'Grab the cash from the van' },
      { type: 'goto', pos: [108, 36], r: 8, text: 'Deliver the cash to Lena\'s garage' },
    ],
  },
];

export function createMissions() {
  const M = {
    index: 0, // current mission
    step: 0,
    active: false,
    failed: false,
    done: false,
    timer: 0,
    van: null,
    vanWp: 0,
    targetPos: null,
    objective: 'Start a mission (M)',
    beacon: null,
    pickups: [],
  };

  // --- 3D beacon marking the current objective ---
  const beacon = new THREE.Group();
  const pillar = new THREE.Mesh(
    new THREE.CylinderGeometry(2.2, 2.2, 60, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffd23a, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }),
  );
  pillar.position.y = 30;
  beacon.add(pillar);
  const diamond = new THREE.Mesh(
    new THREE.OctahedronGeometry(1.4),
    new THREE.MeshBasicMaterial({ color: 0xffd23a }),
  );
  diamond.position.y = 7;
  beacon.add(diamond);
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(3.2, 4.2, 24),
    new THREE.MeshBasicMaterial({ color: 0xffd23a, transparent: true, opacity: 0.8, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.15;
  beacon.add(ring);
  beacon.visible = false;
  W.scene.add(beacon);
  M.beacon = beacon;
  M.diamond = diamond;

  // --- landmark buildings for the story places ---
  function landmark(x, z, w, h, d, color, style) {
    const g = new THREE.Group();
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color }));
    b.position.y = h / 2;
    b.castShadow = true;
    g.add(b);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(w * 0.96, 0.5, d * 0.96), new THREE.MeshLambertMaterial({ color: 0x3a3a42 }));
    roof.position.y = h + 0.25;
    g.add(roof);
    // details on the face toward the street/marker (local +z = south side)
    const cream = new THREE.MeshLambertMaterial({ color: 0xf0e8d8 });
    const dark = new THREE.MeshLambertMaterial({ color: 0x1a2a3a });
    if (style === 'bank') {
      for (const cx of [-w / 2 + 3, -w / 6, w / 6, w / 2 - 3]) {
        const col = new THREE.Mesh(new THREE.BoxGeometry(1.3, h * 0.72, 1.3), cream);
        col.position.set(cx, h * 0.36, d / 2 + 0.7);
        g.add(col);
      }
      const door = new THREE.Mesh(new THREE.BoxGeometry(4.5, 6.5, 0.3), dark);
      door.position.set(0, 3.25, d / 2 + 0.25);
      g.add(door);
      const sign = new THREE.Mesh(new THREE.BoxGeometry(w * 0.8, 1.8, 0.3), new THREE.MeshBasicMaterial({ color: 0x2a4a6a }));
      sign.position.set(0, h - 1.4, d / 2 + 0.25);
      g.add(sign);
    } else if (style === 'garage') {
      const door = new THREE.Mesh(new THREE.BoxGeometry(13, 5, 0.3), dark);
      door.position.set(0, 2.5, d / 2 + 0.2);
      g.add(door);
      const sign = new THREE.Mesh(new THREE.BoxGeometry(15, 1.6, 0.3), new THREE.MeshBasicMaterial({ color: 0xffd23a }));
      sign.position.set(0, h - 1, d / 2 + 0.2);
      g.add(sign);
    } else if (style === 'house') {
      const door = new THREE.Mesh(new THREE.BoxGeometry(2.4, 4.2, 0.3), dark);
      door.position.set(-3, 2.1, d / 2 + 0.2);
      g.add(door);
      for (const wx of [2.5, 6]) {
        const win = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2.2, 0.2), new THREE.MeshBasicMaterial({ color: 0xffd98a }));
        win.position.set(wx, 4.4, d / 2 + 0.15);
        g.add(win);
      }
    }
    g.position.set(x, 0, z);
    W.scene.add(g);
    W.colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
    return g;
  }
  landmark(108, 22, 24, 7, 14, 0xc96a3a, 'garage'); // garage (marker sits on the street side)
  landmark(-108, -50, 16, 8, 12, 0x7a9aaa, 'house'); // safehouse
  landmark(-36, -122, 22, 16, 16, 0xd8c8a8, 'bank'); // bank
  // dock containers
  for (let i = 0; i < 6; i++) {
    const c = new THREE.Mesh(new THREE.BoxGeometry(8, 3, 3),
      new THREE.MeshLambertMaterial({ color: pick([0xd83a2e, 0x2e7ad8, 0xe8b13a, 0x3aa84a]) }));
    c.position.set(190 + (i % 3) * 10, 1.5 + Math.floor(i / 3) * 3.1, 306 + Math.floor(i / 3) * 0);
    c.rotation.y = 0.2;
    c.castShadow = true;
    W.scene.add(c);
    W.colliders.push({ minX: c.position.x - 4, maxX: c.position.x + 4, minZ: c.position.z - 1.6, maxZ: c.position.z + 1.6 });
  }

  // --- the orange Comet for mission 1 ---
  const comet = spawnParkedCar(96, 44, Math.PI / 2, 0xe86a1a);
  comet.name = 'Comet';

  // --- cash pickups ---
  for (let i = 0; i < 10; i++) {
    const p = randomSidewalkPoint();
    const mesh = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.7),
      new THREE.MeshBasicMaterial({ color: 0x2aff66 }),
    );
    mesh.position.set(p.x, 1.2, p.z);
    W.scene.add(mesh);
    M.pickups.push({ mesh, pos: new THREE.Vector3(p.x, 1.2, p.z), taken: false });
  }

  function currentMission() { return MISSIONS[M.index]; }
  function currentStep() { return currentMission()?.steps[M.step]; }

  function setObjective(text) { M.objective = text; }
  function placeBeacon(x, z) {
    M.targetPos = { x, z };
    beacon.position.set(x, 0, z);
    beacon.visible = true;
  }
  function hideBeacon() { beacon.visible = false; M.targetPos = null; }

  M.startMission = (i) => {
    M.index = i;
    M.step = 0;
    M.active = true;
    M.failed = false;
    M.timer = 0;
    const m = currentMission();
    if (!W.shotMode) W.hud.toast(`${m.title} — ${m.giver}`);
    if (!W.shotMode) W.hud.showBriefing(m);
    W.audio.missionStart();
    M.setupStep();
  };

  M.setupStep = () => {
    const step = currentStep();
    if (!step) { M.completeMission(); return; }
    if (step.type === 'goto' || step.type === 'grab') {
      const pos = step.pos || (M.van ? [M.van.pos.x, M.van.pos.z] : [0, 0]);
      placeBeacon(pos[0], pos[1]);
    } else if (step.type === 'timed') {
      M.timer = step.time;
      const cp = step.checkpoints[0];
      placeBeacon(cp[0], cp[1]);
      step.cpIndex = 0;
    } else if (step.type === 'chase') {
      M.spawnVan();
      placeBeacon(M.van.pos.x, M.van.pos.z);
    } else if (step.type === 'enterCar') {
      placeBeacon(96, 44);
    } else if (step.type === 'loseWanted') {
      W.police.setWanted(2);
      hideBeacon();
    }
    setObjective(step.text);
  };

  M.spawnVan = () => {
    const van = makeCar(0x3a3a3a, { truck: true, name: 'Courier Van' });
    van.health = 150;
    van.maxHealth = 150;
    const route = randomRoute(10);
    van.path = route;
    van.wp = 1;
    placeCar(van, route[0].x, route[0].z, 0);
    van.speed = 12;
    M.van = van;
  };

  M.nextStep = () => {
    M.step++;
    W.audio.pickup();
    M.setupStep();
  };

  M.completeMission = () => {
    const m = currentMission();
    W.cash += m.reward;
    W.stats.missionsDone++;
    M.active = false;
    hideBeacon();
    W.audio.missionDone();
    W.hud.showMissionComplete(m);
    W.save.save();
    if (M.van) { // the courier van is done for
      const v = M.van; M.van = null;
      W.cars.splice(W.cars.indexOf(v), 1);
      W.scene.remove(v.group);
    }
    if (M.index + 1 < MISSIONS.length) {
      M.index++;
      setObjective(`Next job: ${MISSIONS[M.index].title} (press M)`);
    } else {
      M.done = true;
      setObjective('Story complete — Kingpin of Solmar. Free roam!');
      W.hud.toast('STORY COMPLETE — You are the Kingpin of Solmar.');
    }
  };

  M.failMission = (why) => {
    M.active = false;
    M.failed = true;
    hideBeacon();
    W.audio.busted();
    W.hud.showMissionFailed(currentMission(), why);
  };

  M.retryMission = () => {
    M.failed = false;
    M.startMission(M.index);
  };

  M.onBusted = () => {
    if (W.mode !== 'play') return;
    W.mode = 'busted';
    W.audio.busted();
    W.audio.setSiren(false);
    W.audio.setEngine(0, false);
    // impound: lose the car, respawn at the safehouse, mission restarts
    if (W.player.car) { W.player.car.isPlayer = false; W.player.car = null; }
    W.player.onFoot = true;
    W.player.group.visible = true;
    W.player.pos.set(-108, 0, -20);
    W.player.health = 100;
    W.police.setWanted(0);
    if (M.active) { M.active = false; hideBeacon(); }
    W.hud.showBusted();
  };

  M.onWasted = () => {
    if (W.mode !== 'play') return;
    W.mode = 'wasted';
    W.audio.wasted();
    W.audio.setSiren(false);
    W.audio.setEngine(0, false);
    if (W.player.car) { W.player.car.isPlayer = false; W.player.car = null; }
    W.player.onFoot = true;
    W.player.group.visible = true;
    W.player.pos.set(-108, 0, -20);
    W.player.health = 100;
    W.police.setWanted(0);
    if (M.active) { M.active = false; hideBeacon(); }
    W.hud.showWasted();
  };

  M.respawn = () => {
    W.mode = 'play';
    W.hud.hideOverlays();
    setObjective(M.active ? currentStep().text : `Next job: ${MISSIONS[M.index].title} (press M)`);
  };

  M.update = (dt) => {
    // beacon animation
    if (beacon.visible) {
      M.diamond.rotation.y += dt * 2;
      M.diamond.position.y = 7 + Math.sin(W.elapsed * 2.5) * 0.5;
      ring.scale.setScalar(1 + Math.sin(W.elapsed * 3) * 0.08);
    }
    // cash pickups
    const P = W.player;
    for (const pk of M.pickups) {
      if (pk.taken) continue;
      pk.mesh.rotation.y += dt * 2.4;
      pk.mesh.position.y = 1.2 + Math.sin(W.elapsed * 3 + pk.pos.x) * 0.25;
      if (P && Math.hypot(pk.pos.x - P.pos.x, pk.pos.z - P.pos.z) < 2.6) {
        pk.taken = true;
        W.scene.remove(pk.mesh);
        W.cash += 50;
        W.audio.pickup();
        W.effects.cashBurst(pk.pos);
        W.hud.toast('+$50 street cash');
      }
    }
    // courier van behaviour
    if (M.van) {
      const van = M.van;
      const step = currentStep();
      if (step && step.type === 'chase') {
        const tgt = van.path[van.wp];
        if (tgt) {
          const dx = tgt.x - van.pos.x, dz = tgt.z - van.pos.z;
          const dist = Math.hypot(dx, dz);
          const want = Math.atan2(-dz, dx);
          van.heading = angleLerp(van.heading, want, clamp(2 * dt, 0, 1));
          const top = van.health > 60 ? 15 : van.health > 0 ? 8 : 0;
          van.speed = lerp(van.speed, top, clamp(1.2 * dt, 0, 1));
          van.pos.x += Math.cos(van.heading) * van.speed * dt;
          van.pos.z += -Math.sin(van.heading) * van.speed * dt;
          if (dist < 6) van.wp = (van.wp + 1) % van.path.length;
          van.group.position.copy(van.pos);
          van.group.rotation.y = -van.heading;
          for (const w of van.wheels) w.rotation.z -= (van.speed * dt) / 0.38;
          placeBeacon(van.pos.x, van.pos.z);
          if (van.health <= 0) {
            van.speed = 0;
            W.effects.smoke(van.pos, 3);
            M.nextStep(); // becomes the grab step
          }
        }
      }
    }
    if (!M.active || W.mode !== 'play') return;
    const step = currentStep();
    if (!step) return;
    const player = W.player;
    const distTo = (x, z) => Math.hypot(player.pos.x - x, player.pos.z - z);
    if (step.type === 'goto') {
      if (distTo(step.pos[0], step.pos[1]) < step.r) M.nextStep();
    } else if (step.type === 'grab') {
      const pos = step.pos || (M.van ? [M.van.pos.x, M.van.pos.z] : null);
      if (pos) {
        placeBeacon(pos[0], pos[1]);
        if (distTo(pos[0], pos[1]) < step.r) {
          if (M.index === 4) W.police.setWanted(3); // bank alarm trips
          M.nextStep();
        }
      }
    } else if (step.type === 'enterCar') {
      if (!player.onFoot && player.car) M.nextStep();
    } else if (step.type === 'timed') {
      M.timer -= dt;
      const cp = step.checkpoints[step.cpIndex];
      if (cp && distTo(cp[0], cp[1]) < 10) {
        step.cpIndex++;
        W.audio.pickup();
        if (step.cpIndex >= step.checkpoints.length) { M.nextStep(); return; }
        const next = step.checkpoints[step.cpIndex];
        placeBeacon(next[0], next[1]);
      }
      if (M.timer <= 0) M.failMission('Out of time — the client found another driver.');
    } else if (step.type === 'loseWanted') {
      if (W.wanted === 0) M.nextStep();
    } else if (step.type === 'chase') {
      // handled above via van health
    }
  };

  M.missionList = () => MISSIONS.map((m, i) => ({
    title: m.title, giver: m.giver, reward: m.reward,
    state: i < M.index ? 'done' : i === M.index ? (M.done ? 'done' : 'next') : 'locked',
  }));

  W.missions = M;
  return M;
}

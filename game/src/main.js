// Solmar Heat — boot, input, the game loop, menus and screenshot presets.
// Jax Cole returns to Solmar City owing King Bell. Six jobs. One way out.
import * as THREE from 'three';
import { CFG, W, STREETS, rand, clamp } from './world.js';
import { buildCity } from './city.js';
import { createAudio } from './audio.js';
import { createEffects } from './effects.js';
import { spawnTrafficCar, spawnParkedCar, makeCar, placeCar } from './vehicles.js';
import { spawnPed, placePed } from './peds.js';
import { createPolice } from './police.js';
import { createPlayer, updatePlayer } from './player.js';
import { createMissions } from './missions.js';
import { createHUD } from './hud.js';
import { createSave } from './save.js';
import { updateTraffic } from './vehicles.js';
import { updatePeds } from './peds.js';

const params = new URLSearchParams(location.search);
const SHOT = params.get('shot'); // chase | city | mission | night

function boot() {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  document.getElementById('app').appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x9fc3e0);
  const camera = new THREE.PerspectiveCamera(68, innerWidth / innerHeight, 0.1, 1400);
  camera.position.set(8, 4, 44);
  W.scene = scene;
  W.camera = camera;
  W.renderer = renderer;
  W.clock = new THREE.Clock();
  window.__solmar = W; // debug handle: lets tests and players inspect state

  buildCity();
  W.audio = createAudio();
  W.effects = createEffects();
  createPolice();
  createPlayer();
  createMissions();
  createHUD();
  createSave();

  // populate the streets
  for (let i = 0; i < 14; i++) spawnTrafficCar(false);
  for (let i = 0; i < 26; i++) spawnPed(false);
  for (let i = 0; i < 10; i++) {
    const s = STREETS[Math.floor(Math.random() * STREETS.length)];
    const along = rand(-280, 280);
    const side = Math.random() < 0.5 ? 1 : -1;
    const horizontal = Math.random() < 0.5;
    const x = horizontal ? along : s + side * (CFG.STREET / 2 - 2.2);
    const z = horizontal ? s + side * (CFG.STREET / 2 - 2.2) : along;
    spawnParkedCar(x, z, horizontal ? (side > 0 ? 0 : Math.PI) : (side > 0 ? Math.PI / 2 : -Math.PI / 2));
  }

  wireInput(renderer.domElement);
  wireMenus();
  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });

  if (SHOT) {
    applyShotPreset(SHOT);
  } else {
    W.mode = 'menu';
    W.hud.showMenu();
    W.hud.buildMissionList();
  }

  renderer.setAnimationLoop(tick);
}

function wireInput(canvas) {
  const input = W.input;
  addEventListener('keydown', (e) => {
    if (e.repeat) return;
    input.keys.add(e.code);
    input.pressed.add(e.code); // edge trigger: survives until a frame consumes it, so a quick tap is never lost between slow frames
    if (e.code === 'KeyM' && W.mode === 'play') startNextMission();
    if ((e.code === 'KeyP' || e.code === 'Escape') && (W.mode === 'play' || W.mode === 'paused')) togglePause();
    if (e.code === 'Space') e.preventDefault();
  });
  addEventListener('keyup', (e) => input.keys.delete(e.code));
  addEventListener('blur', () => input.keys.clear());
  document.addEventListener('mousemove', (e) => {
    if (input.locked) { input.mouseDX += e.movementX; input.mouseDY += e.movementY; }
  });
  document.addEventListener('pointerlockchange', () => {
    input.locked = document.pointerLockElement === canvas;
  });
  canvas.addEventListener('mousedown', (e) => {
    if (W.mode !== 'play') return;
    W.audio.init();
    W.audio.resume();
    if (!input.locked) { canvas.requestPointerLock(); return; }
    if (e.button === 0) input.click = true;
  });
  canvas.addEventListener('click', () => {
    if (W.mode === 'play') { W.audio.init(); W.audio.resume(); W.audio.startMusic(); }
  });
}

function wireMenus() {
  const $ = (id) => document.getElementById(id);
  $('btn-new').addEventListener('click', () => {
    W.audio.init(); W.audio.resume(); W.audio.startMusic();
    newGame();
  });
  $('btn-continue').addEventListener('click', () => {
    W.audio.init(); W.audio.resume(); W.audio.startMusic();
    continueGame();
  });
  $('btn-resume').addEventListener('click', () => togglePause());
  $('btn-quit').addEventListener('click', () => {
    W.save.save();
    W.mode = 'menu';
    document.exitPointerLock?.();
    W.hud.hideOverlays();
    W.hud.buildMissionList();
    W.hud.showMenu();
  });
  $('btn-busted-ok').addEventListener('click', () => W.missions.respawn());
  $('btn-wasted-ok').addEventListener('click', () => W.missions.respawn());
  $('btn-retry').addEventListener('click', () => {
    W.hud.hideOverlays();
    W.mode = 'play';
    W.missions.retryMission();
  });
}

function newGame() {
  W.save.clear();
  W.cash = 0;
  W.stats.missionsDone = 0;
  W.stats.carsStolen = 0;
  W.stats.distance = 0;
  const P = W.player;
  P.pos.set(0, 0, 36);
  P.heading = Math.PI;
  P.health = 100;
  P.onFoot = true;
  P.car = null;
  P.group.visible = true;
  W.police.setWanted(0);
  W.missions.index = 0;
  W.missions.active = false;
  W.missions.done = false;
  W.missions.objective = 'Press M to start your first job for Lena';
  W.mode = 'play';
  W.hud.hideOverlays();
  W.hud.hideMenu();
  document.getElementById('hud').classList.remove('hidden');
  W.hud.toast('Welcome back to Solmar, Jax. Press M for work.');
}

function continueGame() {
  const s = W.save.load();
  newGame();
  if (!s) return;
  W.cash = s.cash || 0;
  W.missions.index = Math.min(s.missionIndex || 0, 5);
  W.stats.missionsDone = s.missionsDone || 0;
  W.player.health = s.health || 100;
  if (s.pos) W.player.pos.set(s.pos[0], 0, s.pos[1]);
  W.missions.objective = `Next job: ${['Homecoming', 'The Pickup', 'Clockwork', 'Heat Wave', 'The Vault Job', "King's Ransom"][W.missions.index]} (press M)`;
  W.hud.toast('Welcome back, Jax. The city missed you.');
}

function startNextMission() {
  const M = W.missions;
  if (M.active) { W.hud.toast('Finish the current job first.'); return; }
  if (M.done) { W.hud.toast('Story complete — free roam, Kingpin.'); return; }
  M.startMission(M.index);
}

function togglePause() {
  if (W.mode === 'play') {
    W.mode = 'paused';
    document.exitPointerLock?.();
    document.getElementById('pause').classList.add('show');
  } else if (W.mode === 'paused') {
    W.mode = 'play';
    document.getElementById('pause').classList.remove('show');
  }
}

// ---- screenshot presets (?shot=chase|city|mission|night) ----
function applyShotPreset(shot) {
  W.shotMode = shot;
  W.mode = 'play';
  W.hud.hideMenu();
  document.getElementById('hud').classList.remove('hidden');
  const P = W.player;
  const M = W.missions;
  if (shot === 'chase') {
    W.dayTime = 0.42;
    const car = spawnParkedCar(36, 0, 0, 0xe86a1a);
    car.name = 'Comet';
    P.onFoot = false; P.car = car; car.isPlayer = true; P.group.visible = false;
    P.pos.copy(car.pos); P.heading = 0;
    car.speed = 24;
    W.camYaw = -Math.PI / 2;
    // front-quarter from the north side: camera ahead of the car (so the
    // pursuers behind it stay in frame) and north of the road, away from the
    // lamps that stand on every intersection's north-east corner
    W.shotCamYaw = Math.atan2(Math.cos(P.heading), -Math.sin(P.heading) - 1);
    W.shotCamDist = 16;
    W.shotCamPitch = 0.55; // high enough to clear lamps and palms
    W.missionLabel = 'GETAWAY';
    W.police.setWanted(3);
    M.objective = 'Escape the Solmar PD — lose the cops!';
    M.active = false;
    W.input.keys.add('KeyW'); // keep the getaway rolling during pre-sim
  } else if (shot === 'city') {
    W.dayTime = 0.3;
    P.pos.set(12, 0, 84); // on the sidewalk, looking north up the avenue
    P.heading = Math.PI / 2;
    W.camYaw = 0;
    W.shotCamDist = 12;
    W.shotCamPitch = 0.45;
    W.missionLabel = 'SOLMAR CITY';
    M.objective = 'Solmar City — explore on foot or steal a car (E)';
    M.active = false;
    // traffic + peds on the avenue so the frame is alive (northbound lane x=+3.4,
    // southbound lane x=-3.4; routes run straight up the avenue)
    for (const [x, z, h, path] of [
      [3.4, 30, Math.PI / 2, [{ x: 3.4, z: 0 }, { x: 3.4, z: -72 }, { x: 3.4, z: -144 }, { x: 3.4, z: -216 }, { x: 3.4, z: -288 }]],
      [-3.4, 110, -Math.PI / 2, [{ x: -3.4, z: 144 }, { x: -3.4, z: 216 }, { x: -3.4, z: 288 }]],
      [3.4, 130, Math.PI / 2, [{ x: 3.4, z: 72 }, { x: 3.4, z: 0 }, { x: 3.4, z: -72 }, { x: 3.4, z: -144 }]],
    ]) {
      const c = makeCar(0x2e7ad8);
      c.path = path;
      c.wp = 1;
      c.cruise = 11;
      placeCar(c, x, z, h);
      c.speed = 11;
      W.traffic.push(c);
    }
    for (const [x, z] of [[10, 76], [14, 92], [8, 100], [-10, 88]]) placePed(x, z);
  } else if (shot === 'mission') {
    W.dayTime = 0.35;
    M.startMission(4);
    M.step = 1;
    M.setupStep();
    P.pos.set(-36, 0, -88);
    P.heading = Math.PI / 2; // face the bank (north)
    W.camYaw = 0;
    W.missionLabel = 'THE VAULT JOB';
    W.police.setWanted(1);
  } else if (shot === 'night') {
    W.dayTime = 0.68; // 22:19 — true night, lamps and lit windows on
    const car = spawnParkedCar(144, 144, Math.PI, 0x2e7ad8);
    P.onFoot = false; P.car = car; car.isPlayer = true; P.group.visible = false;
    P.pos.copy(car.pos); P.heading = Math.PI;
    car.speed = 20;
    W.camYaw = Math.PI / 2;
    W.shotCamYaw = Math.atan2(Math.cos(P.heading), -Math.sin(P.heading) - 1);
    W.shotCamDist = 16;
    W.shotCamPitch = 0.55;
    W.missionLabel = 'NIGHT RUN';
    W.police.setWanted(1);
    M.objective = 'Night run — stay ahead of the SPPD';
    M.active = false;
    W.input.keys.add('KeyW');
  }
  // pre-simulate so traffic, peds and police are mid-motion in the shot
  for (let i = 0; i < 150; i++) tickWorld(1 / 60);
  // pull police cars in behind the player for the chase / night shots
  if (shot === 'chase' || shot === 'night') {
    // keep exactly three pursuers, close behind and in frame
    while (W.policeCars.length > 3) {
      const c = W.policeCars.pop();
      W.scene.remove(c.group);
      W.cars.splice(W.cars.indexOf(c), 1);
    }
    W.policeCars.forEach((c, i) => {
      const back = 12 + i * 6;
      c.pos.set(P.pos.x - Math.cos(P.heading) * back + (i % 2 ? 3.5 : -3.5), 0,
        P.pos.z + Math.sin(P.heading) * back);
      c.heading = P.heading;
      c.speed = 26;
      c.group.position.copy(c.pos);
      c.group.rotation.y = -c.heading;
    });
    // let the getaway coast so the pursuers hold their ground in frame
    W.input.keys.delete('KeyW');
    for (let i = 0; i < 45; i++) tickWorld(1 / 60);
  }
}

let lastT = 0;
let shotFrames = 0;
function tick() {
  const now = performance.now();
  let dt = Math.min((now - lastT) / 1000 || 0.016, 0.05);
  lastT = now;
  if (W.shotMode) {
    // the world was pre-simulated; run a few live frames then freeze so the
    // screenshot captures a stable, composed frame
    if (shotFrames++ < 6) tickWorld(dt);
  } else {
    tickWorld(dt);
  }
  W.renderer.render(W.scene, W.camera);
}

function tickWorld(dt) {
  if (W.mode === 'play') {
    W.elapsed += dt;
    if (!W.shotMode) W.dayTime = (W.dayTime + dt / CFG.DAY_LENGTH) % 1;
    updatePlayer(dt);
    updateTraffic(dt);
    updatePeds(dt);
    W.police.update(dt);
    W.missions.update(dt);
    W.effects.update(dt);
    W.city.update(dt);
    W.hud.update(dt);
  } else if (W.mode === 'menu') {
    // slow orbit around the plaza behind the menu
    W.elapsed += dt;
    W.input.pressed.clear(); // never carry a menu keypress into the game
    const a = W.elapsed * 0.05;
    W.camera.position.set(Math.sin(a) * 60, 26, Math.cos(a) * 60);
    W.camera.lookAt(0, 4, 0);
    W.city.update(dt);
  }
}

boot();

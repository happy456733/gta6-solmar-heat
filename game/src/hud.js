// Solmar Heat — HUD: cash, health, wanted stars, minimap, objective line,
// speedometer, toasts, and the menu / briefing / busted / wasted overlays.
import { CFG, W, STREETS, clamp } from './world.js';

export function createHUD() {
  const H = {};
  const $ = (id) => document.getElementById(id);
  const els = {
    cash: $('cash'), healthFill: $('health-fill'), stars: $('stars'),
    clock: $('clock'), objective: $('objective'), missionTitle: $('mission-title'),
    speed: $('speed'), minimap: $('minimap'), prompt: $('prompt'),
    crosshair: $('crosshair'), toast: $('toast'), damage: $('damage'),
    menu: $('menu'), pause: $('pause'), busted: $('busted'), wasted: $('wasted'),
    missionDone: $('mission-done'), missionFailed: $('mission-failed'),
    briefing: $('briefing'), missionList: $('mission-list'),
  };
  const mm = els.minimap.getContext('2d');

  // --- prerendered static minimap (roads + buildings) ---
  const staticMap = document.createElement('canvas');
  staticMap.width = 190; staticMap.height = 190;
  {
    const g = staticMap.getContext('2d');
    const sc = 190 / (CFG.GROUND + 40);
    const px = (v) => (v + (CFG.GROUND + 40) / 2) * sc;
    g.fillStyle = '#101418';
    g.fillRect(0, 0, 190, 190);
    g.fillStyle = '#1d4a6a';
    g.fillRect(0, px(CFG.WATER_Z), 190, 190 - px(CFG.WATER_Z));
    g.fillStyle = '#c9b078';
    g.fillRect(0, px(CFG.BEACH_Z), 190, px(CFG.WATER_Z) - px(CFG.BEACH_Z));
    g.fillStyle = '#2c2c32';
    for (const s of STREETS) {
      g.fillRect(px(s - CFG.STREET / 2), 0, CFG.STREET * sc, 190);
      g.fillRect(0, px(s - CFG.STREET / 2), 190, CFG.STREET * sc);
    }
    g.fillStyle = '#4a4a52';
    for (const b of W.buildings) {
      g.fillRect(px(b.minX), px(b.minZ), (b.maxX - b.minX) * sc, (b.maxZ - b.minZ) * sc);
    }
  }

  let toastTimer = null;
  H.toast = (text, ms = 2600) => {
    els.toast.textContent = text;
    els.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => els.toast.classList.remove('show'), ms);
  };

  H.showBriefing = (m) => {
    els.briefing.querySelector('.brief-title').textContent = `${m.title} — ${m.giver}`;
    els.briefing.querySelector('.brief-text').textContent = m.briefing;
    els.briefing.querySelector('.brief-reward').textContent = `Reward: $${m.reward}`;
    els.briefing.classList.add('show');
    setTimeout(() => els.briefing.classList.remove('show'), 6500);
  };
  H.showMissionComplete = (m) => {
    els.missionDone.querySelector('.md-title').textContent = 'MISSION COMPLETE';
    els.missionDone.querySelector('.md-text').textContent = `${m.title} — +$${m.reward}`;
    els.missionDone.classList.add('show');
    setTimeout(() => els.missionDone.classList.remove('show'), 4000);
  };
  H.showMissionFailed = (m, why) => {
    els.missionFailed.querySelector('.mf-title').textContent = 'MISSION FAILED';
    els.missionFailed.querySelector('.mf-text').textContent = `${m.title} — ${why}`;
    els.missionFailed.classList.add('show');
  };
  H.showBusted = () => { els.busted.classList.add('show'); };
  H.showWasted = () => { els.wasted.classList.add('show'); };
  H.hideOverlays = () => {
    for (const k of ['menu', 'pause', 'busted', 'wasted', 'missionFailed']) els[k].classList.remove('show');
  };
  H.showMenu = () => { els.menu.classList.add('show'); };
  H.hideMenu = () => { els.menu.classList.remove('show'); };

  H.buildMissionList = () => {
    const list = W.missions.missionList();
    els.missionList.innerHTML = list.map((m, i) =>
      `<div class="mission-row ${m.state}"><span class="m-num">${i + 1}</span><span class="m-name">${m.title}</span><span class="m-state">${m.state === 'done' ? '✓ DONE' : m.state === 'next' ? '▶ NEXT' : 'LOCKED'}</span><span class="m-reward">$${[200, 350, 400, 450, 800, 1200][i]}</span></div>`).join('');
  };

  let lastHealth = 100;
  H.update = (dt) => {
    const P = W.player;
    if (!P) return;
    els.cash.textContent = `$${W.cash.toLocaleString('en-US')}`;
    const hp = Math.max(0, Math.round(P.health));
    els.healthFill.style.width = `${hp}%`;
    els.healthFill.style.background = hp > 50 ? '#3aff66' : hp > 25 ? '#ffb13a' : '#ff3a3a';
    // wanted stars
    let stars = '';
    for (let i = 0; i < 5; i++) stars += i < W.wanted ? '★' : '☆';
    els.stars.textContent = stars;
    els.stars.style.color = W.wanted > 0 ? '#ffd23a' : 'rgba(255,255,255,0.35)';
    // clock: dayTime 0..1 -> 24h (0 = 06:00)
    const hours = Math.floor(((W.dayTime * 24 + 6) % 24));
    const mins = Math.floor((((W.dayTime * 24 + 6) % 1) * 60));
    els.clock.textContent = `SOLMAR ${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
    // objective
    els.objective.textContent = W.missions ? W.missions.objective : '';
    const active = W.missions && W.missions.active;
    els.missionTitle.textContent = W.missionLabel || (active ? W.missions.missionList()[W.missions.index].title.toUpperCase() : 'FREE ROAM');
    // speed
    if (P.car && !P.onFoot) {
      const kmh = Math.round(Math.abs(P.car.speed) * 3.6);
      els.speed.textContent = `${kmh} km/h`;
      els.speed.style.display = 'block';
    } else els.speed.style.display = 'none';
    // damage vignette
    if (hp < lastHealth) {
      els.damage.classList.add('hit');
      setTimeout(() => els.damage.classList.remove('hit'), 180);
    }
    lastHealth = hp;
    // interaction prompt
    let prompt = '';
    if (W.mode === 'play' && P.onFoot) {
      const near = W.cars.find((c) => c.health > 0 && !c.dead && Math.hypot(c.pos.x - P.pos.x, c.pos.z - P.pos.z) < 4.5);
      if (near) prompt = `E — Take the ${near.name}`;
    } else if (W.mode === 'play' && !P.onFoot) {
      prompt = 'E — Get out  ·  F — Horn';
    }
    els.prompt.textContent = prompt;
    els.prompt.style.display = prompt ? 'block' : 'none';
    els.crosshair.style.display = (W.mode === 'play' && P.onFoot && P.armed) ? 'block' : 'none';
    // minimap
    drawMinimap();
  };

  function drawMinimap() {
    const P = W.player;
    if (!P) return;
    const sc = 190 / (CFG.GROUND + 40);
    const px = (v) => (v + (CFG.GROUND + 40) / 2) * sc;
    mm.clearRect(0, 0, 190, 190);
    mm.drawImage(staticMap, 0, 0);
    // view window: keep the player centred-ish by drawing a clipped region
    mm.save();
    mm.beginPath();
    mm.arc(95, 95, 92, 0, Math.PI * 2);
    mm.clip();
    // mission marker
    if (W.missions && W.missions.targetPos) {
      const t = W.missions.targetPos;
      const pulse = 5 + Math.sin(W.elapsed * 5) * 2;
      mm.fillStyle = '#ffd23a';
      mm.beginPath();
      mm.arc(px(t.x), px(t.z), pulse, 0, Math.PI * 2);
      mm.fill();
      mm.strokeStyle = '#000';
      mm.lineWidth = 2;
      mm.stroke();
    }
    // cash pickups
    if (W.missions) {
      mm.fillStyle = '#2aff66';
      for (const pk of W.missions.pickups) {
        if (!pk.taken) { mm.fillRect(px(pk.pos.x) - 2, px(pk.pos.z) - 2, 4, 4); }
      }
    }
    // traffic
    mm.fillStyle = 'rgba(200,200,200,0.8)';
    for (const c of W.traffic) mm.fillRect(px(c.pos.x) - 1.5, px(c.pos.z) - 1.5, 3, 3);
    // police (flashing)
    const flash = Math.sin(W.elapsed * 10) > 0 ? '#ff3a3a' : '#3a6aff';
    mm.fillStyle = flash;
    for (const c of W.policeCars) {
      mm.beginPath();
      mm.arc(px(c.pos.x), px(c.pos.z), 4, 0, Math.PI * 2);
      mm.fill();
    }
    // player arrow (rotates with heading)
    mm.save();
    mm.translate(px(P.pos.x), px(P.pos.z));
    mm.rotate(-P.heading + Math.PI / 2);
    mm.fillStyle = '#fff';
    mm.beginPath();
    mm.moveTo(0, -7); mm.lineTo(5, 6); mm.lineTo(0, 3); mm.lineTo(-5, 6);
    mm.closePath();
    mm.fill();
    mm.strokeStyle = '#000';
    mm.lineWidth = 1.5;
    mm.stroke();
    mm.restore();
    mm.restore();
    mm.strokeStyle = 'rgba(255,255,255,0.5)';
    mm.lineWidth = 2;
    mm.beginPath();
    mm.arc(95, 95, 92, 0, Math.PI * 2);
    mm.stroke();
  }

  W.hud = H;
  return H;
}

// Solmar Heat — save / continue via localStorage. Nothing leaves the browser.
import { W } from './world.js';

const KEY = 'solmar-heat-save-v1';

export function createSave() {
  const S = {};
  S.save = () => {
    try {
      const P = W.player;
      const data = {
        cash: W.cash,
        missionIndex: W.missions ? W.missions.index : 0,
        missionsDone: W.stats.missionsDone,
        carsStolen: W.stats.carsStolen,
        health: P ? P.health : 100,
        pos: P ? [P.pos.x, P.pos.z] : [0, 36],
        savedAt: Date.now(),
      };
      localStorage.setItem(KEY, JSON.stringify(data));
    } catch (e) { /* storage unavailable (private mode, headless) */ }
  };
  S.load = () => {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  };
  S.hasSave = () => !!S.load();
  S.clear = () => { try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ } };
  W.save = S;
  return S;
}

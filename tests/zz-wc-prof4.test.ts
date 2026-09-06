import { it } from 'vitest';
import { readFileSync, openSync, writeSync, closeSync } from 'node:fs';
import { parseWldToSave } from '../src/wld/WldImport';
import { loadSaveData } from '../src/save/SaveFile';
import { LiquidSim } from '../src/world/liquid/LiquidSim';
import { TILE_DEFS } from '../src/data/tiles';

const SHEET_OF = new Int32Array(TILE_DEFS.length).fill(-1);
for (let q = 0; q < TILE_DEFS.length; q++) {
  const s = TILE_DEFS[q]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET_OF[q] = s;
}

it('wc-prof4', () => {
  const b = readFileSync('/Users/vinlic/Downloads/天真的钴最高点.wld');
  const { world } = loadSaveData(parseWldToSave(new Uint8Array(b)).save);
  const sim: any = new LiquidSim(world);
  sim.isGeneratingOrLoadingWorld = true;
  sim.worldGenTilesIgnoreWater(true);
  const st = world.store;
  const t0 = performance.now();
  const LOG = openSync('/tmp/prof4.log', 'w');
  const log = (t: string) => writeSync(LOG, t + '\n');
  const CAP = 30000;
  try {
    for (let x = 1; x < st.w - 1; x++) {
      for (let y = st.h - 2; y > 0; y--) {
        const i = y * st.w + x;
        sim.checking[i] = 0;
        if (st.liquid[i] === 0) continue;
        if (performance.now() - t0 > CAP) throw new Error('TIME-CAP');
        const t = st.type[i];
        const il = i - 1, ir = i + 1, iu = i - st.w, id = i + st.w;
        const nactive = st.flags[i] !== 0 && ((st.wire[i] >>> 5) & 1) === 0;
        let solidBr = false;
        if (t >= 0 && nactive && sim.solidNP[t] === 1) {
          solidBr = true;
          if (SHEET_OF[t] !== 379) st.liquid[i] = 0;
        } else {
          if (st.flags[i] !== 0) {
            if (st.liquidType[i] === 2) { if (sim.diesIn(t, st.frameX[i], st.frameY[i], true)) sim.killTileAt(x, y); }
            else if (sim.diesIn(t, st.frameX[i], st.frameY[i], false)) sim.killTileAt(x, y);
          }
        }
        if (!solidBr) {
          const dq = st.liquid[id];
          if (!sim.blocksLiquid(x, y + 1) && dq < 255) {
            if (dq > 250) st.liquid[id] = 255;
            else sim.addWater(x, y);
          }
          if (!sim.blocksLiquid(x - 1, y) && st.liquid[il] !== st.liquid[i]) sim.addWater(x, y);
          else if (!sim.blocksLiquid(x + 1, y) && st.liquid[ir] !== st.liquid[i]) sim.addWater(x, y);
          if (st.liquidType[i] === 2) {
            if ((st.liquid[il] > 0 && st.liquidType[il] !== 2) ||
                (st.liquid[ir] > 0 && st.liquidType[ir] !== 2) ||
                (st.liquid[iu] > 0 && st.liquidType[iu] !== 2) ||
                (dq > 0 && st.liquidType[id] !== 2)) sim.addWater(x, y);
          }
        }
      }
    }
    log('LOOP-COMPLETE elapsed=' + Math.round(performance.now() - t0)); closeSync(LOG);
  } catch (e) { log('CAP-HIT: ' + String(e).slice(0, 60) + ' elapsed=' + Math.round(performance.now() - t0)); closeSync(LOG); }
  sim.dispose();
}, 300000);

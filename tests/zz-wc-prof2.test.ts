// 手工复刻 waterCheckInner 主循环(逐字),60 秒 throw 中断→cpu-prof 正常 flush
import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseWldToSave } from '../src/wld/WldImport';
import { loadSaveData } from '../src/save/SaveFile';
import { LiquidSim } from '../src/world/liquid/LiquidSim';
import { SHEET_OF } from '../src/data/tiles';

it('wc-prof2', () => {
  const b = readFileSync('/Users/vinlic/Downloads/天真的钴最高点.wld');
  const { world } = loadSaveData(parseWldToSave(new Uint8Array(b)).save);
  const sim = new LiquidSim(world);
  sim.isGeneratingOrLoadingWorld = true;
  sim.worldGenTilesIgnoreWater(true);
  const st = world.store;
  const t0 = performance.now();
  const CAP = 60000;
  try {
    // 逐字复刻 waterCheckInner 主循环(取证复刻,定稿不做)
    for (let x = 1; x < st.w - 1; x++) {
      for (let y = st.h - 2; y > 0; y--) {
        const i = sim['idx'](x, y) as number;
        (sim as unknown as { checking: Uint8Array }).checking[i] = 0;
        if (st.liquid[i] === 0) continue;
        if (performance.now() - t0 > CAP) throw new Error('TIME-CAP');
        const t = st.type[i];
        const il = i - 1, ir = i + 1, iu = i - st.w, id = i + st.w;
        const nactive = st.flags[i] !== 0 && ((st.wire[i] >>> 5) & 1) === 0;
        let solidBr = false;
        if (t >= 0 && nactive && (sim as unknown as { solidNP: Uint8Array }).solidNP[t] === 1) {
          solidBr = true;
          if (SHEET_OF[t] !== 379) st.liquid[i] = 0;
        } else {
          if (st.flags[i] !== 0) {
            const s = sim as unknown as {
              diesIn: (t: number, fx: number, fy: number, l: boolean) => boolean;
              killTileAt: (x: number, y: number) => void;
            };
            if (st.liquidType[i] === 2) { if (s.diesIn(t, st.frameX[i]!, st.frameY[i]!, true)) s.killTileAt(x, y); }
            else if (s.diesIn(t, st.frameX[i]!, st.frameY[i]!, false)) s.killTileAt(x, y);
          }
        }
        if (!solidBr) {
          const dq = st.liquid[id];
          if (!sim['blocksLiquid'](x, y + 1) && dq < 255) {
            if (dq > 250) st.liquid[id] = 255;
            else sim['addWater'](x, y);
          }
          if (!sim['blocksLiquid'](x - 1, y) && st.liquid[il] !== st.liquid[i]) sim['addWater'](x, y);
          else if (!sim['blocksLiquid'](x + 1, y) && st.liquid[ir] !== st.liquid[i]) sim['addWater'](x, y);
          if (st.liquidType[i] === 2) {
            if ((st.liquid[il] > 0 && st.liquidType[il] !== 2) ||
                (st.liquid[ir] > 0 && st.liquidType[ir] !== 2) ||
                (st.liquid[iu] > 0 && st.liquidType[iu] !== 2) ||
                (dq > 0 && st.liquidType[id] !== 2)) sim['addWater'](x, y);
          }
        }
      }
    }
    console.log('LOOP-COMPLETE');
  } catch (e) { console.log('CAP-HIT: ' + String(e).slice(0, 40)); }
  sim.dispose();
  console.log('PROF2-DONE elapsed=' + Math.round(performance.now() - t0));
}, 300000);

import { it } from 'vitest';
import { readFileSync, openSync, writeSync, closeSync } from 'node:fs';
import { parseWldToSave } from '../src/wld/WldImport';
import { loadSaveData } from '../src/save/SaveFile';
import { LiquidSim } from '../src/world/liquid/LiquidSim';

const LOG = openSync('/tmp/wc-verify.log', 'w');
const log = (s: string) => { writeSync(LOG, s + '\n'); };
const mem = () => { const m = process.memoryUsage(); return `heap=${Math.round(m.heapUsed/1e6)}MB rss=${Math.round(m.rss/1e6)}MB`; };

it('wc-verify', async () => {
  const b = readFileSync('/Users/vinlic/Downloads/天真的钴最高点.wld');
  const { world } = loadSaveData(parseWldToSave(new Uint8Array(b)).save);
  log(`T1 loaded ${mem()}`);
  const sim = new LiquidSim(world);
  sim.isGeneratingOrLoadingWorld = true;
  sim.quickWater();
  log(`T2 quickWater done ${mem()}`);
  sim.waterCheck();
  log(`T3 waterCheck done numLiquid=${sim.numLiquid} dropped=${(globalThis as { __swFrameDropped?: number }).__swFrameDropped ?? 0} ${mem()}`);
  sim.quickSettle = true;
  let iter = 0;
  const t0 = performance.now();
  while (sim.numLiquid > 0 && iter < 100000) {
    sim.updateLiquid();
    iter++;
    if (iter % 20000 === 0) log(`T4 iter=${iter} numLiquid=${sim.numLiquid} t=${Math.round(performance.now()-t0)}ms ${mem()}`);
  }
  log(`T5 settle loop done iter=${iter} numLiquid=${sim.numLiquid} t=${Math.round(performance.now()-t0)}ms ${mem()}`);
  sim.quickSettle = false;
  sim.worldGenTilesIgnoreWater(false);
  sim.waterCheck();
  log(`T6 final waterCheck done ${mem()}`);
  sim.dispose();
  log(`T7 dispose done dropped=${(globalThis as { __swFrameDropped?: number }).__swFrameDropped ?? 0}`);
  closeSync(LOG);
}, 600000);

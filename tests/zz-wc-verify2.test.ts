// ★刀 I 定谳+隔离（2026-09-29）:液体域一次性取证仪（见 zz-wc-count2.test.ts 头注）。
//   waterCheck/settle 全同步循环阻塞 worker → testTimeout 永不触发 → 全量套件末段挂死。
//   缺省 skip,SW_WC_FORENSIC=1 显式启用;非删除（归属原取证会话,登记不清理）。
import { it } from 'vitest';
const itForensic = it.runIf(process.env.SW_WC_FORENSIC === '1');
import { readFileSync, openSync, writeSync, closeSync } from 'node:fs';
import { readLocalFixture } from './fixturePath';
import { parseWldToSave } from '../src/wld/WldImport';
import { loadSaveData } from '../src/save/SaveFile';
import { LiquidSim } from '../src/world/liquid/LiquidSim';

const LOG = openSync('/tmp/wc-verify2.log', 'w');
const log = (s: string) => { writeSync(LOG, s + '\n'); };
const mem = () => { const m = process.memoryUsage(); return `heap=${Math.round(m.heapUsed/1e6)}MB rss=${Math.round(m.rss/1e6)}MB`; };

itForensic('wc-verify2', async () => {
  const b = readLocalFixture('naive-cobalt-peak.wld');
  const { world } = loadSaveData(parseWldToSave(new Uint8Array(b)).save);
  log(`T1 loaded ${mem()}`);
  const sim = new LiquidSim(world);
  sim.isGeneratingOrLoadingWorld = true;
  let t = performance.now();
  sim.quickWater();
  log(`T2 quickWater ${Math.round(performance.now()-t)}ms ${mem()}`);
  t = performance.now();
  sim.waterCheck();
  log(`T3 waterCheck ${Math.round(performance.now()-t)}ms numLiquid=${sim.numLiquid} dropped=${(globalThis as { __swFrameDropped?: number }).__swFrameDropped ?? 0} ${mem()}`);
  sim.quickSettle = true;
  t = performance.now();
  let iter = 0;
  while (sim.numLiquid > 0 && iter < 100000) {
    sim.updateLiquid();
    iter++;
    if (iter % 10000 === 0) log(`T4 iter=${iter} numLiquid=${sim.numLiquid} t=${Math.round(performance.now()-t)}ms ${mem()}`);
  }
  log(`T5 settle loop done iter=${iter} numLiquid=${sim.numLiquid} t=${Math.round(performance.now()-t)}ms ${mem()}`);
  sim.quickSettle = false;
  sim.worldGenTilesIgnoreWater(false);
  t = performance.now();
  sim.waterCheck();
  log(`T6 final waterCheck ${Math.round(performance.now()-t)}ms ${mem()}`);
  sim.dispose();
  log(`T7 done dropped=${(globalThis as { __swFrameDropped?: number }).__swFrameDropped ?? 0}`);
  closeSync(LOG);
}, 600000);

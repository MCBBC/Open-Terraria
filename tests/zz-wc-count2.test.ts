// 细粒度:killTileGen 次数+单次耗时、addWater 次数,每 2 万 kill 采样
import { it } from 'vitest';
import { readFileSync, openSync, writeSync, closeSync } from 'node:fs';
import { parseWldToSave } from '../src/wld/WldImport';
import { loadSaveData } from '../src/save/SaveFile';
import { LiquidSim } from '../src/world/liquid/LiquidSim';

const LOG = openSync('/tmp/wc-count2.log', 'w');
const log = (s: string) => { writeSync(LOG, s + '\n'); };

it('wc-count2', () => {
  const b = readFileSync('/Users/vinlic/Downloads/天真的钴最高点.wld');
  const { world } = loadSaveData(parseWldToSave(new Uint8Array(b)).save);
  const sim = new LiquidSim(world);
  sim.isGeneratingOrLoadingWorld = true;

  const G = globalThis as { __sw118Kt?: (t: string, x: number, y: number) => void };
  let ktGen = 0, tGen = 0;
  let lastMark = performance.now();
  G.__sw118Kt = (tag) => {
    if (tag !== 'killTileGen') return;
    const t0 = performance.now();
    // 只计数,耗时测量放在外层 killTileAt patch
    ktGen++;
    void t0;
    if (ktGen % 20000 === 0) {
      const now = performance.now();
      log(`sample killTileGen=${ktGen} sinceLast=${Math.round(now - lastMark)}ms`);
      lastMark = now;
    }
    void tGen;
  };
  log(`begin`);
  const t0 = performance.now();
  sim.waterCheck();
  log(`DONE waterCheck=${Math.round(performance.now() - t0)}ms killTileGen=${ktGen} numLiquid=${sim.numLiquid}`);
  closeSync(LOG);
}, 600000);

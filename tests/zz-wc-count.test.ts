// 统计 waterCheck 级联放大率:killTileAt/killTileGen/tileFrameGen/addWater 调用计数
import { it } from 'vitest';
import { readFileSync, openSync, writeSync, closeSync } from 'node:fs';
import { parseWldToSave } from '../src/wld/WldImport';
import { loadSaveData } from '../src/save/SaveFile';
import { LiquidSim } from '../src/world/liquid/LiquidSim';

const LOG = openSync('/tmp/wc-count.log', 'w');
const log = (s: string) => { writeSync(LOG, s + '\n'); };

it('wc-count', async () => {
  const b = readFileSync('/Users/vinlic/Downloads/天真的钴最高点.wld');
  const { world } = loadSaveData(parseWldToSave(new Uint8Array(b)).save);
  const sim = new LiquidSim(world);
  sim.isGeneratingOrLoadingWorld = true;

  // 全局计数器注入
  const G = globalThis as { __sw118Kt?: (t: string, x: number, y: number) => void };
  let ktGen = 0, ktAt = 0;
  G.__sw118Kt = (tag) => { if (tag === 'killTileGen') ktGen++; else ktAt++; };
  // patch addWater 计数
  const proto = LiquidSim.prototype as unknown as Record<string, unknown>;
  const origAdd = (proto.addWater as (this: LiquidSim, x: number, y: number) => void);
  let aw = 0;
  (proto as { addWater: unknown }).addWater = function (this: LiquidSim, x: number, y: number) {
    aw++;
    if (aw % 2000000 === 0) log(`sample addWater=${aw} ktAt=${ktAt} ktGen=${ktGen}`);
    origAdd.call(this, x, y);
  };
  log(`begin`);
  const t0 = performance.now();
  sim.waterCheck();
  const dt = Math.round(performance.now() - t0);
  log(`DONE waterCheck=${dt}ms addWater=${aw} killTileAt=${ktAt} killTileGen=${ktGen} numLiquid=${sim.numLiquid}`);
  closeSync(LOG);
}, 600000);

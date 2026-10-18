// 细粒度:killTileGen 次数+单次耗时、addWater 次数,每 2 万 kill 采样
// ★刀 I 定谳+隔离（2026-09-29）:本文件与 zz-wc-verify2 为 09-07 液体域一次性取证仪
//   （全量 LiquidSim.waterCheck on 7.8MB 私档「天真的钴最高点.wld」），同步大循环阻塞
//   worker 事件循环 → 600s testTimeout 计时器永不触发 → 全量套件末段挂死 2.5h+ CPU
//   （BJ250 同签名;物证=/tmp/wc-count2.log 18:48 'begin' 后无 DONE,三把全量跑
//   gore/gore2/full 末位完成文件后零完成,本对文件三轮均零返回）。
//   隔离=缺省 skip,SW_WC_FORENSIC=1 显式启用;非删除（归属原取证会话,登记不清理）。
import { it } from 'vitest';
const itForensic = it.runIf(process.env.SW_WC_FORENSIC === '1');
import { readFileSync, openSync, writeSync, closeSync } from 'node:fs';
import { readLocalFixture } from './fixturePath';
import { parseWldToSave } from '../src/wld/WldImport';
import { loadSaveData } from '../src/save/SaveFile';
import { LiquidSim } from '../src/world/liquid/LiquidSim';

const LOG = openSync('/tmp/wc-count2.log', 'w');
const log = (s: string) => { writeSync(LOG, s + '\n'); };

itForensic('wc-count2', () => {
  const b = readLocalFixture('naive-cobalt-peak.wld');
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

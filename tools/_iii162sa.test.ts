// IIII162 一次性诊断（env 门控 SW_I162=1，用毕可删）：
// sandy #76 Traps 巨石变体定罪仪 —— x86 i162 rig（SW_P2LOG per-attempt 钩 +
// SW_ROLLWIN=76-76 原始样本流）× JS 本探针双通道逐 attempt 对拍。
// 采集：①__swTrapEv 全事件（rc 注账）②__swOnRoll 样本流（Traps 窗内）
// 窗口=「倒木水景」槽末之后 .. 「地表装饰」槽末（=Traps pass 全程）。
import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';

const RUN = process.env.SW_I162 === '1';
const SEED = process.env.SW_I162_SEED ?? '1.1.1.0.sandybritches|106104';
const W = Number(process.env.SW_I162_W ?? 4200), H = Number(process.env.SW_I162_H ?? 1200);
const OUT = process.env.SW_I162_OUT ?? '/tmp/iii162-out';

(RUN ? it : it.skip)('IIII162 sandy traps per-attempt trace', async () => {
  let rollN = 0;
  let win = false;
  const ev: string[] = [];
  const samples: number[] = [];
  const g = globalThis as unknown as {
    __swOnRoll?: (v: number, inst: object) => void;
    __swTrapEv?: (k: string, a: number, b: number, v: number) => void;
  };
  g.__swOnRoll = (v) => {
    rollN++;
    if (win && samples.length < 4_000_000) samples.push(v);
  };
  g.__swTrapEv = (k, a, b, v) => {
    if (win || k === 'A') ev.push(`${rollN}|${k}|${a}|${b}|${v}`);
  };
  let winStarted = false;
  const t0 = Date.now();
  try {
    await generateWorld({
      width: W, height: H, seedText: SEED, evil: -1 as -1,
      onWorldPartial: (_w, _i, pn) => {
        if (pn === '倒木水景' && !winStarted) { winStarted = true; win = true; }
        else if (winStarted && pn === '地表装饰' && win) { win = false; }
      },
    });
  } finally {
    delete g.__swOnRoll;
    delete g.__swTrapEv;
  }
  writeFileSync(`${OUT}/js-trap.log`, ev.join('\n') + '\n');
  writeFileSync(`${OUT}/js-rollwin.txt`, samples.join('\n') + '\n');
  console.log(`[i162] events=${ev.length} samples=${samples.length} ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  const vids = ev.filter((l) => l.includes('|VID|'));
  console.log(`[i162] VID=${vids.length}`);
  for (const l of vids) console.log(`[i162] VID ${l}`);
}, 900_000);

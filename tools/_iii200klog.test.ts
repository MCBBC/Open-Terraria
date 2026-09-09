// IIIIRS200: JS 侧 DoErrorWorldFinish KLOG 全链采集（__swI200EWK 钩;SW_I200=1 门）。
// 用途: 与 x86 rig(/tmp/i200 车道,SW_EWKLOG) DoErrorWorldFinish 逐掷对拍,定谳 #105
// iamerror Final_Cleanup 相位漂移首掷。零主路径:钩子缺省时 doErrorWorldFinish 内
// ewK() 为 undefined,全部 ewLog 退化为 no-op（批后 src 织标还原,本件保留为仪具）。
// 跑法: cd game && SW_I200=1 SW_I200_OUT=/tmp/iii200-out/js-ewklog.txt \
//        npx vitest run tools/_iii200klog.test.ts
import { it as itRaw } from 'vitest';
// ★IIIII229(⑩ 212 章 M3 门控卫生批):一次性仪默认 skip,不在常态 vitest 收集执行面;用法 SW_I200=1 npx vitest run tools/_iii200klog.test.ts
const RUN = process.env.SW_I200 === '1';
const it = RUN ? itRaw : itRaw.skip;

import { openSync, writeSync, closeSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';

it('iii200 ew klog js full chain', async () => {
  if (process.env.SW_I200 !== '1') return;
  const out = process.env.SW_I200_OUT ?? '/tmp/iii200-out/js-ewklog.txt';
  const fd = openSync(out, 'w');
  let buf = '';
  (globalThis as unknown as { __swI200EWK?: { w(line: string): void; flush?(): void } }).__swI200EWK = {
    w: (line: string) => {
      buf += line + '\n';
      if (buf.length >= 1 << 22) {
        writeSync(fd, buf);
        buf = '';
      }
    },
    flush: () => {
      if (buf) {
        writeSync(fd, buf);
        buf = '';
      }
    },
  };
  try {
    await generateWorld({ width: 4200, height: 1200, seedText: '1.1.1.0.iamerror|106103', evil: -1 });
  } finally {
    if (buf) writeSync(fd, buf);
    closeSync(fd);
    delete (globalThis as unknown as { __swI200EWK?: unknown }).__swI200EWK;
  }
}, 900_000);

// 世界生成卡点剖析 v2:文件日志(绕开管道缓冲)+ 自超时 exit(0) 让 --cpu-prof 落盘。
// 用法(node 原生 flag,经 run-diag 跑防孤儿):
//   node --import ../server/node_modules/tsx/dist/loader.mjs --cpu-prof --cpu-prof-dir=/tmp/wgen-prof scripts/_worldgen-prof.mjs
import { appendFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen.ts';

const LOG = '/tmp/wgen-prof/progress.log';
const t0 = Date.now();
const log = (s) => { const line = `[+${((Date.now() - t0) / 1000).toFixed(1)}s] ${s}`; appendFileSync(LOG, line + '\n'); };

// 自超时:240s 未完成 → 落盘 profile 后退出(exit 0 才写 .cpuprofile)
setTimeout(() => { log('TIMEOUT 240s — dumping profile'); process.exit(0); }, 240_000).unref?.();

log('start seed=12345 4200x1200');
const w = await generateWorld(
  { width: 4200, height: 1200, seedText: '12345', name: 'prof' },
  (label, p) => log(`${(p * 100).toFixed(0)}% ${label}`),
);
log(`done ${w.w}x${w.h}`);
process.exit(0);

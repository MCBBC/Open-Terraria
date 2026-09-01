// IIII148b 一次性诊断（env 门控 SW_I148B=1，用毕可删）：
// sandy #76 Traps 巨石变体定罪仪——注册 __swTrapEv 钩捕 JS placeTrap0 全事件序，
// 输出 VID（巨石变体）/K/T 站点序，与 x86 dump 075→076 巨石站点集对拍。
import { it } from 'vitest';
import { generateWorld } from '../src/world/gen/WorldGen';

const RUN = process.env.SW_I148B === '1';
const SEED = process.env.SW_I148_SEED ?? '0';
const FLAG = process.env.SW_I148_FLAGS ?? '';

(RUN ? it : it.skip)('IIII148b trap boulder event trace', async () => {
  const ev: string[] = [];
  (globalThis as unknown as { __swTrapEv?: (k: string, a: number, b: number, v: number) => void }).__swTrapEv =
    (k, a, b, v) => { if (k === 'VID' || k === 'K') ev.push(`${k}|${a}|${b}|${v}`); };
  try {
    const flags: Record<string, boolean> = {};
    for (const f of FLAG.split(',').filter(Boolean)) flags[f] = true;
    await generateWorld({
      width: 4200, height: 1200, seedText: SEED, evil: -1 as -1,
      seedFlags: Object.keys(flags).length ? flags : undefined,
    });
  } finally { delete (globalThis as unknown as Record<string, unknown>).__swTrapEv; }
  const vids = ev.filter((l) => l.startsWith('VID|'));
  console.log(`[i148b] total events=${ev.length} VID=${vids.length}`);
  console.log(vids.map((l) => `[i148b] ${l}`).join('\n'));
}, 600000);

// IIII189 批：座2 TRAPS attempt #297=(3354,740) 窗口 dump 仪（一次性诊断,零主路径改动）。
// 移交前沿（CLXIII）：座2 TRAPS lenΔ −18,主环 1,533 attempt 逐位 1:1 至 0-based #297——
// rig placeTrap 掷 Next(3) 1 骰后败,js placeTrap0 掷前即拒（0 骰）。本仪在 instIdx1 窗口
// 首个 (3354,740) attempt 时点落盘十通道窗口（x∈[3254,3454) y∈[700,1010)）,与 rig
// JJHook.Trap189 的 T189.* 同窗同通道,离线 diff 定谳「谓词序债 vs 态差」。
// 用法：cd game && SW_I189=1 SW_I179=1 npx vitest run tools/_iii189trp.test.ts
import { it } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';

const RUN = process.env.SW_I189 === '1';
const OUT = '/tmp/iii189-out';

(RUN ? it : it.skip)('i189 trap window dump', { timeout: 900_000 }, async () => {
  mkdirSync(OUT, { recursive: true });
  (globalThis as { __swI189Sink?: (d: Record<string, Uint8Array | Uint16Array>) => void }).__swI189Sink = (d) => {
    for (const [k, v] of Object.entries(d)) {
      writeFileSync(`${OUT}/js-T189.${k}`, Buffer.from(v.buffer, v.byteOffset, v.byteLength));
    }
    console.log('[i189] sink fired, channels=' + Object.keys(d).join(','));
  };
  const trp: string[] = [];
  (globalThis as { __swI113?: (l: string) => void }).__swI113 = (l: string) => {
    if (l.startsWith('DR|')) trp.push(l);
  };
  try {
    await generateWorld({
      width: 4200, height: 1200, seedText: '1.1.1.0.doubledaringdangers|20260831', evil: -1 as -1 | 0 | 1,
      seedFlags: { dualDungeons: true },
    } as Parameters<typeof generateWorld>[0]);
  } finally {
    delete (globalThis as { __swI189Sink?: unknown }).__swI189Sink;
    delete (globalThis as { __swI113?: unknown }).__swI113;
  }
  const idx = trp.findIndex((l) => l.includes('|x=3354|y=740|'));
  console.log(`[i189] TRP lines=${trp.length} target(3354,740) at 0-based ${idx} line=${trp[idx] ?? 'NONE'}`);
  writeFileSync('/tmp/iii189-out/js-dr-all.txt', trp.join('\n') + '\n');
}, 900_000);

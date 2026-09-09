// IIIII229 一次性诊断：212 章 M1「404 化石锚邻杀」可达性普查仪。
//   ddual 认证链（seedText '1.1.1.0.doubledaringdangers|20260831'，_iii200chain 同配方）
//   + 附加 ddual 籽全程 generateWorld，经 DungeonPass placeTrap0 ★IIII194 化石碎裂块的
//   __swI229Fossil 钩（'enc'=活化石邻遭遇[maxValue] / 'kill'=邻杀执行）计数——
//   **本件只读计数零写面**（写面刀已在 DungeonPass 落盘，与本仪解耦）。
// 用法：cd game && SW_I229_FOSSIL=1 npx vitest run tools/_iii229fossil.test.ts
//   （SW_I229_FOSSIL_OUT 默认 /tmp/iii229-out/fossil-census.json）
import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';

const RUN = process.env.SW_I229_FOSSIL === '1';   // ★IIIII229 ⑩M3 门控卫生批:一次性仪默认 skip
const OUT = process.env.SW_I229_FOSSIL_OUT ?? '/tmp/iii229-out/fossil-census.json';

const SEEDS = ['1.1.1.0.doubledaringdangers|20260831', '1.1.1.0.doubledaringdangers|20260909'];

(RUN ? it : it.skip)('i229 fossil-shatter reachability census', { timeout: 1_800_000 }, async () => {
  const g = globalThis as { __swI229Fossil?: (kind: 'enc' | 'kill', maxValue: number) => void };
  const per: Record<string, { enc15: number; enc4: number; kill: number }> = {};
  let cur = '';
  g.__swI229Fossil = (kind, maxValue) => {
    const b = (per[cur] ??= { enc15: 0, enc4: 0, kill: 0 });
    if (kind === 'enc') { if (maxValue === 4) b.enc4++; else b.enc15++; }
    else b.kill++;
  };
  for (const seed of SEEDS) {
    cur = seed;
    per[seed] ??= { enc15: 0, enc4: 0, kill: 0 };
    await generateWorld({
      width: 4200, height: 1200, seedText: seed, evil: -1 as -1 | 0 | 1,
      seedFlags: { dualDungeons: true }, name: 'iii229-fossil',
    } as never, () => {});
  }
  g.__swI229Fossil = undefined;
  // 世界级命中概率：P(无杀)=∏_enc(1-1/maxValue)
  const report = Object.entries(per).map(([seed, b]) => {
    const n = b.enc15 + b.enc4;
    const pNone = Math.pow(14 / 15, b.enc15) * Math.pow(3 / 4, b.enc4);
    return { seed, enc15: b.enc15, enc4: b.enc4, encounters: n, kills: b.kill, pNonePerWorld: +pNone.toFixed(4) };
  });
  console.log('[III229 fossil census]', JSON.stringify(report));
  writeFileSync(OUT, JSON.stringify(report, null, 2));
});

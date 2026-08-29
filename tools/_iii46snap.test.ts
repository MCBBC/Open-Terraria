// IIIII46（celebrationmk10 T2→T1）一次性诊断：在指定槽边界导出 JS 管线四通道快照
// （act/typ/wal/liq，与 mile8 dump 文件同格式），供离线连通域分析定位 pass 内分歧。
// 用法：cd game && SW_I46_SNAP=1 npx vitest run tools/_iii46snap.test.ts
// 可调：SW_I46_FLAGS、SW_I46_SEED。
import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { RNG } from '../src/core/rng';
import { TILE_DEFS } from '../src/data/tiles';

const RUN = process.env.SW_I46_SNAP === '1';
// 与 mile8 同款：JS 内部 id → 原版 sheet 投影（typ 通道按原版口径写出）
const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}
const SEED = process.env.SW_I46_SEED ?? '1999040562';
// 想比对的触发标签列表：在「该标签的 reseed 发生前」抓取上一 pass 末态。
const TAGS = (process.env.SW_I46_TAGS ?? 'Lakes,Slush,Dungeon').split(',');

(RUN ? it : it.skip)('I46 snapshot exporter', async () => {
  const RNGp = RNG.prototype as unknown as Record<string, unknown>;
  const oReseed = RNGp.reseed as (this: unknown, s: number) => void;
  let curStore: Parameters<typeof emit>[2] | null = null;
  const want = new Set(TAGS);
  const W = Number(process.env.SW_M8_W ?? 4200), H = Number(process.env.SW_M8_H ?? 1200);
  function emit(tag: string, dir: string, st: {
    type: Uint16Array; flags: Uint8Array; wall: Uint16Array; liquid: Uint8Array;
  }) {
    const n = st.type.length;
    const actBuf = new Uint8Array(n); const typBuf = new Uint16Array(n);
    for (let i = 0; i < n; i++) {
      const ja = st.flags[i]! & 1; actBuf[i] = ja;
      typBuf[i] = ja ? (SHEET[st.type[i]!] >= 0 ? SHEET[st.type[i]!]! : 9999) : 0;
    }
    const OUT = '/tmp/iii48-out/jssnap'; void OUT; void dir;
    writeFileSync(`/tmp/iii48-out/jssnap/${dir}.act`, actBuf);
    writeFileSync(`/tmp/iii48-out/jssnap/${dir}.typ`, Buffer.from(typBuf.buffer));
    writeFileSync(`/tmp/iii48-out/jssnap/${dir}.wal`, Buffer.from(new Uint16Array(st.wall).buffer));
    writeFileSync(`/tmp/iii48-out/jssnap/${dir}.liq`, st.liquid);
    writeFileSync(`/tmp/iii48-out/jssnap/${dir}.lty`, st.liquidType);
  }
  RNGp.reseed = function (this: unknown, s: number) {
    const stack = new Error().stack ?? '';
    for (const line of stack.split('\n')) {
      const m = line.match(/((?:\/|[\w./-]*)src\/[^\s()]+\.ts):(\d+):\d+/);
      if (m && !m[1].includes('/core/rng') && !m[1].includes('_iii46')) {
        // 借 mile8 的 ▶label 抽取
        const file = m[1], lineNo = Number(m[2]);
        const lab = ((): string => {
          try { return labelOf(file, lineNo); } catch { return ''; }
        })();
        if (lab && curStore && want.has(lab)) {
          emit(lab, `${String(TAGS.indexOf(lab)).padStart(3, '0')}_${lab}`, curStore);
          console.log(`[i46snap] captured @${lab}`);
        }
        break;
      }
    }
    return oReseed.call(this, s);
  };
  await generateWorld({
    width: W, height: H, seedText: SEED, evil: 0,
    seedFlags: { tenthAnniversary: true },
    onWorldPartial: (w) => { if (!curStore) curStore = w.store as never as typeof curStore; },
  });
  RNGp.reseed = oReseed;
}, 900_000);

import { readFileSync } from 'node:fs';
function labelOf(file: string, line: number): string {
  const src = readFileSync(file, 'utf8').split('\n');
  for (let l = Math.min(line, src.length) - 1; l >= 0 && l >= line - 40; l--) {
    const m = src[l]!.match(/▶([^（(]+?)[（(\s]/);
    if (m) return m[1].trim();
  }
  return '';
}

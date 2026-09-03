// IIII208 批取证仪③：槽末全量 8 通道 diff（对 G2 金标 dump 逐格）。
// 在 '表面'(→073)/'地表装饰'(→076)/'矿骨堆'(→077) 三槽 onWorldPartial 时,
// 把 JS store 与 ~/GoldenChains/golden-gfb-c 对应槽 dump 全量对比,落全部差异格
// （含 act=active 位/slope/half/typ,像 mile8 口径但不设 8 样本帽）。
// 用法：cd game && SW_I208DIFF=1 npx vitest run tools/_iii208diff.test.ts
import { it } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../src/data/tiles';

const RUN = process.env.SW_I208DIFF === '1';
const OUT = process.env.SW_I208_OUT ?? '/tmp/iii208-out';
const SEED = process.env.SW_I208_SEED ?? '9293480';
const G2 = process.env.SW_I208_G2 ?? `${process.env.HOME}/GoldenChains/golden-gfb-c`;
const W = 4200, H = 1200, N = W * H;

const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}

const le16 = (p: string): Uint16Array => {
  const b = readBuf(p);
  return new Uint16Array(b.buffer, b.byteOffset, b.length >> 1);
};
import { readFileSync } from 'node:fs';
function readBuf(p: string): Buffer { return readFileSync(p); }

(RUN ? it : it.skip)('iii208 full 8ch slot-end diffs', { timeout: 1_800_000 }, async () => {
  const g = globalThis as unknown as Record<string, unknown>;
  mkdirSync(OUT, { recursive: true });
  const SLOT_DUMP: Record<string, number> = { 表面: 73, 地表装饰: 76, 矿骨堆: 77 };
  const NAMES: Record<number, string> = { 73: '073_Spreading_Grass', 76: '076_Traps', 77: '077_Piles' };
  const lines: string[] = [];
  let world: { store: { idx(x: number, y: number): number; type: Uint8Array; flags: Uint8Array; slope: Uint8Array; half: Uint8Array; wire: Uint8Array; paint: Uint8Array; wall: Uint16Array; liquid: Uint8Array } } | null = null;

  await generateWorld({
    width: W, height: H, seedText: SEED, evil: 0 as -1 | 0 | 1,
    seedFlags: { remix: true, drunkWorld: true, notTheBees: true, noTraps: true, theConstant: true, tenthAnniversary: true, getGoodWorld: true },
    onWorldPartial: (w2, _i, name) => {
      world = w2 as never;
      const dumpIdx = SLOT_DUMP[name];
      if (!dumpIdx) return;
      const pre = `${G2}/${NAMES[dumpIdx]!}`;
      const c = {
        t: le16(`${pre}.typ`), a: readFileSync(`${pre}.act`),
        w: le16(`${pre}.wal`), l: readFileSync(`${pre}.liq`),
        hf: readFileSync(`${pre}.half`), sl: readFileSync(`${pre}.slope`),
        lt: readFileSync(`${pre}.lty`), ia: readFileSync(`${pre}.inact`),
      };
      const st = world!.store;
      lines.push(`===== slot ${name} vs dump ${dumpIdx} =====`);
      const buckets = new Map<string, string[]>();
      for (let i = 0; i < N; i++) {
        const x = i % W, y = (i / W) | 0;
        const va = c.a[i]!, ja = st.flags[i]! & 1;
        const vt = va ? c.t[i]! : 0;
        const sh = SHEET[st.type[i]!];
        const jt = ja ? (sh >= 0 ? sh : 9999) : 0;
        if (va !== ja) {
          const k = `A${va}>${ja}`;
          const arr = buckets.get(`A`) ?? []; buckets.set('A', arr);
          arr.push(`(${x},${y}) v${va} j${ja} t${vt}/${jt}`);
        }
        if (vt !== jt) {
          const k = `T${vt}>${jt}`;
          const arr = buckets.get(k) ?? []; buckets.set(k, arr);
          if (arr.length < 40) arr.push(`(${x},${y}) a${va}/${ja} h${c.hf[i]}/${st.half[i]} s${c.sl[i]}/${st.slope[i]}`);
          else if (arr.length === 40) arr.push('...');
        }
        if (c.hf[i]! !== st.half[i]!) {
          const k = `H${c.hf[i]}>${st.half[i]}`;
          const arr = buckets.get(k) ?? []; buckets.set(k, arr);
          if (arr.length < 40) arr.push(`(${x},${y}) a${va}/${ja} t${vt}/${jt} s${c.sl[i]}/${st.slope[i]}`);
          else if (arr.length === 40) arr.push('...');
        }
        if (c.sl[i]! !== st.slope[i]!) {
          const k = `S${c.sl[i]}>${st.slope[i]}`;
          const arr = buckets.get(k) ?? []; buckets.set(k, arr);
          if (arr.length < 40) arr.push(`(${x},${y}) a${va}/${ja} t${vt}/${jt} h${c.hf[i]}/${st.half[i]}`);
          else if (arr.length === 40) arr.push('...');
        }
      }
      for (const [k, arr] of [...buckets.entries()].sort()) {
        lines.push(`## ${k} x${arr.filter((s) => s !== '...').length}${arr.length > 40 ? '+' : ''}`);
        for (const s of arr.slice(0, 41)) lines.push(`   ${s}`);
      }
    },
  });
  writeFileSync(`${OUT}/js-slotdiff.txt`, lines.join('\n') + '\n');
  void g;
});

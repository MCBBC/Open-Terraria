// BBBBBB 批·①：MicroBiomes 段级掷序标绘——rep 基座重放,记录每个 segProbe 事件
// 发生时的掷序号+段参数,用于与 vanilla span 的参数模式段边界对齐定位差异段。
// 用法：SW_B1=1 SW_B1_DIR=/tmp/aaaaaa-22222 SW_B1_SEED=22222 SW_B1_EVIL=1 npx vitest run tools/_bbbb1.test.ts
import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { RNG } from '../src/core/rng';
import { TileStore } from '../src/world/TileStore';
import { generateWorld, __setGenStateForProbe } from '../src/world/gen/WorldGen';
import { restoreGenSolid } from '../src/world/gen/vanilla/GenSolid';
import { runMicroBiomesPass } from '../src/world/gen/vanilla/MicroBiomesPass';
import type { GenState } from '../src/world/gen/vanilla/GenState';

const RUN = process.env.SW_B1 === '1';
const DIR = process.env.SW_B1_DIR ?? '/tmp/aaaaaa-22222';
const W = Number(process.env.SW_B1_W ?? 4200), H = Number(process.env.SW_B1_H ?? 1200);
const SEED = Number(process.env.SW_B1_SEED ?? 22222);
const EVILN = Number(process.env.SW_B1_EVIL ?? 1);
const OUT = process.env.SW_B1_OUT ?? '/tmp/bbbbbb-seg-22222.txt';

(RUN ? it : it.skip)('bbbb1 segment roll map', async () => {
  const st = new TileStore(W, H);
  {
    const ld = (n: string) => new Uint8Array(readFileSync(`${DIR}/${n}`).buffer.slice(0));
    const ld16 = (n: string) => new Uint16Array(readFileSync(`${DIR}/${n}`).buffer.slice(0));
    st.type.set(ld16('type.bin')); st.flags.set(ld('flags.bin')); st.wall.set(ld16('wall.bin'));
    st.liquid.set(ld('liquid.bin')); st.liquidType.set(ld('liquidType.bin'));
    st.half.set(ld('half.bin')); st.slope.set(ld('slope.bin'));
    st.frameX.set(ld16('frameX.bin')); st.frameY.set(ld16('frameY.bin'));
    st.wire.set(ld('wire.bin')); st.paint.set(ld('paint.bin'));
  }
  const gs = JSON.parse(readFileSync(`${DIR}/gs.json`, 'utf8')) as GenState;
  restoreGenSolid(new Map(JSON.parse(readFileSync(`${DIR}/gensolid.json`, 'utf8')) as Array<[number, boolean]>));
  __setGenStateForProbe(gs);
  const chests = JSON.parse(readFileSync(`${DIR}/chests.json`, 'utf8'));
  const lines: string[] = [];
  let roll = 0;
  const rng = new RNG(SEED);
  const rngW = new Proxy(rng, {
    get(t, p) {
      if (p === 'vanilla') {
        // rng.vanilla（UnifiedRandom 直通）——next()/Next() 记 "n"（rig N0 钩对应）
        const inner = (t as unknown as { vanilla: { next(): number } }).vanilla;
        return new Proxy(inner, {
          get(t2, p2) {
            const v2 = Reflect.get(t2, p2, t2);
            if (typeof v2 !== 'function') return v2;
            return (...args2: number[]) => {
              const r2 = (v2 as (...a: number[]) => number).apply(t2, args2);
              if (String(p2) === 'next') { roll++; lines.push(`R${roll} n`); }
              return r2;
            };
          },
        });
      }
      const v = Reflect.get(t, p, t);
      if (typeof v !== 'function') return v;
      return (...args: number[]) => {
        const r = (v as (...a: number[]) => number).apply(t, args);
        const f = String(p);
        if (f === 'nextInt') { roll++; lines.push(`R${roll} a ${args[0]}`); }
        else if (f === 'int') { roll++; lines.push(`R${roll} b ${args[0]} ${args[1]! + 1}`); }
        else if (f === 'next' || f === 'chance' || f === 'range') { roll++; lines.push(`R${roll} d`); }
        else if (f === 'pick') { roll++; lines.push(`R${roll} a ${args[0].length}`); }
        return r;
      };
    },
  }) as RNG;
  const g0 = globalThis as { __swSeg?: (name: string, detail?: unknown) => void };
  g0.__swSeg = (name, detail) => {
    let d = '';
    if (detail !== undefined) {
      try { d = JSON.stringify(detail); } catch { d = '?'; }
      if (d.length > 90) d = d.slice(0, 90) + '…';
    }
    lines.push(`S@R${roll} ${name} ${d}`);
  };
  runMicroBiomesPass(st, rngW, gs, chests);
  delete g0.__swSeg;
  __setGenStateForProbe(null);
  const { writeFileSync } = await import('node:fs');
  writeFileSync(OUT, lines.join('\n') + '\n');
  // 段界摘要（首事件掷号）
  const segFirst = new Map<string, number>();
  const segCount = new Map<string, number>();
  for (const ln of lines) {
    if (!ln.startsWith('S ')) continue;
    const nm = ln.slice(2).split(' ')[0]!;
    if (!segFirst.has(nm)) segFirst.set(nm, roll);
    segCount.set(nm, (segCount.get(nm) ?? 0) + 1);
  }
  console.log(`total rolls=${roll}`);
  for (const [nm, c] of segCount) console.log(`  ${nm}: first@R${segFirst.get(nm)} ×${c}`);
}, 600_000);
void generateWorld; void RUN;

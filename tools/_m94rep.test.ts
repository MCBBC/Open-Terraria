// AAAAAA：m 链 pass94（LongMoss）JS 重放 span（SW_M94=1）——对拍 vanilla。
import { it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { TILE_DEFS } from '../src/data/tiles';
import { RNG } from '../src/core/rng';
import { TileStore } from '../src/world/TileStore';
import { __setGenStateForProbe } from '../src/world/gen/WorldGen';
import { restoreGenSolid } from '../src/world/gen/vanilla/GenSolid';
import { runLongMossPass } from '../src/world/gen/vanilla/SurfaceDecorPasses';
import type { GenState } from '../src/world/gen/vanilla/GenState';

const RUN = process.env.SW_M94 === '1';
const W = 6400, H = 1800;
const SEED = 20260811;
const G2 = '/tmp/sw-slp/g-m20260811';
const DIR = '/tmp/yyyyy-m20260811';

(RUN ? it : it.skip)('m94 longmoss span', async () => {
  const st = new TileStore(W, H);
  {
    const ld16 = (n: string) => new Uint16Array(readFileSync(`${DIR}/s31/${n}`).buffer.slice(0));
    const ld8 = (n: string) => new Uint8Array(readFileSync(`${DIR}/s31/${n}`).buffer.slice(0));
    // 金标 93 末 8 通道 + JS s31 边界帧
    const b16 = (e: string) => new Uint16Array(readFileSync(`${G2}/093_Random_Gems.${e}`).buffer.slice(0));
    const b8 = (e: string) => new Uint8Array(readFileSync(`${G2}/093_Random_Gems.${e}`).buffer.slice(0));
    const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
    for (let i = 0; i < TILE_DEFS.length; i++) { const s = TILE_DEFS[i]?.vanilla?.sheet; if (typeof s === 'number') SHEET[i] = s; }
    const REV = new Map<number, number>();
    for (let i = 0; i < TILE_DEFS.length; i++) { const s = TILE_DEFS[i]?.vanilla?.sheet; if (typeof s === 'number' && !REV.has(s)) REV.set(s, i); }
    const t = b16('typ'), a = b8('act'), wch = b16('wal'), lch = b8('liq'), ltch = b8('lty'),
      hch = b8('half'), sch = b8('slope'), iach = b8('inact');
    for (let i = 0; i < W * H; i++) {
      st.flags[i] = a[i]!;
      st.type[i] = a[i]! || t[i]! ? (REV.get(t[i]!) ?? 0) : 0;
      st.wall[i] = wch[i]!;
      st.liquid[i] = lch[i]!;
      st.liquidType[i] = lch[i]! ? ltch[i]! + 1 : 0;
      st.half[i] = hch[i]!;
      st.slope[i] = sch[i]!;
      st.wire[i] = iach[i]! ? 0x20 : 0;
    }
    st.frameX.set(ld16('frameX.bin')); st.frameY.set(ld16('frameY.bin'));
    st.wire.set(ld8('wire.bin')); st.paint.set(ld8('paint.bin'));
  }
  const gs = JSON.parse(readFileSync(`${DIR}/s31/gs.json`, 'utf8')) as GenState;
  restoreGenSolid(new Map(JSON.parse(readFileSync(`${DIR}/s31/gensolid.json`, 'utf8')) as Array<[number, boolean]>));
  __setGenStateForProbe(gs);
  const lines: string[] = [];
  const rng = new RNG(SEED);
  const rngW = new Proxy(rng, {
    get(t, p) {
      const v = Reflect.get(t, p, t);
      if (typeof v !== 'function') return v;
      return (...args: number[]) => {
        const r = (v as (...a: number[]) => number).apply(t, args);
        const f = String(p);
        if (f === 'nextInt') lines.push(`a ${args[0]}`);
        else if (f === 'int') lines.push(`b ${args[0]} ${args[1]! + 1}`);
        return r;
      };
    },
  }) as RNG;
  // AAAAAA 计数器：placeMossSprout 调用数（经 __swLmCap 钩子）
  let lmCalls = 0;
  (globalThis as { __swLmCap?: (x: number, y: number) => void }).__swLmCap = () => { lmCalls++; };
  runLongMossPass(st, rngW, gs);
  (globalThis as { __swLmCap?: () => void }).__swLmCap = undefined;
  console.log(`[lm] calls=${lmCalls} rolls=${lines.length}`);
  __setGenStateForProbe(null);
  writeFileSync('/tmp/aaaaaa-span-m94-js.txt', lines.join('\n') + '\n');
  console.log(`js rolls = ${lines.length}`);
}, 900_000);

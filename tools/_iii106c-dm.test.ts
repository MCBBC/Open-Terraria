// IIII106c：DeadMans 候选 (679,708) 门级重评 II（vanilla en=1 vs JS en=0 定罪）
import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { TILE_DEFS } from '../src/data/tiles';
import { TileStore } from '../src/world/TileStore';
import type { GenState } from '../src/world/gen/vanilla/GenState';
import { DeadMansChestBiome } from '../src/world/gen/vanilla/MicroBiomesPass';
import { NOT_CLEARABLE } from '../src/world/gen/vanilla/TileRunner';

const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) { const s = TILE_DEFS[i]?.vanilla?.sheet; if (typeof s === 'number') SHEET[i] = s; }
const CHANS = ['flags', 'type', 'frameX', 'frameY', 'wall', 'liquid', 'liquidType', 'half', 'slope', 'wire', 'paint', 'paintWall', 'coat'] as const;

function hydrate(): { st: TileStore; gs: GenState; chests: unknown[] } {
  const OUT = '/tmp/iii106c-out';
  const hdr = JSON.parse(readFileSync(`${OUT}/cap97/base_hdr.json`, 'utf8'));
  const st = new TileStore(hdr.w as number, hdr.h as number);
  const rec = st as unknown as Record<string, Uint8Array | Uint16Array>;
  for (const c of CHANS) {
    const len = hdr[`${c}_len`] as number;
    const buf = readFileSync(`${OUT}/cap97/base_${c}.bin`);
    const bytesPer = c === 'type' || c === 'frameX' || c === 'frameY' || c === 'wall' ? 2 : 1;
    rec[c]!.set(new (bytesPer === 2 ? Uint16Array : Uint8Array)(buf.buffer, buf.byteOffset, len));
  }
  const gs = JSON.parse(readFileSync(`${OUT}/cap97/base_gs.json`, 'utf8')) as unknown as GenState;
  const chests = JSON.parse(readFileSync(`${OUT}/cap97/base_chests.json`, 'utf8')) as unknown[];
  return { st, gs, chests };
}

it('i106c deadmans gate re-eval at (679,708)', () => {
  const { st, gs, chests } = hydrate();
  const bio = new DeadMansChestBiome(st, undefined as never, gs, chests as never);
  const B = bio as unknown as Record<string, (...a: never[]) => unknown>;
  const anyBio = bio as unknown as Record<string, unknown>;

  // ① dart：逐 (y,dir) 重放，命中时打印锚点 tile 明细
  for (let y = 709; y >= 704; y--) {
    for (const d of [1, -1] as const) {
      (anyBio['darts'] as unknown[]).length = 0;
      const r = B['findDartTrapSpotSingle'].call(anyBio, 679, y, d);
      if (r) {
        const darts = anyBio['darts'] as Array<{ trapX: number; trapY: number; xPush: number }>;
        const last = darts[darts.length - 1]!;
        const ti = st.idx(last.trapX, last.trapY);
        console.log(`dart HIT y=${y} dir=${d}: trap=(${last.trapX},${last.trapY}) push=${last.xPush} sheet=${SHEET[st.type[ti]!]} framed=${!!TILE_DEFS[st.type[ti]!]?.framed} NOT_CLEARABLE=${(NOT_CLEARABLE as Set<number>).has(st.type[ti]!) ? 'NC' : 'ok'}`);
      }
    }
  }
  // ② y=708 dir=-1 扫描明细：i=0..20 各格 act/type/framed/NC
  console.log('--- scan y=708 dir=-1 ---');
  for (let i = 0; i < 20; i++) {
    const x = 679 - i;
    const idx = st.idx(x, 708);
    const a = (st.flags[idx]! & 1) !== 0;
    const t = st.type[idx]!;
    console.log(`i=${i} (${x},708) act=${a} sheet=${SHEET[t]} solid=${String(!!TILE_DEFS[t] && (TILE_DEFS[t] as { solid?: boolean }).solid)} framed=${!!TILE_DEFS[t]?.framed} NC=${(NOT_CLEARABLE as Set<number>).has(t)} JSid=${t}`);
  }
  // ③ boulder：x∈[677..681],y=703 向上找首个 active，打印 CheckSpot 各门
  for (let x = 675; x <= 683; x++) {
    let fy = -1;
    for (let i = 0; i < 50; i++) { if (st.flags[st.idx(x, 703 - i)]! & 1) { fy = 703 - i; break; } }
    console.log(`boulder x=${x}: firstActive=${fy}${fy >= 0 ? ` sheet=${SHEET[st.type[st.idx(x, fy)]!]}` : ''}`);
  }
});

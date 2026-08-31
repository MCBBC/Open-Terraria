// IIII99d 批帧对拍仪：DungeonPass 家族（sheet 100 烛台/101 书架/79 床/90 浴缸/
// 34 吊灯/104 时钟/105 雕像/93 灯）终态 frameX/frameY 与 x86 dump 帧通道逐格对拍。
//   A) toadstool 链：x86 双锚 -004_PostFinSeed.frx/.fry（载帧双锚，4200×1200）
//   B) m 链：gen2-m/105_Final_Cleanup.frx/.fry（gen2 载帧链，6400×1800）
// ★SW_MB_1457 必须在 generateWorld 之前置位（1457 门控 HellFort 布局——晚置会
//   生成本库旧形地牢 ⇒ 与 dump 同位格全错开=零匹配假差）。
process.env.SW_MB_1457 = '1';
import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../src/data/tiles';

const HOME = process.env.HOME ?? '';
const le16 = (p: string): Uint16Array => {
  const b = readFileSync(p);
  return new Uint16Array(b.buffer, b.byteOffset, Math.floor(b.length / 2));
};
const FAMS: Record<string, number[]> = {
  candelabra100: [100], bookcase101: [101], bed79_tub90: [79, 90], chandelier34: [34],
  clock104_statue105: [104, 105], lamp93: [93],
};

interface ChainCfg { seed: string; evil: 0 | 1; w: number; h: number; typ: string; frx: string; fry: string }
const CHAINS: Record<string, ChainCfg> = {
  toad: { seed: '771002', evil: 0, w: 4200, h: 1200,
    typ: `${HOME}/GoldenChains/golden-toadstool/-004_PostFinSeed.typ`,
    frx: `${HOME}/GoldenChains/golden-toadstool/-004_PostFinSeed.frx`,
    fry: `${HOME}/GoldenChains/golden-toadstool/-004_PostFinSeed.fry` },
  m:    { seed: '20260811', evil: 0, w: 6400, h: 1800,
    typ: `${HOME}/GoldenChains/gen2-m/105_Final_Cleanup.typ`,
    frx: `${HOME}/GoldenChains/gen2-m/105_Final_Cleanup.frx`,
    fry: `${HOME}/GoldenChains/gen2-m/105_Final_Cleanup.fry` },
};

async function runChain(tag: string, c: ChainCfg): Promise<void> {
  const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
  for (let i = 0; i < TILE_DEFS.length; i++) {
    const s = TILE_DEFS[i]?.vanilla?.sheet;
    if (typeof s === 'number') SHEET[i] = s;
  }
  const world = await generateWorld({ width: c.w, height: c.h, seedText: c.seed, evil: c.evil });
  const st = world.store;
  const N = c.w * c.h;
  const xTyp = le16(c.typ), xFrx = le16(c.frx), xFry = le16(c.fry);
  if (xTyp.length < N || xFrx.length < N) throw new Error(`${tag}: dump 尺寸不足 typ=${xTyp.length} frx=${xFrx.length} N=${N}`);
  let grandChecked = 0, grandBad = 0;
  for (const famKey of Object.keys(FAMS)) {
    const want = new Set(FAMS[famKey]);
    let checked = 0, typeSide = 0, frameBad = 0;
    const samples: string[] = [];
    for (let i = 0; i < N; i++) {
      const sj = SHEET[st.type[i]];
      const sx = xTyp[i];
      const jIn = want.has(sj), xIn = want.has(sx);
      if (jIn !== xIn) { typeSide++; continue; }        // 一侧在族一侧不在=型面差(不比帧)
      if (!jIn) continue;
      if (sx !== sj) continue;                           // 两端各属同族不同成员（如 79↔90）→ 型面差计
      checked++;
      if (!(st.frameX[i] === xFrx[i] && st.frameY[i] === xFry[i])) {
        frameBad++;
        if (samples.length < 4) samples.push(`@(${Math.floor(i % c.w)},${Math.floor(i / c.w)}) fx=${st.frameX[i]} vs ${xFrx[i]} fy=${st.frameY[i]} vs ${xFry[i]}`);
      }
    }
    console.log(`[${tag}] ${famKey}: sameTypeChecked=${checked} typeSideDiff=${typeSide} frameBad=${frameBad}${samples.length ? '\n    样例 ' + samples.join('\n    样例 ') : ''}`);
    grandChecked += checked; grandBad += frameBad;
  }
  console.log(`[${tag}] summary framesSame=${grandChecked - grandBad}/${grandChecked}`);
}

it('frame parity dungeon furniture vs x86 (toad dual anchor)', async () => {
  await runChain('toad', CHAINS.toad);
}, 600_000);

it('frame parity dungeon furniture vs x86 (m final cleanup)', async () => {
  await runChain('m', CHAINS.m);
}, 900_000);

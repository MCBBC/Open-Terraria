// IIII99d 批帧对拍仪：DungeonPass 家族（sheet 100 烛台/101 书架/79 床/90 浴缸/
// 34 吊灯/104 时钟/105 雕像/93 灯）终态 frameX/frameY 与 x86 dump 帧通道逐格对拍。
//   A) toadstool 链：x86 双锚 -004_PostFinSeed.frx/.fry（带帧八通道+2）
//   B) m 链：gen2-m/105_Final_Cleanup.frx/.fry（gen2 载帧链）
// 读数=match/mismatch 计数 + 首 8 个不匹配样点（无样点时打 match 证词）。
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
const N = 4200 * 1200;

async function runChain(tag: string, typPath: string, frxPath: string, fryPath: string): Promise<void> {
  const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
  for (let i = 0; i < TILE_DEFS.length; i++) {
    const s = TILE_DEFS[i]?.vanilla?.sheet;
    if (typeof s === 'number') SHEET[i] = s;
  }
  const world = await generateWorld({ width: 4200, height: 1200, seedText: tag === 'toad' ? '771002' : '20260811', evil: tag === 'toad' ? 0 : 0 });
  process.env.SW_MB_1457 = '1';
  // evil for m-chain(g2m)=0（spot 表）——toadstool evil=0
  void EVIL_UNUSED;
  const st = world.store;
  const xTyp = le16(typPath), xFrx = le16(frxPath), xFry = le16(fryPath);
  const total = { jsCells: 0, xCells: 0, bothSameTypeFrameEq: 0, typeMismatch: 0, frameMismatch: 0 };
  const samples: string[] = [];
  for (const famKey of Object.keys(FAMS)) {
    let famFramesBad = 0, famChecked = 0;
    const famSamples: string[] = [];
    const want = new Set(FAMS[famKey]);
    for (let i = 0; i < N; i++) {
      const sj = SHEET[st.type[i]];
      const sx = xTyp[i];
      const jIn = want.has(sj);
      const xIn = want.has(sx);
      if (jIn && !xIn) { total.typeMismatch++; famFramesBad++; continue; }
      if (!jIn && xIn) { total.typeMismatch++; famFramesBad++; continue; }
      if (!jIn || sx !== sj) continue;   // 两端同型才比帧
      famChecked++;
      const ejf = st.frameX[i] === xFrx[i] && st.frameY[i] === xFry[i];
      if (!ejf) {
        famFramesBad++;
        if (famSamples.length < 4) {
          const xy = `@(${Math.floor(i % 4200)},${Math.floor(i / 4200)})`;
          famSamples.push(`${xy} fx=${st.frameX[i]} vs ${xFrx[i]} fy=${st.frameY[i]} vs ${xFry[i]}`);
        }
      }
    }
    console.log(`[${tag}] ${famKey}: cells_checked=${famChecked} frame_or_type_bad=${famFramesBad}${famSamples.length ? ' 样例:' + famSamples.join(' | ') : ''}`);
    total.bothSameTypeFrameEq += famChecked - famFramesBad;
  }
  console.log(`[${tag}] summary sameTypeAndFrame=${total.bothSameTypeFrameEq} typeSideMismatchCells=${total.typeMismatch}`);
}
const EVIL_UNUSED = undefined;

it('frame parity dungeon furniture vs x86', async () => {
  await runChain('toad', `${HOME}/GoldenChains/golden-toadstool/-004_PostFinSeed.typ`,
    `${HOME}/GoldenChains/golden-toadstool/-004_PostFinSeed.frx`, `${HOME}/GoldenChains/golden-toadstool/-004_PostFinSeed.fry`);
}, 500_000);

it('frame parity m-chain final cleanup', async () => {
  await runChain('m', `${HOME}/GoldenChains/gen2-m/105_Final_Cleanup.typ`,
    `${HOME}/GoldenChains/gen2-m/105_Final_Cleanup.frx`, `${HOME}/GoldenChains/gen2-m/105_Final_Cleanup.fry`);
}, 500_000);

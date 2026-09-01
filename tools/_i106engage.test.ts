// IIII106：秘种子「接线证据仪」——同底种 flagged vs unflagged 双跑，逐槽位 8 通道
// diff 普查（ Engagement 证据：旗标闭=零扰动、开=在预期 pass 窗产生内容差）。
// 非认证仪（认证=tools/_iii81m8 对 x86 G2）；本仪仅判「旗是否真的驱动了生成面」。
// 用法：SW_MB_1457=1 SW_I106_ENG=<旗标文本如 purifythis> npx vitest run tools/_i106engage.test.ts
import { it } from 'vitest';
import { generateWorld } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../src/data/tiles';

const TEXT = process.env.SW_I106_ENG ?? '';
const RUN = !!TEXT;
const SEED = process.env.SW_I106_SEED ?? '106105';

const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}
// 抽样槽位（0..58 JS 槽号 → 名）：早段/树/岛/终段
const SLOTS: Record<number, string> = {
  0: '原版地形', 3: '生物群系', 13: '半砖平滑', 22: '快清理', 24: '浮空岛屋',
  41: '地表植物', 53: '瓦片清理', 58: '终清理',
};

(RUN ? it : it.skip)('IIIII106 engagement diff', async () => {
  // ★快照语义勘误：onWorldPartial 回调的是【同一 TileStore 引用】——存引用=只拍终态。
  //   本仪按「终态普查」设计：两模式各跑一遍生成后直接比对 store 终值。
  const finals: Record<string, Record<string, Uint8Array | Uint16Array>> = {};
  for (const mode of ['plain', 'flag'] as const) {
    const w = await generateWorld({
      width: 4200, height: 1200,
      // ★控制臂必须同 seed 文本（世界种子=CRC32(整串)）——旗关位走 seedFlags={} 直注
      seedText: `${TEXT}|${SEED}`,
      evil: 0,
      ...(mode === 'flag' ? {} : { seedFlags: {} }),
    });
    finals[mode] = w.store as unknown as Record<string, Uint8Array | Uint16Array>;
  }
  const CH = ['flags', 'type', 'wall', 'liquid', 'liquidType', 'half', 'slope', 'wire',
    'paint', 'paintWall', 'coat'] as const;
  console.log(`\n── IIII106 engagement ${TEXT} (seed=${SEED})·终态 ──`);
  let total = 0;
  const parts: string[] = [];
  for (const c of CH) {
    const va = finals.plain[c] as Uint8Array, vb = finals.flag[c] as Uint8Array;
    if (!va || !vb) continue;
    let d = 0;
    for (let i = 0; i < va.length; i++) if (va[i] !== vb[i]) d++;
    total += d;
    if (d) parts.push(`${c}:${d}`);
  }
  console.log(`diff census: ${total === 0 ? 'SAME（旗标未驱动任何生成面写！）' : parts.join(' ')}`);
}, 900_000);

// 一次性探针（诊断脚本,不入 CI 常跑集合）：真实生成世界上的幽灵保域渲染验证
//  ① 幽灵计数 >0（finalize 净化移除后,x86 对齐残型仍在 = 幽灵保域未回退）
//  ② 小地图全量(fillBand) 与增量(colorFor) 两套独立实现逐格一致——
//     若 fillBand 仍按 type 直画,两实现恰在幽灵格分叉（修复前必然爆红）
//  ③ 化石层直接观测：无液无墙的幽灵格像素 ≠ 其残型的 tile 地图色
//    （雪楔/沙漠蛋/矿石散点不得在小地图显形）
// 运行:npx vitest run tests/_ghost-map-probe.test.ts
import { describe, it, expect } from 'vitest';
import { generateWorld } from '../src/world/gen/WorldGen';
import { World } from '../src/world/World';
import { Minimap } from '../src/render/Renderer';
import { TILE_DEFS } from '../src/data/tiles';
import { vanillaTileMapColor } from '../src/data/vanillaMapColors';

const abgr = (hex: string): number => {
  const v = parseInt(hex.slice(1), 16);
  return (0xff000000 | ((v & 255) << 16) | (v & 0xff00) | ((v >> 16) & 255)) >>> 0; // p32 是 Uint32
};
const abgrRgb = (c: readonly [number, number, number] | number[]): number =>
  (0xff000000 | ((c[2] & 255) << 16) | ((c[1] & 255) << 8) | (c[0] & 255)) >>> 0;

/** 残型 type 的 tile 地图色（fillBand tiles LUT 的等价构造,MapHelper tile 支） */
function tileLutColor(t: number): number {
  const d = TILE_DEFS[t];
  const sheet = d?.vanilla?.sheet;
  if (sheet !== undefined) {
    const vc = vanillaTileMapColor(sheet);
    if (vc) return abgrRgb(vc);
  }
  const mc = d?.mapColor;
  return mc ? abgr(mc) : abgr('#808080');
}

describe('幽灵保域 × 小地图（真实生成世界）', () => {
  it('幽灵计数>0 且 fillBand==colorFor 逐格一致、幽灵残型不显形', { timeout: 600_000 }, async () => {
    const world: World = await generateWorld({ width: 4200, height: 1200, seedText: '12345', evil: 0 });
    const st = world.store;
    let ghosts = 0;
    const ghostCells: Array<[number, number]> = [];   // 幽灵且无液无墙（tile 支若误画必显形）
    const activeCells: Array<[number, number]> = [];
    for (let y = 0; y < st.h; y += 3) {               // 1/3 抽样控时
      for (let x = 0; x < st.w; x += 3) {
        const i = st.idx(x, y);
        if (st.flags[i] === 0 && st.type[i] !== 0) {
          ghosts++;
          if (st.liquid[i] <= 32 && st.wall[i] === 0 && ghostCells.length < 40000) ghostCells.push([x, y]);
        } else if (st.flags[i] !== 0 && activeCells.length < 40000) {
          activeCells.push([x, y]);
        }
      }
    }
    console.log(`[probe] ghost cells(1/3 sample) = ${ghosts}, bare-ghost sampled = ${ghostCells.length}, active sampled = ${activeCells.length}`);
    expect(ghosts).toBeGreaterThan(0);                // 幽灵保域未回退（pre-dump 语义）

    const mm = new Minimap(world);                    // 全量 fillBand
    const p = mm.p32!;
    let diffGhost = 0, diffActive = 0, ghostAsTile = 0;
    for (const [x, y] of ghostCells) {
      const i = st.idx(x, y);
      if (p[i] !== abgr(mm.colorFor(x, y)!)) diffGhost++;
      if (p[i] === tileLutColor(st.type[i])) ghostAsTile++;   // 残型 tile 色显形 = 化石层
    }
    for (const [x, y] of activeCells) {
      const i = st.idx(x, y);
      if (p[i] !== abgr(mm.colorFor(x, y)!)) diffActive++;
    }
    console.log(`[probe] fillBand vs colorFor: ghost-diff=${diffGhost}, active-diff=${diffActive}, ghost-drawn-as-tile=${ghostAsTile}`);
    expect(diffGhost).toBe(0);
    expect(diffActive).toBe(0);
    expect(ghostAsTile).toBe(0);
  });
});

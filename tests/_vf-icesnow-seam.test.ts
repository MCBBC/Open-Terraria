// 冰雪互斥接缝对回归闸门(2026-08-31 用户实报「冰块×雪块跨类漏缝」第四批):
//  ① isVanillaSeamPair 判定表 = 官方排除表(DontMergeWithSnow/Snow/IcesSnow)双向对称;
//  ② 统一视图闭合:冰芯雪基 / 雪芯冰基 的统一帧 === 同型纯基内帧(接缝闭合的代数定义);
//  ③ 严格链(原版语义)保持互斥边帧——统一视图是用户定案偏离域,不得污染严格链。
// 锚点:WorldGen.cs:82796-82809(排除表派发)/TileID.cs:193/291/297。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { TileStore } from '../src/world/TileStore';
import {
  vanillaFrameFor, vanillaFrameUnified, setVanillaSolidTables,
  isVanillaSeamPair, isVanillaMergeDirtFamily,
} from '../src/render/VanillaFraming';
import { TILE_DEFS } from '../src/data/tiles';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
// 避免与 golden 测试文件互相依赖 node:url 差异,直接 import
import { fileURLToPath } from 'node:url';

// vanilla solid/solidTop(与 golden 同源提取,主路径 ensure 一次)
let _solidInit = false;
function ensureSolidTables(): void {
  if (_solidInit) return;
  _solidInit = true;
  const main = readFileSync(`${ROOT}/Terarria1457/Terraria/Main.cs`, 'utf8');
  const solid = new Array(800).fill(false);
  const solidTop = new Array(800).fill(false);
  for (const mm of main.matchAll(/tileSolid\[(\d+)\] = true/g)) solid[+mm[1]] = true;
  for (const mm of main.matchAll(/tileSolidTop\[(\d+)\] = true/g)) solidTop[+mm[1]] = true;
  setVanillaSolidTables(solid, solidTop);
}

// 内部 id 反查(vanilla sheet → TILE_DEFS 下标;本测试全链用内部 id 域,与运行时一致)
function internalOf(sheet: number): number {
  const i = TILE_DEFS.findIndex((d) => d?.vanilla?.sheet === sheet);
  if (i < 0) throw new Error(`TILE_DEFS 缺 vanilla sheet ${sheet}`);
  return i;
}
const SNOW = internalOf(147);
const ICE = internalOf(161);
const STONE = internalOf(1);
const DIRT = internalOf(0);

// 5×5 基座 baseType + 中心 probeType;返回中心帧(fn = 严格链 / 统一视图)
function centerFrame(probe: number, base: number, unified: boolean): { fx: number; fy: number } {
  ensureSolidTables();
  const st = new TileStore(32, 32);
  for (let y = 10; y <= 14; y++) for (let x = 10; x <= 14; x++) {
    const i = st.idx(x, y);
    st.type[i] = base; st.flags[i] = 1;
  }
  st.type[st.idx(12, 12)] = probe;
  return unified
    ? vanillaFrameUnified(st, 12, 12, 0, 200)
    : vanillaFrameFor(st, 12, 12, st, 0, 200);
}

describe('冰雪互斥接缝对(vanilla 排除表 → 统一视图闭合)', () => {
  it('判定表:官方排除对双向成立,非排除对一律 false', () => {
    expect(isVanillaSeamPair(147, 161)).toBe(true);   // 雪↔冰
    expect(isVanillaSeamPair(161, 147)).toBe(true);   // 冰↔雪(对称)
    expect(isVanillaSeamPair(147, 200)).toBe(true);   // 雪↔血冰
    expect(isVanillaSeamPair(147, 224)).toBe(true);   // 雪↔雪泥(DontMergeWithSnow)
    expect(isVanillaSeamPair(162, 147)).toBe(true);   // 薄冰↔雪(IcesSnow)
    expect(isVanillaSeamPair(162, 161)).toBe(true);   // 薄冰↔冰
    expect(isVanillaSeamPair(161, 162)).toBe(true);   // 薄冰侧单向缝(冰侧官方已并,视图重写对其为无操作)
    expect(isVanillaSeamPair(147, 1)).toBe(false);    // 雪↔石(跨超级家族,官方互斥表不涉)
    expect(isVanillaSeamPair(161, 1)).toBe(false);    // 冰↔石(官方已并)
    expect(isVanillaSeamPair(147, 148)).toBe(false);  // 雪↔雪砖(官方已并)
    expect(isVanillaSeamPair(59, 60)).toBe(false);    // 泥↔丛林草(草族 Frametest 域,不归本批)
  });

  it('统一视图闭合:冰芯雪基 === 冰芯纯冰基(全连内帧)', () => {
    const u = centerFrame(ICE, SNOW, true);
    const pure = centerFrame(ICE, ICE, false);
    expect(u).toEqual(pure);
  });

  it('统一视图闭合:雪芯冰基 === 雪芯纯雪基(对称侧)', () => {
    const u = centerFrame(SNOW, ICE, true);
    const pure = centerFrame(SNOW, SNOW, false);
    expect(u).toEqual(pure);
  });

  it('严格链保持官方互斥:冰芯雪基为边帧 ≠ 统一视图帧', () => {
    const strict = centerFrame(ICE, SNOW, false);
    const u = centerFrame(ICE, SNOW, true);
    expect(strict).not.toEqual(u);
  });

  it('非互斥对不进统一视图:石芯土基仍走原 MERGE_DIRT 批语义(不回归)', () => {
    // 石(1)∈MERGE_DIRT 族、土(0)∈族 → 归第三批跨族门,不是冰雪对
    expect(isVanillaSeamPair(STONE, DIRT)).toBe(false);
    expect(isVanillaMergeDirtFamily(1)).toBe(true);
    expect(isVanillaMergeDirtFamily(0)).toBe(true);
  });
});

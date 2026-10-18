// FTW 巨石雨清除盒行为锁定（2026-09-03 清偿批④）。
// 原版 SpawnFallingObjects 风暴臂（Terarria1457 WorldGen.cs:72230-72240）：
//   position = (Next(maxTilesX-50)+100, Next(maxTilesY*0.05)) —— 该坐标【原样】传给
//   NewProjectile（出生位=弹盒左上），清除门 = !Collision.SolidCollision(position,32,32)。
// Collision.cs:2713-2746（2 参版）：首参 Position 是盒【左上】——盒 = [x, x+32)×[y, y+32)。
// 旧仓手写 [bx-16, bx+16) 中心化盒 = 差一格象限（左/上多查一格、右/下漏查一格）。
// 本测锁：①solidCollisionBox 的左上锚语义（与 Collision.cs 逐格对拍）；②Game.ts
// 巨石臂源级接线（用冰雹臂同款精确盒,不再手写中心化盒）。
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
// ★C档可移植:仓库外依赖(game/ 兄弟目录,clone 侧缺=正常形态)——缺则本文件 skip,本机在=真跑零语义变化
const EXT_MISSING = !['Terarria1457'].every((d) => existsSync(new URL(`../../${d}`, import.meta.url)));

import { resolve } from 'node:path';
import { solidCollisionBox } from '../src/render/WeatherRenderer';
import { TileStore } from '../src/world/TileStore';
import { TILE_INTERNAL_BY_SHEET } from '../src/data/tiles';
import { TILE } from '../src/core/constants';

const STONE = TILE_INTERNAL_BY_SHEET.get(1)!;      // 原版 sheet 1 石块
const PLATFORM = TILE_INTERNAL_BY_SHEET.get(19)!;  // 原版 sheet 19 平台（tileSolidTop）

describe.skipIf(EXT_MISSING)('Collision.SolidCollision 左上锚语义（Collision.cs:2713-2746）', () => {
  const bx = 100 * TILE, by = 40 * TILE;   // 盒=[1600,1640)×[640,672) → 格列 100-101、行 40-41

  it('空世界 → 无实心（clear）', () => {
    expect(solidCollisionBox(new TileStore(200, 120), bx, by, 32, 32)).toBe(false);
  });

  it('盒内格（100,40）实心 → blocked', () => {
    const st = new TileStore(200, 120);
    st.setTileSilent(100, 40, STONE);
    expect(solidCollisionBox(st, bx, by, 32, 32)).toBe(true);
  });

  it('盒左外沿一格（99,40）= [bx-16,bx) 列 → 不 blocked（旧中心化盒在此误判）', () => {
    const st = new TileStore(200, 120);
    st.setTileSilent(99, 40, STONE);
    expect(solidCollisionBox(st, bx, by, 32, 32)).toBe(false);
  });

  it('盒右外沿格（102,41）= [bx+32,…) → 不 blocked', () => {
    const st = new TileStore(200, 120);
    st.setTileSilent(102, 41, STONE);
    expect(solidCollisionBox(st, bx, by, 32, 32)).toBe(false);
  });

  it('平台（tileSolidTop）不算实心（:2739 !tileSolidTop 支）', () => {
    const st = new TileStore(200, 120);
    st.setTileSilent(101, 40, PLATFORM);
    expect(solidCollisionBox(st, bx, by, 32, 32)).toBe(false);
  });

  it('半砖按 [y+8,y+16) 计（:2735-2738 halfBrick 支）——盒内重叠 → blocked', () => {
    const st = new TileStore(200, 120);
    st.setTileSilent(100, 41, STONE);
    st.setHalfBrick(100, 41, true);
    expect(solidCollisionBox(st, bx, by, 32, 32)).toBe(true);
  });

  it('已致动格不算实心（:2719 !inActive 支）', () => {
    const st = new TileStore(200, 120);
    st.setTileSilent(100, 40, STONE);
    st.wire[st.idx(100, 40)] |= TileStore.WIRE_ACTUATED;
    expect(solidCollisionBox(st, bx, by, 32, 32)).toBe(false);
  });
});

describe.skipIf(EXT_MISSING)('Game.ts 巨石臂源级接线（清偿批④）', () => {
  const gamePath = resolve(process.cwd(), 'src/core/Game.ts');

  it('巨石臂清除盒 = 冰雹臂同款精确盒 solidCollisionBox(bst, bx, by, 32, 32)', () => {
    if (!existsSync(gamePath)) throw new Error(`源缺失: ${gamePath}`);
    const src = readFileSync(gamePath, 'utf8');
    expect(src).toContain('solidCollisionBox(bst, bx, by, 32, 32)');
    expect(src).toContain('solidCollisionBox(bst, hx, hy, 32, 32)');   // 冰雹臂同源
    // 旧手写中心化盒必须退役（[bx-16,bx+16) 象限差一格）
    expect(src.includes('(bx - 16)')).toBe(false);
    expect(src.includes('(by - 16)')).toBe(false);
  });

  it('vanilla 锚读法对证：Collision.cs SolidCollision 以 Position 为左上（Position.X+Width 右沿）', () => {
    const p = resolve(process.cwd(), '../Terarria1457/Terraria/Collision.cs');
    if (!existsSync(p)) throw new Error(`标杆缺失: ${p}`);
    const src = readFileSync(p, 'utf8');
    const start = src.indexOf('public static bool SolidCollision(Vector2 Position, int Width, int Height)');
    const body = src.slice(start, src.indexOf('public static bool SolidCollision(Vector2 Position, int Width, int Height, bool acceptTopSurfaces)'));
    // 左上锚证据：右/下沿 = Position.X+Width / Position.Y+Height（首参=左上,非中心）
    expect(body).toContain('(Position.X + (float)Width) / 16f');
    expect(body).toContain('Position.X + (float)Width > vector.X');
    expect(body).toContain('Position.Y + (float)Height > vector.Y');
  });
});

describe.skipIf(EXT_MISSING)('巨石成就 34 边沿=条件旗（WorldGen.cs:72224-72240 两旗分离,R4-F6）', () => {
  const gamePath = resolve(process.cwd(), 'src/core/Game.ts');

  it('_isRainingBoulders 记账【条件旗】num；窗口旗独立门生成；关闭沿判据 !num && 旗', () => {
    if (!existsSync(gamePath)) throw new Error(`源缺失: ${gamePath}`);
    const src = readFileSync(gamePath, 'utf8');
    // 条件旗 num = drunk+getGood+!remix+IsItStorming（:72224）
    const condAt = src.indexOf('const cond = !!(sf?.drunkWorld && sf?.getGoodWorld && !sf?.remix && w.weather.storming)');
    expect(condAt).toBeGreaterThan(-1);
    const seg = src.slice(condAt, condAt + 1800);
    expect(seg).toContain('let spawnWindow = cond');                    // 窗口旗 flag=num 初值,:72225-33 只清 flag
    expect(seg).toContain('if (!cond && this._isRainingBoulders)');     // :72235-72238 关闭沿判据
    expect(seg).toContain('this._isRainingBoulders = cond;');           // :72239 记条件旗
    // 旧形态（窗口旗记账 = 风暴中窗口关闭沿误发成就 34）必须退役
    expect(seg).not.toContain('this._isRainingBoulders = raining');
  });
});

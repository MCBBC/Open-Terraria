// BJ204（2026-09-20）WALL_HOUSE 三副本单源化结构守卫。
// 债源：红蓝-N1 审 BJ181 揭出 WALL_HOUSE 在 SurfaceDecorPasses/Housing/VanillaSpawner
// 三处漂移副本（BJ204 定谳：三副本 279 面逐值互等、与 Main.cs:9880-10716（265 直赋
// + :10506 循环 153-166）全等 = 纯同值副本非漂移，单源化零行为差）。
// 落刀：表体单源 = world/Housing.ts；SurfaceDecorPasses（凹龛墙门）/VanillaSpawner
// （房内不刷怪/noWorms）/CaveWallsPass（封闭空间墙重试）/WorldGen（引擎注册钩）/
// WorldEvolution（房墙锚门）全部改指 Housing。
// 本文件守"结构不再漂移"：①五消费文件零本地表体 ②全部 import 自 Housing
// ③SurfaceDecorPasses 不再转出（消灭再中转漂移面）④单源表体权威面抽查。
// 数值全集对拍归 tests/housing-nearplayer-chain.test.ts (vi)（vanilla 279 面双向零差集）。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { WALL_HOUSE } from '../src/world/Housing';

const HERE = dirname(fileURLToPath(import.meta.url));
const src = (p: string) => readFileSync(join(HERE, '..', 'src', p), 'utf8');

/** 前本地副本/中转消费文件（BJ204 落刀面） */
const CONSUMERS = [
  'world/gen/vanilla/SurfaceDecorPasses.ts',
  'world/spawn/VanillaSpawner.ts',
  'world/gen/vanilla/CaveWallsPass.ts',
  'world/gen/WorldGen.ts',
  'world/evolution/WorldEvolution.ts',
];

describe('BJ204 WALL_HOUSE 单源化（world/Housing.ts 唯一表体）', () => {
  it('①五消费文件零本地表体（WALL_HOUSE = new Set 禁止复活）', () => {
    for (const f of CONSUMERS) {
      expect(src(f), `${f} 不得再有本地表体`).not.toMatch(/WALL_HOUSE\s*[:=][^;]*new Set/);
    }
  });

  it('②五消费文件全部 import 自 Housing（单源引用面）', () => {
    for (const f of CONSUMERS) {
      expect(src(f), `${f} 应从 Housing 引 WALL_HOUSE`).toMatch(/import\s+\{\s*WALL_HOUSE\s*\}\s+from\s+'[./]*Housing'/);
    }
  });

  it('③SurfaceDecorPasses 不再转出 WALL_HOUSE（消灭再中转漂移面）', () => {
    const t = src('world/gen/vanilla/SurfaceDecorPasses.ts');
    expect(t).not.toMatch(/export\s+(const|let|var|function|type)\s+WALL_HOUSE/);
    expect(t).not.toMatch(/export\s*\{[^}]*\bWALL_HOUSE\b/);
  });

  it('④单源表体权威面抽查：279 面 + Gemspark 153-166 + 自然墙不在内', () => {
    expect(WALL_HOUSE.size).toBe(279);
    for (let i = 153; i <= 166; i++) expect(WALL_HOUSE.has(i), `Gemspark ${i}`).toBe(true);
    for (const w of [1, 4, 5, 60, 74, 224, 312, 323, 345, 346, 347, 348, 351, 366]) {
      expect(WALL_HOUSE.has(w), `wallHouse ${w}`).toBe(true);
    }
    // 自然墙（土/岩/腐化土墙等）不在表内（Main.cs 无 wallHouse[n]=true 直赋；6=栅栏系在表内勿列）
    for (const w of [0, 2, 3, 7, 8, 9, 63, 64]) expect(WALL_HOUSE.has(w), `natural ${w}`).toBe(false);
  });
});

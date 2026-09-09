// SW-RB9c（2026-09-09）条件镐力门族审计回归：GetPickaxeDamage 深度/帧档条件门 vs
// 尾段通用 d.pick 门互斥性。
//
// 1457 金标：Player.cs:54540-54700 GetPickaxeDamage —— 零伤门全部是【条件门】
// （22/204 仅 y>worldSurface 才要 55 :54565-54568；77 仅 y>=Main.UnderworldLayer
// (=maxTilesY-200,Main.cs:2886) 才要 65 :54577-54579；地牢砖仅 y>worldSurface 且
// X 出中带才要 100 :54599-54604；137 仅 frameY/18∈[1,4] 档才要 210 :54589-54596），
// 全文无"通用二次归零"。仓库尾段通用门（tileHitDamage 尾 `power < d.pick → 0`）
// 曾对全表生效 → 把上述豁免域整个抹平（77 地表熔炉铜镐挖不动/详链条件支死码）。
// 修复（SW-RB9c）：通用门跳过 PICK_CONDITIONAL_GATE_SHEETS（22/204/77/137/地牢族）。
import { describe, it, expect } from 'vitest';
import { Game } from '../src/core/Game';
import { TILE_BY_KEY } from '../src/data/tiles';

function shell(h = 1200, groundLevel = 300) {
  const g = Object.create(Game.prototype) as unknown as Record<string, unknown> & {
    tileHitDamage(tx: number, ty: number, type: number, toolType: 'pick' | 'axe' | 'hammer',
      power: number, respectTransformingTiles?: boolean, respectCanKillTile?: boolean): number;
  };
  g.world = { h, groundLevel, seedFlags: {}, store: { w: 4200, h } };
  g.input = {};
  return g;
}

const FORGE = TILE_BY_KEY['v_77_hellforge']!;
const DEMONITE = TILE_BY_KEY['ore_demonite']!;      // sheet 22（详链条件门 55 地表下）
const COBALT = TILE_BY_KEY['ore_cobalt']!;          // sheet 107（无条件门 100）

// tileHitDamage 尾 respectCanKillTile 默认 true 会拉进 canKillTile（SW-G1 全函数门,
// WorldGen.CanKillTile 面）——原版 GetPickaxeDamage 本体无该门（在 PickTile 层）,
// 本测面=纯 GetPickaxeDamage 语义 → 一律 respectCanKillTile=false
const dmg = (g: ReturnType<typeof shell>, x: number, y: number, type: number, power: number): number =>
  g.tileHitDamage(x, y, type, 'pick', power, false, false);

describe('SW-RB9c 条件镐力门族 vs 通用门（Player.cs:54540-54700）', () => {
  it('地狱熔炉在地狱层【上】（y<maxTilesY-200）：任意镐可伤（:54577 条件不成立）', () => {
    const g = shell();   // h=1200 → UnderworldLayer=1000
    // 铜镐 35：详链 dmg=power=35；77 条件门 y>=1000 不成立 → 不归零；通用门跳过
    expect(dmg(g, 100, 500, FORGE, 35)).toBe(35);
  });

  it('地狱熔炉在地狱层【下】（y>=maxTilesY-200）：镐力 <65 归零（:54577）', () => {
    const g = shell();
    expect(dmg(g, 100, 1000, FORGE, 35)).toBe(0);
    expect(dmg(g, 100, 1100, FORGE, 35)).toBe(0);
  });

  it('地狱熔炉在地狱层下 65 镐：满伤（门槛恰达标）', () => {
    const g = shell();
    expect(dmg(g, 100, 1100, FORGE, 65)).toBe(65);
  });

  it('remix 世界深度线=maxTilesY-200 恒定（Main.cs:2886）,非 GenVars.lavaLine', () => {
    // GenVars.lavaLine（TerrainPass.cs:214-218 ≈(rockLayer+maxTilesY)/2+掷）=岩浆带
    // 概念,≠UnderworldLayer。remix 世界 lavaLine=890 < 1000：y=950 带（曾误用
    // lavaLine → 低镐误拒）任意镐可伤;y=1000 起才要 65。
    const g = shell();
    (g.world as { lavaLine?: number }).lavaLine = 890;
    expect(dmg(g, 100, 950, FORGE, 35)).toBe(35);
    expect(dmg(g, 100, 1000, FORGE, 35)).toBe(0);
  });

  it('魔金矿（22）地表【上】：任意镐可伤（:54565 条件不成立）;通用门曾抹平', () => {
    const g = shell(1200, 300);
    expect(dmg(g, 100, 200, DEMONITE, 35)).toBe(35);   // y<worldSurface=300
  });

  it('魔金矿（22）地表【下】：镐力 <55 归零（条件门保留）', () => {
    const g = shell(1200, 300);
    expect(dmg(g, 100, 400, DEMONITE, 35)).toBe(0);
    expect(dmg(g, 100, 400, DEMONITE, 55)).toBe(55);
  });

  it('无条件门族不松动：钴矿（107）100 门槛恒有效（通用门继续兜）', () => {
    const g = shell();
    expect(dmg(g, 100, 500, COBALT, 50)).toBe(0);
    expect(dmg(g, 100, 500, COBALT, 100)).toBe(50);   // ÷2 档（:54552）
  });

  it('普通实心块走 d.pick 表兜底不变（土 0 门槛+尾段修益二倍速=70,Player.cs:54616）', () => {
    const g = shell();
    const dirt = TILE_BY_KEY['dirt']!;
    expect(dmg(g, 100, 400, dirt, 35)).toBe(70);   // num += pickPower（土壤族二倍速）
  });
});

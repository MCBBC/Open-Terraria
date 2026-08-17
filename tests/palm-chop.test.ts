// 棕榈树砍伐对账（2026-08-17 用户报"海边棕榈树无法砍伐"触发）：
//   根因 = v_323 def 缺 axe（默认 -1 → toolCanBreak 斧档 false）。连带三修：
//   ①原版镐排除门（Player.cs:45039 `sItem.pick>0 && !tileAxe[·]`——树/棕榈/
//    倒木斧专属；v_5/v_80 的 pick:0 此前允许镐挖树也是错）；②fellImportedTree
//    棕榈分支（每干格棕榈木 2504 + 树冠格 88-132 橡实 + 邪恶沙地变体
//    234→Shadewood/116→Pearlwood/112→Ebonwood，KillTile :62283-65314）；
//    ③清格前帧捕获段（trunkFX/trunkFY）——宝石树干基门 22/198 此前读清格后
//    恒 0 → gemcorn 从未掉（潜伏 bug 连带抓出）。
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { TILE } from '../src/core/constants';
import type { GameHooks } from '../src/entities/types';
import { TILE_BY_KEY, TILE_DEFS } from '../src/data/tiles';
import { Game } from '../src/core/Game';

function makeGame(w: World): GameHooks {
  return {
    world: w, player: null as unknown, enemies: () => [], critters: () => [],
    entities: { nextId: 1, add: () => {} },
    playSfx: () => {}, playSfxFiles: () => {}, playSfxFile: () => {},
    spawnParticles: () => {}, addDamageNumber: () => {}, spawnDrop: () => null,
    damagePlayer: () => {}, notifyInventoryChanged: () => {},
    onEnemyKilled: () => {}, spawnEnemy: () => {}, cutTile: () => {},
  } as unknown as GameHooks;
}

function ground(w: World): World {
  for (let x = 0; x < 60; x++) w.store.setTileSilent(x, 40, 1, 0, 0);
  return w;
}

const PALM = TILE_BY_KEY['v_323_palm_trees'];
const TREE = TILE_BY_KEY['v_5_trees'];
const CACTUS = TILE_BY_KEY['v_80_cactus'];
const DIRT = TILE_BY_KEY['dirt'];

describe('棕榈树砍伐（tileAxe 族对齐）', () => {
  it('axe 覆盖：原版 tileAxe 16 件全表（Main.cs:7157-7172）', () => {
    const VANILLA = [5, 72, 80, 488, 704, 323, 596, 616, 634, 589, 584, 588, 586, 587, 585, 583];
    const missing = VANILLA.filter((s) => {
      const d = TILE_DEFS.find((t) => t.vanilla?.sheet === s);
      return !d || d.axe == null || d.axe < 0;
    });
    expect(missing, `缺 axe 的 sheet: ${missing}`).toEqual([]);
  });

  it('镐排除门（:45039）：树/棕榈/倒木/仙人掌 pick 不可挖，镐可挖普通块', () => {
    // toolCanBreak 经 (game as any) 直调——private 仅编译期
    const g = Object.create(Game.prototype) as unknown as {
      toolCanBreak(t: number, power: number, tool: string): boolean;
    };
    for (const t of [PALM, TREE, CACTUS, TILE_BY_KEY['v_488_fallen_log'], TILE_BY_KEY['v_704_fallen_log_echo']]) {
      expect(g.toolCanBreak(t, 100, 'pick'), `sheet ${TILE_DEFS[t].vanilla?.sheet} pick`).toBe(false);
      expect(g.toolCanBreak(t, 0, 'axe'), `sheet ${TILE_DEFS[t].vanilla?.sheet} axe`).toBe(true);
    }
    expect(g.toolCanBreak(DIRT, 50, 'pick')).toBe(true);
  });

  it('fellImportedTree 棕榈分支：每干格棕榈木 + 树冠格橡实（帧前捕获）', () => {
    const drops: Array<[string, number]> = [];
    const w = ground(new World(60, 60, 30, 'open'));
    // 5 格棕榈干（沙地）：frameX 树冠两格 88/110，其余 22
    for (let i = 0; i < 5; i++) {
      w.store.setTileSilent(30, 35 + i, PALM, i >= 3 ? 88 + (i - 3) * 22 : 22, 0);
    }
    // 原型壳直调（private 仅编译期；vitest 环境无 DOM 不走构造器）
    const g = Object.create(Game.prototype) as unknown as {
      world: World; chunks: { markDirtyArea: () => void };
      spawnDrop: (x: number, y: number, key: string, n: number) => void;
      spawnParticles: () => void;
      fellImportedTree: (x: number, y: number, t: number) => void;
    };
    g.world = w;
    g.chunks = { markDirtyArea: () => {} };
    g.spawnParticles = () => {};
    g.spawnDrop = (_x, _y, key, n) => { drops.push([key, n]); };
    g.fellImportedTree(30, 36, PALM);
    const palmWood = drops.filter(([k]) => k.startsWith('vi_2504')).reduce((a, [, n]) => a + n, 0);
    const acorns = drops.filter(([k]) => /^vi_27_/.test(k)).reduce((a, [, n]) => a + n, 0);
    expect(palmWood).toBe(5);          // 每干格 1
    expect(acorns).toBe(2);            // 树冠两格（88/110 → 88-132 门）
    // 树已清
    expect(w.store.get(30, 36)).toBe(0);
  });

  it('宝石树干基门修复：清格前捕获后 gemcorn 50% 掷骰可达', () => {
    const GEM = TILE_BY_KEY['v_583_topaz_tree'];
    let gemcorn = 0;
    // 50% 掷骰：跑 12 棵，捕获修复后命中率应 > 0（恒 0 = 回归）
    for (let trial = 0; trial < 12; trial++) {
      const drops: Array<[string, number]> = [];
      const w = ground(new World(40, 60, 30, 'open'));
      // 干基帧 X=22/Y=198（:66149 SetGemTreeDrops）
      w.store.setTileSilent(20, 39, GEM, 22, 198);
      w.store.setTileSilent(20, 38, GEM, 22, 0);
      const g = Object.create(Game.prototype) as unknown as {
        world: World; chunks: { markDirtyArea: () => void };
        spawnDrop: (x: number, y: number, key: string, n: number) => void;
        spawnParticles: () => void;
        fellImportedTree: (x: number, y: number, t: number) => void;
      };
      g.world = w;
      g.chunks = { markDirtyArea: () => {} };
      g.spawnParticles = () => {};
      g.spawnDrop = (_x, _y, key, n) => { drops.push([key, n]); };
      g.fellImportedTree(20, 38, GEM);
      gemcorn += drops.filter(([k]) => k.includes('4851')).length;
    }
    expect(gemcorn).toBeGreaterThan(0);   // 12 树 50% → P(全空) = 1/4096
  });
});

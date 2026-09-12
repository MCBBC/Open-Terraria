// SW-FX48 补债批（2026-09-12）数据微债②：LongMoss 苔藓掉落链 vid 注册面收口（FX12 剩债）。
//
// 现状定谳（先于动刀）：FX12（2026-09-10）登记的「4349-4354/4389/5127/5128 多数
// 未注册,col 命中未注册 vid 静默不掉」已由后续并行批次（vanilla.json 物品表 +
// itemfunc 提取器覆盖面）自然消解——本批全 11 款（掉落链含 4377/4378 两款,col 6/7）
// 均已注册且 itemfunc createTile 1:1。剩余缺口 = 无回归锁：FX12 B2 只测了 col 7
// 一款（4378）。本文件补全两件事：
//   ① 11 款注册矩阵（vid→key/iid/createTile/贴图/名称）——掉落链静默守卫
//     （Game.tryUsePaintTool `mossKey !== ''`/`mossId !== undefined`）永不再吞 vid;
//   ② LongMoss 全 col 扫（0..10,Player.cs:42166-42185 映射 1:1）+ 砖块掉石块
//     （WorldGen.cs:64514-64524 dropItem=3——苔藓制品只经刮苔藓获得,原版语义）。
// 反编译锚（1457）：Item.cs:37164-37168 DefaultToPlaceableTile(179+type-4349)
//   /:37171 4354→381 /:37270 4377→534 /:37278 4389→539 /:41088 5127→625 /:41092
//   5128→627;Player.cs:42143-42189 LongMoss(KillTile+1/9+RequestNewItem)。
// 变异证红：注册矩阵任一 vid 反查落空（模拟 FX12 旧债态）→ A 面红;
//   col 映射漂移（如 5127↔5128 互换）→ B 面红;砖块 drop 改苔藓 → C 面红。
import { describe, it, expect, vi } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { World } from '../src/world/World';
import { TileStore } from '../src/world/TileStore';
import { TILE_BY_KEY, TILE_DEFS } from '../src/data/tiles';
import { ITEM_BY_KEY, ITEM_DEFS, VANILLA_ITEM_KEY_BY_ID } from '../src/data/items';
import { VI } from '../src/data/itemKeys';
import { itemFuncOfVid } from '../src/data/vanillaItemFunc';
import { Inventory } from '../src/items/Inventory';
import { Game } from '../src/core/Game';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const itemOf = (vid: number) => ITEM_DEFS[ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[vid]]];

/** 苔藓掉落链全 11 款（col 升序;值源 = Player.cs:42166-42185 1:1）：
 *  [col, vid, 物品内部名（vanilla.json key）, createTile（Item.cs SetDefaults）] */
const MOSS: ReadonlyArray<readonly [number, number, string, number]> = [
  [0, 4349, 'GreenMoss', 179],
  [1, 4350, 'BrownMoss', 180],
  [2, 4351, 'RedMoss', 181],
  [3, 4352, 'BlueMoss', 182],
  [4, 4353, 'PurpleMoss', 183],
  [5, 4354, 'LavaMoss', 381],
  [6, 4377, 'KryptonMoss', 534],
  [7, 4378, 'XenonMoss', 536],
  [8, 4389, 'ArgonMoss', 539],
  [9, 5127, 'VioletMoss', 625],    // 1.4.5 更名 Neon Moss（内部名未改）
  [10, 5128, 'RainbowMoss', 627],  // 1.4.5 更名 Helium Moss
];

// ==================== A. 注册矩阵（掉落链静默守卫不再吞 vid） ====================
describe('A. 苔藓 11 款注册矩阵（FX12「未注册 vid 静默不掉」债复核收口）', () => {
  it('A1 VI()/ITEM_BY_KEY 双级反查全命中（Game.tryUsePaintTool 苔藓支的两个静默守卫位）', () => {
    for (const [, vid] of MOSS) {
      const key = VI(vid);
      expect(key, `VI(${vid}) 非空`).not.toBe('');
      expect(ITEM_BY_KEY[key], `ITEM_BY_KEY[${key}]`).toBeDefined();
      // def 反查 vid 往返（4377/4378 为 dual-key 桥接件:Pascal 键别名到 snake def,键面不必等）
      const def = ITEM_DEFS[ITEM_BY_KEY[key]];
      expect(def.vid ?? Number(/^vi_(\d+)_/.exec(def.key)![1])).toBe(vid);
    }
  });

  it('A2 itemfunc createTile/placeStyle 1:1（Item.cs:37164-37171/:37270/:37278/:41088/:41092）', () => {
    for (const [, vid, , tile] of MOSS) {
      const f = itemFuncOfVid(vid);
      expect(f?.createTile, `vid ${vid} createTile`).toBe(tile);
      expect(f?.placeStyle ?? 0).toBe(0);
      expect(f?.consumable ?? 0).toBeTruthy();          // DefaultToPlaceableTile consumable 面
      expect(f?.autoReuse ?? 0).toBeTruthy();
    }
  });

  it('A3 放置 tile 全在仓（sheet 反查 TILE_DEFS——放置链 sheet→internal 依赖）', () => {
    for (const [, vid, , tile] of MOSS) {
      const hit = TILE_DEFS.find((d) => d?.vanilla?.sheet === tile);
      expect(hit, `vid ${vid} → tile sheet ${tile} 应有 def`).toBeDefined();
      expect(TILE_BY_KEY[hit!.key]).toBeDefined();
    }
  });

  it('A4 贴图矩形 + 显示名在位（Item_Atlas icon 域 + 原版 l10n ItemName）', () => {
    const vanilla = JSON.parse(readFileSync(join(ROOT, 'public/sprites/vanilla.json'), 'utf8')) as {
      items: Record<string, { key: string; icon?: string; ix?: number; iw?: number }>;
    };
    for (const loc of ['zh-Hans', 'en-US']) {
      const l10n = JSON.parse(readFileSync(join(ROOT, `public/l10n/${loc}.json`), 'utf8')) as {
        ItemName: Record<string, string>;
      };
      for (const [, vid, itemKey] of MOSS) {
        const e = vanilla.items[String(vid)];
        expect(e, `vanilla.json items[${vid}]`).toBeDefined();
        expect(e!.key).toBe(itemKey);
        expect(e!.icon && existsSync(join(ROOT, 'public/sprites', e!.icon)), `vid ${vid} icon 贴图`).toBe(true);
        expect(e!.iw ?? 0).toBeGreaterThan(0);
        expect(l10n.ItemName[itemKey], `${loc} ItemName.${itemKey}`).toBeTruthy();
      }
    }
  });
});

// ==================== B. LongMoss 全 col 扫（Player.cs:42143-42189 1:1） ====================
type Drop = { x: number; y: number; key: string; n: number };
type G = Record<string, unknown> & {
  tryUsePaintTool: (x: number, y: number, d: (typeof ITEM_DEFS)[number]) => void;
  player: { useTime: number; inv: Inventory; equipStats: Record<string, unknown> };
  drops: Drop[];
};

function mkMossGame(): { g: G; st: TileStore; drops: Drop[] } {
  const w = new World(48, 64, 20, 'fx48-moss');
  const g = Object.create(Game.prototype) as unknown as G;
  g.netCanEditTile = () => true;
  g.world = w;
  g.player = {
    useTime: 0, inv: new Inventory(), equipStats: {},
  };
  g.inTileRange = () => true;
  g.blockRange = () => 5;
  g.spawnParticles = () => {};
  g.cb = { onInventoryChanged: () => {} };
  const drops: Drop[] = [];
  g.spawnDrop = (x: number, y: number, key: string, n: number) => { drops.push({ x, y, key, n }); return null; };
  g.drops = drops;
  // KillTile 桩：只清格（隔离真实掉落链——FX12 B2 同构,本批只锁刮苔藓支的 vid 映射）
  g.breakTile = (x: number, y: number) => { (w.store as TileStore).setTile(x, y, 0); };
  return { g, st: w.store, drops };
}

describe('B. LongMoss 刮苔藓掉落 vid 映射全 col 扫（:42166-42185 1:1）', () => {
  it('B1 col 0..10 → 11 款各掉 1（世界掉落物,不入包;frameX/22 = col）', () => {
    for (const [col, vid] of MOSS) {
      const { g, st, drops } = mkMossGame();
      const moss = TILE_BY_KEY['v_184_moss_plants']!;
      st.setTileSilent(16, 10, moss, col * 22, 0);
      const rnd = vi.spyOn(Math, 'random').mockReturnValue(0);   // 1/9 掷中（floor(0*9)=0）
      try {
        g.tryUsePaintTool(16, 10, itemOf(1100));                 // Paint Scraper
        expect(st.type[st.idx(16, 10)]).toBe(0);                 // KillTile 已清
        expect(g.player.useTime).toBe(10);                       // ApplyItemTime（:42161）
        expect(drops, `col ${col}`).toHaveLength(1);
        expect(drops[0]).toMatchObject({ key: VI(vid), n: 1, x: 16 * 16, y: 10 * 16 });
      } finally {
        rnd.mockRestore();
      }
    }
  });

  it('B2 静默守卫面复核：col 映射 vid 全部可实例化（掉落物可拾取/可放置）', () => {
    // Game.tryUsePaintTool 苔藓支 `if (mossId !== undefined)` 桥后世界——
    // 任一 vid 反查落空即静默零掉（FX12 旧债态）,此处锁死不再发生
    for (const [, vid] of MOSS) {
      const id = ITEM_BY_KEY[VI(vid)];
      expect(id, `vid ${vid}`).toBeDefined();
      expect(ITEM_DEFS[id].maxStack).toBeGreaterThan(0);
    }
  });
});

// ==================== C. 苔藓砖掉石块（WorldGen.cs:64514-64524 dropItem=3） ====================
describe('C. 苔藓砖挖掘掉石块（苔藓制品只经刮苔藓获得——原版语义）', () => {
  it('C1 全 11 款砖 tile def drop=3（GetItemDrop case 179-183/381/534/536/539/625/627）', () => {
    for (const [, vid, , tile] of MOSS) {
      const def = TILE_DEFS.find((d) => d?.vanilla?.sheet === tile);
      expect(def, `sheet ${tile}`).toBeDefined();
      expect(def!.drop, `sheet ${tile} drop`).toBe(3);
    }
  });
});

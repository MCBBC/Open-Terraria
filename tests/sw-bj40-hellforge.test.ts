// SW-BJ40（2026-09-09）地狱熔炉（Hellforge, TileID 77 / ItemID 221）多格语义整链回归。
//
// 用户实报：一个地狱熔炉敲出 5+ 个（按贴图格数逐格掉落），放置也是一格一格——
// 根因 = def 缺 w/h（1×1 假象）：放置落 legacy 单格路径、破坏落 1×1 掉落路径、
// 失撑无整件级联。修复 = tiles.ts 补 w:3,h:2（唯一刀位）+ 挖掘/失撑掉落弹出格接
// 原版 Check* 触发格。
//
// 1457 金标（Terarria1457/，1458 同域核对零变更）：
//   · TileID.Hellforge = 77（TileID.cs:591）；ItemID.Hellforge = 221（ItemID.cs:1988）
//   · TileObjectData.cs:3363-3366：CopyFrom(Style3x2) + CoordinateHeights{16,18}
//     + LavaDeath=false + addTile(77)；Style3x2 基表 :3170-3180：
//     Width3×Height2 / Origin(1,1) / AnchorBottom(SolidTile|SolidWithTop|SolidSide,3,0)
//     / UsesCustomCanPlace / CoordinateWidth16 / Padding2 / StyleHorizontal
//   · 放置（玩家侧）：Player.cs:40085-40092 CustomPlace=true → TileObject.CanPlace
//     （TileObject.cs:174）/TileObject.Place（:29-172 全 footprint 裸写，frameX=
//     CoordinateFullWidth*style + col*(16+2)、frameY=行累计 heights+2）
//   · 放置（legacy）：WorldGen.cs:60570-60575 case 17/77/133 → Place3x2(:52525)
//     frameX=54*style+col*18 / frameY=row*18（style0 与 TileObject 路同值）
//   · 破坏：WorldGen.Check3x2（:49617）完整性裁决 + destroyObject 整件 KillTile
//     （:49847-49862）+ case 77 单次 Item.NewItem(221)（:50119-50121）
//     ——KillTile_GetItemDrops 对 77 无逐格掉落（共享 no-drop 大组 :66289→:66610 纯 break）
//   · 触发格/掉落坐标：KillTile 尾 SquareTileFrame（:64445→:81462-81472）列优先扫
//     3×3，首个 active 同类格派发 Check3x2，掉落于该格 (i*16, j*16, 32, 32)（:50120）
//   · 1458 核对：TileObjectData.cs:3364-3366 / WorldGen.cs:50127-50128 / :60579-60581
//     全同值（Skyblock NPCLoot_DropHellforge 增量不触数值面）
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { Game, multiTileDropTriggerCell } from '../src/core/Game';
import {
  ITEM_DEFS, ITEM_BY_KEY, VANILLA_ITEM_KEY_BY_ID, vanillaPlaceableTileKeys,
} from '../src/data/items';
import { TILE_BY_KEY, TILE_DEFS } from '../src/data/tiles';
import { anchorSpecOf, validateAnchors } from '../src/world/TileAnchorValidator';
import anchorsJson from '../src/data/tile-anchors.json';

const ANCHORS = (anchorsJson as { v: string; tiles: Record<string, { w: number; h: number } | null> }).tiles;

const HF_KEY = 'place_v_77_hellforge';
const HF_TILE = TILE_BY_KEY['v_77_hellforge']!;
const HF_DEF = TILE_DEFS[HF_TILE]!;
const HF_ITEM = ITEM_DEFS[ITEM_BY_KEY[HF_KEY]!];
const HF_VID_KEY = VANILLA_ITEM_KEY_BY_ID[221]!;

const TILE = 16;

interface Drop { key: string; x: number; y: number; n: number }

/** tryPlace 壳（同 ghost-place-swap shell 模式） */
function placeShell(w: World) {
  const held = { stack: 5 };
  const g = Object.create(Game.prototype) as unknown as Record<string, unknown> & {
    tryPlace(tx: number, ty: number, def?: (typeof ITEM_DEFS)[number]): void;
  };
  g.world = w;
  g.chunks = { markDirtyArea: () => {} };
  g.sfx = { play: () => {} };
  g.cb = { onInventoryChanged: () => {} };
  g.input = { rightDown: true };
  g.entities = { critters: [], enemies: [], npcs: [], projectiles: [] };
  g.critterVid = () => -1;
  g.spawnNpcByVanilla = () => null;
  g.spawnParticles = () => {};
  g.recLog = () => {};
  g.spawnDrop = () => null;
  g.hitTiles = { addDamage: () => 100, clear: () => {} };
  g.swingTileCutSet = new Set<number>();
  g.achievements = { notifyTileDestroyed: () => {}, handleMining: () => {} };
  g.smartCursor = { lockedContinuity: null, showing: false, x: 0, y: 0 };
  g.netCanEditTile = () => true;
  g.inTileRange = () => true;
  g.playSfxFile = () => {};
  g.playSfxFiles = () => {};
  g.player = {
    cx: 10 * 16 + 8, cy: 19 * 16 + 8, x: 10 * 16 + 2, y: 19 * 16 - 6, w: 12, h: 28,
    facing: 1, useTime: 0, attackSpeedMult: 1,
    buffs: { has: () => false, wellFedTier: 0, hungerPickSpeed: 0 }, equipStats: {},
    inv: {
      selected: 0,
      slots: new Array(50).fill(null),
      heldItem: () => (held.stack > 0 ? { id: ITEM_BY_KEY[HF_KEY]!, stack: held.stack } : null),
      removeAt: () => {},
      removeHeld: () => { held.stack--; },   // 消耗记账（壳内闭包近似）
      countOf: () => 0,           // killTileShouldDropSeeds 探针（草族清格链,非本测面）
    },
  };
  return { g, held };
}

/** breakTile 壳（同 multi-tile-drop boulderShell 模式,加坐标捕获） */
function breakShell(w: World, drops: Drop[]) {
  const g = Object.create(Game.prototype) as unknown as Record<string, unknown> & {
    breakTile(x: number, y: number, byPlayer?: boolean, noItem?: boolean): void;
    checkFurnitureSupport(x: number, y: number): void;
  };
  g.world = w;
  g.chunks = { markDirtyArea: () => {} };
  g.spawnParticles = () => {};
  g.sfx = { play: () => {} };
  g.playSfxFile = () => {};
  g.playSfxFiles = () => {};
  g.spawnDrop = (x: number, y: number, key: string, n: number) => { drops.push({ key, x, y, n }); return null; };
  g.recLog = () => {};
  g.dumpChest = () => {};
  g.entities = { add: () => {}, drops: [], critters: [], enemies: [] };
  g.trackTile = 0;
  g.achievements = { notifyTileDestroyed: () => {}, handleMining: () => {} };
  g.player = { equipStats: {}, cx: 0, cy: 0 };
  return g;
}

/** 平整石地（y=21 一行 stone,无墙）,上方净空 */
function mkWorld(): World {
  const w = new World(60, 40, 7, 'sw-bj40');
  const st = w.store;
  const stone = TILE_BY_KEY['stone']!;
  for (let x = 2; x < 58; x++) st.setTileSilent(x, 21, stone);
  return w;
}

/** 写一台完整 3×2 地狱熔炉（锚左上 (ax,ay)，HellforgesPass 同帧式） */
function putForge(st: World['store'], ax: number, ay: number): void {
  for (let dx = 0; dx < 3; dx++) {
    for (let dy = 0; dy < 2; dy++) {
      st.setTileSilent(ax + dx, ay + dy, HF_TILE, dx * 18, dy * 18);
    }
  }
}

const forgeCellOk = (st: World['store'], x: number, y: number): boolean =>
  st.type[st.idx(x, y)] === HF_TILE && st.hasTile(x, y);

const boxEmpty = (st: World['store'], ax: number, ay: number, w = 3, h = 2): void => {
  for (let dx = 0; dx < w; dx++) for (let dy = 0; dy < h; dy++) {
    expect(st.type[st.idx(ax + dx, ay + dy)], `格 (${ax + dx},${ay + dy}) 应为空`).toBe(0);
  }
};

// ============ ① 注册表面：def w/h = TileObjectData = vanilla 帧尺寸 ============
describe('SW-BJ40 ① def/注册表/vanilla 帧尺寸三方一致（TileObjectData.cs:3363-3366）', () => {
  it('地狱熔炉 def 3×2（刀位本体：曾缺 → 全链 1×1 假象）', () => {
    expect(HF_DEF.framed).toBe(true);
    expect(HF_DEF.w).toBe(3);   // TileObjectData Style3x2 Width=3（:3170）
    expect(HF_DEF.h).toBe(2);   // Height=2（:3171）
    expect(HF_DEF.vanilla?.fw).toBe(3);
    expect(HF_DEF.vanilla?.fh).toBe(2);
    expect(ANCHORS['77']).toMatchObject({ w: 3, h: 2 });   // recon-tileobj 提取（ox:1,oy:1）
  });

  it('掉落 = 221（Check3x2 case 77 :50119-50121 整件单掉）+ 放置物品映射', () => {
    expect(HF_DEF.drop).toBe(221);
    expect(HF_VID_KEY).toBeDefined();
    expect(HF_ITEM.tile).toBe('v_77_hellforge');
    expect(vanillaPlaceableTileKeys().has('v_77_hellforge')).toBe(true);
  });

  it('家族矩阵：全部锚点登记件 def w/h 与 TileObjectData 一致（同族盲区防再发）', () => {
    // 豁免名录（逐条备案,非「家具锚点放置链」成员）：
    //   20 树苗 / 590 宝石树苗 = worldgen 植物族（checkDecorSupport 'sapling' 专管,
    //     无放置物品;590 原版 TileObjectData 1×2 = anchors 记录）
    //   31 恶魔之心 = breakTileBody 专支整件销毁（smashOrbHeart 2×2 手写循环）
    //   74 丛林高草 = 植物切割族（原版 KillTile 逐格,注册表 1×1 与 def 1×1 本一致——
    //     vanilla fw/fh=1×2 仅渲染帧域）
    const EXEMPT = new Set([20, 31, 74, 590]);
    const rows: string[] = [];
    for (const d of TILE_DEFS) {
      if (!d || !d.vanilla || d.vanilla.frame !== 'style') continue;
      const sheet = d.vanilla.sheet!;
      if (EXEMPT.has(sheet)) continue;
      const rec = ANCHORS[String(sheet)];
      if (!rec) continue;   // 无 TileObjectData 记录（自创/复杂构造回落件）不属本断言域
      if ((d.w ?? 1) !== rec.w || (d.h ?? 1) !== rec.h) {
        rows.push(`sheet=${sheet} key=${d.key} def(${d.w ?? 1}x${d.h ?? 1}) anchors(${rec.w}x${rec.h})`);
      }
    }
    expect(rows, `多格语义缺席族（锚点链整体回落 1×1）:\n${rows.join('\n')}`).toEqual([]);
  });
});

// ============ ② 放置面：真 tryPlace → TileObject 整体 6 格 + 帧值 ============
describe('SW-BJ40 ② 放置 = TileObject 整体链（Player.cs:40085-40092→TileObject.cs:29-172）', () => {
  it('点击底中格 → 整件 3×2 一次放下,六格帧值 1:1（frameX=dx*18, frameY=dy*18）', () => {
    const w = mkWorld();
    const st = w.store;
    const { g, held } = placeShell(w);
    // 点击 (20,20)=物件底中格（Origin(1,1)：点击格=物件内 (1,1) 位,锚左上=(19,19)）
    g.tryPlace(20, 20, HF_ITEM);
    for (let dx = 0; dx < 3; dx++) {
      for (let dy = 0; dy < 2; dy++) {
        const x = 19 + dx, y = 19 + dy;
        expect(forgeCellOk(st, x, y), `格 (${x},${y}) 应为熔炉`).toBe(true);
        expect(st.frameX[st.idx(x, y)]).toBe(dx * 18);
        expect(st.frameY[st.idx(x, y)]).toBe(dy * 18);
      }
    }
    // 锚框外零写入 + 地面未吃
    expect(st.type[st.idx(18, 19)]).toBe(0);
    expect(st.type[st.idx(22, 19)]).toBe(0);
    expect(st.type[st.idx(19, 21)]).toBe(TILE_BY_KEY['stone']!);
    expect(held.stack).toBe(4);   // 一件一次
  });

  it('底锚三列缺一 → 拒放（AnchorBottom SolidTile×3 满分制,TileObject.cs:376-442）', () => {
    const w = mkWorld();
    const st = w.store;
    const rec = anchorSpecOf(77)!;
    // 直接对拍 CanPlace 尾判：三锚列任一失格 ⇒ 全拒（num35<1）
    st.setTileSilent(21, 21, 0);   // 右列锚面挖空
    expect(validateAnchors(st, 19, 19, rec)).toBe(false);
    st.setTileSilent(19, 21, 0);   // 仅存中列 → 仍拒
    expect(validateAnchors(st, 19, 19, rec)).toBe(false);
    st.setTileSilent(19, 21, TILE_BY_KEY['stone']!);
    st.setTileSilent(21, 21, TILE_BY_KEY['stone']!);   // 三列齐 → 过
    expect(validateAnchors(st, 19, 19, rec)).toBe(true);
    // tryPlace 面：锚窗全毁（吸附 QoL 无解）→ 零格变更
    for (let x = 16; x <= 24; x++) st.setTileSilent(x, 21, 0);
    const { g } = placeShell(w);
    g.tryPlace(20, 20, HF_ITEM);
    boxEmpty(st, 19, 19);
    boxEmpty(st, 18, 18);
  });

  it('占位格被普通块占据 → 拒放（CanPlace :357 非豁免格阻挡）', () => {
    const w = mkWorld();
    const st = w.store;
    const dirt = TILE_BY_KEY['dirt']!;
    st.setTileSilent(20, 20, dirt);
    for (let x = 16; x <= 24; x++) st.setTileSilent(x, 21, 0);   // 锚窗全毁（吸附 QoL 无解）
    const { g } = placeShell(w);
    g.tryPlace(20, 20, HF_ITEM);
    for (let dx = 0; dx < 3; dx++) for (let dy = 0; dy < 2; dy++) {
      const x = 19 + dx, y = 19 + dy;
      if (x === 20 && y === 20) continue;   // 障碍格单独断言
      expect(st.type[st.idx(x, y)], `格 (${x},${y}) 应为空`).toBe(0);
    }
    boxEmpty(st, 18, 18);
    expect(st.type[st.idx(20, 20)]).toBe(dirt);   // 障碍原样（失败零格变更）
  });

  it('tileCut 豁免：草丛占位格放置前被清（TileObject.Place :84-93 KillTile 预清相）', () => {
    const w = mkWorld();
    const st = w.store;
    const grass = TILE_BY_KEY['tallgrass']!;
    st.setTileSilent(20, 20, grass);
    const { g } = placeShell(w);
    g.tryPlace(20, 20, HF_ITEM);
    for (let dx = 0; dx < 3; dx++) {
      for (let dy = 0; dy < 2; dy++) {
        expect(forgeCellOk(st, 19 + dx, 19 + dy)).toBe(true);
      }
    }
    expect(st.frameX[st.idx(20, 20)]).toBe(18);
  });
});

// ============ ③ 挖掘面：整件销毁 + 恰 1 掉落 + 触发格坐标 ============
describe('SW-BJ40 ③ 挖任意格恰 1 掉落（Check3x2 :49847-49862 整件清+:50119 单掉）', () => {
  // 物件落地：盒 (10..12, 19..20)（底行 20 坐 y=21 石地）,触发格账按盒原点 (10,19) 偏移
  const BX = 10, BY = 19;
  // 原版触发格账（SquareTileFrame :81462-81472 列优先窗扫 × 盒闸,人工逐例推演）：
  // 挖顶左→(X,Y+1) 顶中→(X,Y) 顶右→(X+1,Y) 底左→(X,Y) 底中→(X,Y) 底右→(X+1,Y)
  const TRIG: ReadonlyArray<readonly [number, number, number, number]> = [
    [0, 0, 0, 1], [1, 0, 0, 0], [2, 0, 1, 0],
    [0, 1, 0, 0], [1, 1, 0, 0], [2, 1, 1, 0],
  ];

  for (const [mx, my, tx, ty] of TRIG) {
    it(`挖格 (${mx},${my}) → 整件清 + 恰 1 掉 221 @ 触发格 (${tx},${ty})`, () => {
      const w = mkWorld();
      const st = w.store;
      putForge(st, BX, BY);
      const drops: Drop[] = [];
      const g = breakShell(w, drops);
      g.breakTile(BX + mx, BY + my, true);
      expect(drops.length, '整件恰一次掉落').toBe(1);
      expect(drops[0].n).toBe(1);
      expect(drops[0].key).toBe(HF_VID_KEY);
      boxEmpty(st, BX, BY);
      // 掉落坐标 = Check3x2 触发格（:50120 i*16,j*16,32,32 → 本仓 spawnDrop 惯例 +8/0）
      expect(drops[0].x).toBe((BX + tx) * TILE + 8);
      expect(drops[0].y).toBe((BY + ty) * TILE);
    });
  }

  it('相邻同型他件不连带：挖 B 顶左格,A 完好、掉落格仍在 B 盒（盒闸 TileObject 判异件）', () => {
    const w = mkWorld();
    const st = w.store;
    putForge(st, BX, BY);        // A (10..12, 19..20)
    putForge(st, BX + 3, BY);    // B (13..15, 19..20)——与 A 共边紧贴
    const drops: Drop[] = [];
    const g = breakShell(w, drops);
    g.breakTile(BX + 3, BY, true);   // B 顶左格；窗扫首格 = A 顶右 (12,19)——原版 A 完整→不触发
    expect(drops.length).toBe(1);
    expect(drops[0].key).toBe(HF_VID_KEY);
    boxEmpty(st, BX + 3, BY);
    for (let dx = 0; dx < 3; dx++) for (let dy = 0; dy < 2; dy++) {
      expect(forgeCellOk(st, BX + dx, BY + dy), `A (${BX + dx},${BY + dy}) 应完好`).toBe(true);
    }
    // 触发格 = B 盒内窗扫首格 (13,20)（跨过 A 两格后命中）
    expect(drops[0].x).toBe((BX + 3) * TILE + 8);
    expect(drops[0].y).toBe((BY + 1) * TILE);
  });

  it('失撑级联：底锚中列被挖 → 整件塌 + 单掉 @ 触发格 (10,20)（checkFurnitureSupport 链）', () => {
    const w = mkWorld();
    const st = w.store;
    putForge(st, BX, BY);
    st.setTileSilent(11, 21, 0);   // 中列锚面挖空 → onTileChanged(11,21)
    const drops: Drop[] = [];
    const g = breakShell(w, drops);
    g.checkFurnitureSupport(11, 20);   // 监听位换算 (x, y-1)（Game.ts onTileChanged 挂点）
    expect(drops.length).toBe(1);
    expect(drops[0].key).toBe(HF_VID_KEY);
    boxEmpty(st, BX, BY);
    // 触发格 = 变更格 (11,21) 窗扫内盒首格 (10,20)（列优先 (10,20) 先于 (11,20)）
    expect(drops[0].x).toBe(10 * TILE + 8);
    expect(drops[0].y).toBe(20 * TILE);
  });
});

// ============ ④ 触发格纯函数对拍（SquareTileFrame :81464-81472 序直译） ============
describe('SW-BJ40 ④ multiTileDropTriggerCell 纯函数（列优先序/盒闸/中心跳过）', () => {
  const t = (x: number, y: number) => (x >= 10 && x <= 12 && y >= 10 && y <= 11 ? HF_TILE : 0);
  const a = (x: number, y: number) => t(x, y) !== 0;

  it('挖顶左 → 触发底左（非锚格）', () => {
    expect(multiTileDropTriggerCell(t, a, 10, 10, HF_TILE, 10, 10, 3, 2)).toEqual({ x: 10, y: 11 });
  });
  it('挖底右 → 触发 (11,10)（窗扫先中列后右列）', () => {
    expect(multiTileDropTriggerCell(t, a, 12, 11, HF_TILE, 10, 10, 3, 2)).toEqual({ x: 11, y: 10 });
  });
  it('邻件格不入候选（盒闸）', () => {
    const t2 = (x: number, y: number) =>
      ((x >= 10 && x <= 12) || (x >= 13 && x <= 15)) && y >= 10 && y <= 11 ? HF_TILE : 0;
    const a2 = (x: number, y: number) => t2(x, y) !== 0;
    // 挖 B 顶左 (13,10)：窗扫首两格 (12,10)/(12,11) 属 A → 闸外；触发 B (13,11)
    expect(multiTileDropTriggerCell(t2, a2, 13, 10, HF_TILE, 13, 10, 3, 2)).toEqual({ x: 13, y: 11 });
  });
  it('窗口无同类格 → null（调用方回落锚格）', () => {
    expect(multiTileDropTriggerCell(t, a, 0, 0, HF_TILE, 10, 10, 3, 2)).toBeNull();
  });
});

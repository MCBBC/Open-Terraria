// ★BJ543（2026-10-07 用户实报：挖一个猪猪存钱罐会掉出两个）——多格件挖掘双掉定谳判别测试。
//
// 原版掉落链定谳（1457 亲读）：
//   tile 29 PiggyBank（TileID.cs:495）= 2×1（TileObjectData addTile(29) Style2x1,
//   TileObjectData.cs:2810-2823）。挖半件 → KillTile（WorldGen.cs:64029）掉落段
//   :64374 `if (!noItem && !stopDrops && Main.netMode != 1) KillTile_DropItems` →
//   KillTile_GetItemDrops（:64477）case 29 ∈ :66280-66609 空体组 → dropItem=0
//   【KillTile 零掉落】；尾 SquareTileFrame（:64445）→ TileFrameImportant case 29
//   （:86878）→ Check2x1（:47379）——完整性破 → destroyObject=true（:47507）→
//   逐格 KillTile 两格（:47513/:47516——余格 GetItemDrops 同空体组=级联亦零掉落）
//   → 尾段 `if (type == 29) Item.NewItem(...,87)`（:47662-47665）【整件一次】。
//   同构判例：CheckChest（:58415——GetItemDrop_Chests 先算一次+DestroyChest/KillTile
//   级联+锚点 Item.NewItem 一次）；smashPot 罐（:57276 destroyObject 门同旨）。
//   ⇒ 原版不变式：多格件单破坏事件=音/尘随级联逐格,【掉落恰一次】。
//
// 本仓病灶（BJ543）：breakTile object 锚点支清环（Game.ts breakTileBody `for dx for dy
//   st.setTile(0)`）逐格触发 onTileChanged → checkDecorSquareFrame 3×3 扫（Game.ts:7577
//   生产接线）→ 'table2x1'（29 存钱罐/103 碗/462 沙漠精灵灯,DECOR_SUPPORT_KIND 表）
//   完整性裁决——★SW-RB11d（红队 F2,2026-09-10）把杀向改为【活着的成员格】→
//   killDecorTile → breakTile 重入 → object 支 dropKey 再 spawnDrop = 双掉。
//   （smashPot 注曾载「object 锚点支锚格先清,嵌套 kill 目标格已空=无重复效应」——
//   该断言被 RB11d F2 的杀向改写作废：唯一死格跳过保护对"活成员杀向"失效。）
//
// 落刀（destroyObject 窗等价,Game.ts）：object 清环设 _objectClearBox 窗;killDecorTile
//   对窗内成员格照常 breakTile（尘/音/粒=原版级联 KillTile 效应面逐格保留）,但其
//   object 支掉落被 _memberKillSuppressDrop 压制——掉落权归外层单发（=原版 Check*
//   权威单掉,重入实例只承担成员级联效应）。
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { Game } from '../src/core/Game';
import { TILE_BY_KEY } from '../src/data/tiles';
import { VI } from '../src/data/itemKeys';

type Drop = { key: string; n: number };

/** breakTile+DECOR 级联可驱动面最小桩（shell 形制同 tests/killtile-tail-liquid.test.ts;
 *  补生产 onTileChanged 两监听接线=Game.ts:7570/:7577 同款,否则 DECOR 扫链不致动） */
function mkShell(w: World, drops: Drop[]): Game & Record<string, unknown> {
  const g = Object.create(Game.prototype) as unknown as Game & Record<string, unknown>;
  g.world = w;
  g.chunks = { markDirtyArea: () => {} } as never;
  g.sfx = { play: () => {}, playWavFile: () => {}, playFiles: () => true } as never;
  g.entities = { critters: [], enemies: [], npcs: [], projectiles: [] } as never;
  g.spawnParticles = () => {};
  g.recLog = () => {};
  g.spawnTileDustAt = () => {};
  g.spawnDrop = (_x: number, _y: number, key: string, n: number) => { drops.push({ key, n }); return null; };
  g.achievements = { notifyTileDestroyed: () => {}, handleMining: () => {} } as never;
  g.player = { cx: 10 * 16 + 8, cy: 19 * 16 + 8, equipStats: {} } as never;
  const wiring = g as unknown as { checkFurnitureSupport(x: number, y: number): void; checkDecorSquareFrame(x: number, y: number): void };
  w.store.onTileChanged((x: number, y: number) => wiring.checkFurnitureSupport(x, y - 1));
  w.store.onTileChanged((x: number, y: number) => wiring.checkDecorSquareFrame(x, y));
  return g;
}

const PIG = TILE_BY_KEY['v_29_piggy_bank'];   // tile 29,def w=2 h=1 drop=87
const BOWL = TILE_BY_KEY['v_103_bowls'];      // tile 103,def w=2 h=1
const LAMP = TILE_BY_KEY['v_462_desert_spirit_lamp']; // tile 462,def w=2 h=1
const CHEST = TILE_BY_KEY['chest'];           // tile 21,def w=2 h=2
const PLATFORM = TILE_BY_KEY['platform'];     // tile 19,tileTable（存钱罐合法支撑）
const STONE = TILE_BY_KEY['stone'];           // tile 1 单格
const PIGGY_ITEM_KEY = VI(87);

function placePiggy(st: World['store'], x: number, y: number): void {
  st.setTileSilent(x, y, PIG);
  st.setTileSilent(x + 1, y, PIG);
  st.frameX[st.idx(x + 1, y)] = 18;            // Style2x1 右列帧（fx=col*18）
  st.setTileSilent(x, y + 1, PLATFORM);        // 桌面支撑（tileTable 平台沿=原版本相）
  st.setTileSilent(x + 1, y + 1, PLATFORM);
}

describe('BJ543 多格件破坏单掉不变式（原版 Check* 整件单掉）', () => {
  it('①挖存钱罐左半件 → 猪猪存钱罐物品恰掉 1（整件清,双掉=病灶）', () => {
    const w = new World(40, 260, 11, 'bj543');
    const st = w.store;
    placePiggy(st, 30, 30);
    const drops: Drop[] = [];
    const g = mkShell(w, drops);
    g.breakTile(30, 30, true);                 // 挖左半件（byPlayer=真挖掘路径）
    expect(st.get(30, 30)).toBe(0);            // 整件清（左右两格都空）
    expect(st.get(31, 30)).toBe(0);
    const pigDrops = drops.filter((d) => d.key === PIGGY_ITEM_KEY);
    expect(pigDrops.length).toBe(1);           // ★判别面：原版单掉
  });

  it('①b挖存钱罐右半件 → 同样恰掉 1（杀向=活成员格,两向同病）', () => {
    const w = new World(40, 260, 11, 'bj543');
    const st = w.store;
    placePiggy(st, 30, 30);
    const drops: Drop[] = [];
    const g = mkShell(w, drops);
    g.breakTile(31, 30, true);                 // 挖右半件
    expect(st.get(30, 30)).toBe(0);
    expect(st.get(31, 30)).toBe(0);
    expect(drops.filter((d) => d.key === PIGGY_ITEM_KEY).length).toBe(1);
  });

  it('②宝箱族（21）挖一格 → 箱物品恰掉 1+登记注销（CheckChest 单掉同构,不回归）', () => {
    const w = new World(40, 260, 11, 'bj543');
    const st = w.store;
    st.setTileSilent(20, 30, CHEST);
    st.setTileSilent(21, 30, CHEST);
    st.setTileSilent(20, 31, CHEST);
    st.setTileSilent(21, 31, CHEST);
    st.frameX[st.idx(21, 30)] = 18;
    st.frameY[st.idx(20, 31)] = 18;
    st.frameX[st.idx(21, 31)] = 18;
    st.frameY[st.idx(21, 31)] = 18;
    w.chests = [{ x: 20, y: 30, items: Array.from({ length: 20 }, () => null) }];
    const drops: Drop[] = [];
    const g = mkShell(w, drops);
    g.breakTile(20, 30, true);
    for (const [cx, cy] of [[20, 30], [21, 30], [20, 31], [21, 31]] as const) {
      expect(st.get(cx, cy)).toBe(0);
    }
    expect(drops.length).toBe(1);              // 箱物品单掉（4388 或 def.drop 48,单发即可）
    expect(w.chests.length).toBe(0);           // dumpChest 注销（空箱面）
  });

  it('③普通单格 tile（石块）破坏 → 恰掉 1（1×1 路径不回归）', () => {
    const w = new World(40, 260, 11, 'bj543');
    const st = w.store;
    st.setTileSilent(30, 30, STONE);
    const drops: Drop[] = [];
    const g = mkShell(w, drops);
    g.breakTile(30, 30, true);
    expect(st.get(30, 30)).toBe(0);
    expect(drops.length).toBe(1);              // 石块 3 单掉
  });

  it('④失撑面（挖存钱罐脚下平台）→ 猪猪存钱罐物品仍恰掉 1（支撑级联掉落权不受窗压制）', () => {
    const w = new World(40, 260, 11, 'bj543');
    const st = w.store;
    placePiggy(st, 30, 30);
    const drops: Drop[] = [];
    const g = mkShell(w, drops);
    g.breakTile(30, 31, true);                 // 挖脚下平台（非 object 清环路径）
    expect(st.get(30, 30)).toBe(0);            // 失撑整件塌
    expect(st.get(31, 30)).toBe(0);
    expect(drops.filter((d) => d.key === PIGGY_ITEM_KEY).length).toBe(1);
  });

  it('⑤同族普查·碗（103,table2x1 同 kind）→ 碗物品恰掉 1（同病灶同刀域）', () => {
    const w = new World(40, 260, 11, 'bj543');
    const st = w.store;
    st.setTileSilent(30, 30, BOWL);
    st.setTileSilent(31, 30, BOWL);
    st.frameX[st.idx(31, 30)] = 18;
    st.setTileSilent(30, 31, PLATFORM);
    st.setTileSilent(31, 31, PLATFORM);
    const drops: Drop[] = [];
    const g = mkShell(w, drops);
    g.breakTile(30, 30, true);
    expect(st.get(30, 30)).toBe(0);
    expect(st.get(31, 30)).toBe(0);
    // styleDropVidOfFrames(103,0,0) → Bowls 表 style0 = 356（原版 Check2x1 case 103 :47689）
    expect(drops.filter((d) => d.key === VI(356)).length).toBe(1);
  });

  it('⑥同族普查·沙漠精灵灯（462,table2x1 同 kind）→ 恰掉 1 件（同病灶同刀域）', () => {
    const w = new World(40, 260, 11, 'bj543');
    const st = w.store;
    st.setTileSilent(30, 30, LAMP);
    st.setTileSilent(31, 30, LAMP);
    st.frameX[st.idx(31, 30)] = 18;
    st.setTileSilent(30, 31, PLATFORM);
    st.setTileSilent(31, 31, PLATFORM);
    const drops: Drop[] = [];
    const g = mkShell(w, drops);
    g.breakTile(30, 30, true);
    expect(st.get(30, 30)).toBe(0);
    expect(st.get(31, 30)).toBe(0);
    expect(drops.length).toBe(1);              // 单件（place_v_462 兜底或帧表档,单发即可）
  });
});

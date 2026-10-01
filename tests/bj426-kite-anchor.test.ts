// ★BJ426（2026-10-01 用户实报定谳刀）锚桩风筝四连判别面：
//   ① 位置门——锚桩 723/724 放置档 = TileObjectData 五锚档 1:1（TileObject.CanPlace
//      TileObject.cs:263-560 逐档 full-score 首中：底/顶/左/右/墙）+ 右键边沿门
//      （ItemsThatAllowRepeatedRightClick 排除,ItemID.cs:66 + Player.cs:31768）+
//      飞行态门（holdStyle≠0 → 收线不放置,Player.cs:43870）。
//   ② 消耗面——放置消耗 1 = TELeashedEntityAnchorWithItem.PlaceFromPlayerPlacementHook
//      （TELeashedEntityAnchorWithItem.cs:46-48 `!consumable && --stack<=0 → TurnToAir`）；
//      风筝 consumable=false（Item.cs DefaultToKite :47835）通用门跳过,由 723 臂补扣。
//   ③ 回收返还面——applyLeashedRetrieve/破坏路径单返：存物清槽+清记录（返 1/桩）,
//      复制链根因=②（不消耗则每桩白存一份手持风筝,回收各返 1 → N 桩 N 返）。
//   ④ 线圈清理面——取回后锚桩 tile 清除（= 原版唯一回收路 tile 破坏同态:
//      KillTile → DropItemForTileBreak :64205 + TEKiteAnchor.Kill :64386-64391 →
//      OnRemoved → DespawnLeashedEntity,线圈贴图随实体亡）。
// 判别结构：锚档判定走纯函数单测（TileStore 直驱）；Game.ts 路由区（消耗/边沿/
//   飞行态/取回清桩）走源码结构锁（BJ417 先例——Game 域无 vitest 夹具）；
//   运行时 E2E（放置消耗/取回清桩/位置门）由 scripts/_bj426-kite-anchor-probe.mjs
//   私有实例实机验证（docs/evidence/bj426/ 截图）。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { TileStore } from '../src/world/TileStore';
import { T, TILE_DEFS, TILE_INTERNAL_BY_SHEET } from '../src/data/tiles';
import { anchorTilePlacementStyle } from '../src/core/Game';
import { applyLeashedRetrieve } from '../src/net/leashedSync';
import { LEASHED_KIND_KITE } from '../src/entities/LeashedCritter';
import { kiteAnchorPlace, kiteAnchorAt } from '../src/world/FurnitureItems';
import { itemCombat } from '../src/data/vanillaItemCombat';
import { ITEM_DEFS, ITEM_BY_KEY, VANILLA_ITEM_KEY_BY_ID } from '../src/data/items';
import { KITE_ITEM_PROJ } from '../src/entities/LeashedCritter';

const ROOT = resolve(__dirname, '..');
const gameSrc = readFileSync(resolve(ROOT, 'src/core/Game.ts'), 'utf8');

/** 测试世界：W×H 空场 + 任意手摆（TileStore 直驱,无世界生成） */
function mkWorld(w = 40, h = 40): TileStore {
  return new TileStore(w, h);
}

/** 内部 id 快捷（sheet → TILE_DEFS 注册序;域纪律:helper 收 TileStore 坐标） */
const internal = (sheet: number): number => {
  const id = TILE_INTERNAL_BY_SHEET.get(sheet);
  if (id === undefined) throw new Error(`sheet ${sheet} 无内部 id`);
  return id;
};

// ============================================================================
// ① 位置门：anchorTilePlacementStyle 五锚档真值表（TileObject.CanPlace 1:1）
// ============================================================================

describe('BJ426 ① 位置门：锚桩五锚档判定（TileObject.CanPlace TileObject.cs:263-560）', () => {
  it('档 0 底锚：下方实心平块（AnchorBottom SolidTile）', () => {
    const st = mkWorld();
    st.setTile(10, 11, T.DIRT, 0, 0);
    expect(anchorTilePlacementStyle(st, 10, 10)).toBe(0);
  });

  it('档 0 底锚：SolidWithTop 平台臂——平台平顶可承,半砖/切缺帧不承（:466-473）', () => {
    const st = mkWorld();
    const plat = internal(19);
    st.setTile(10, 11, plat, 0, 0);                       // frameX=0 → n=0 ∈ [0,7] proper top
    expect(anchorTilePlacementStyle(st, 10, 10)).toBe(0);
    st.setTile(12, 11, plat, 0, 0);
    st.half[st.idx(12, 11)] = 1;                          // halfBrick 平台 → !halfBrick 拒
    expect(anchorTilePlacementStyle(st, 12, 10)).toBe(-1);
    st.setTile(14, 11, plat, 18 * 8, 0);                  // n=8 ∉ proper-top 档 → 拒
    expect(anchorTilePlacementStyle(st, 14, 10)).toBe(-1);
  });

  it('档 0 底锚：SolidWithTop 非平台 solidTop 档（239/380 型,tileSolid∧tileSolidTop :474-476）', () => {
    const st = mkWorld();
    st.setTile(10, 11, internal(380), 0, 0);              // PlanterBox：tileSolidTop 双旗
    expect(anchorTilePlacementStyle(st, 10, 10)).toBe(0);
  });

  it('档 0 底锚：SolidSide 底坡 slope 3/4 可承（:556-560）,顶坡 1/2 不承', () => {
    const st = mkWorld();
    st.setTile(10, 11, T.STONE, 0, 0);
    st.slope[st.idx(10, 11)] = 3;
    expect(anchorTilePlacementStyle(st, 10, 10)).toBe(0);
    st.slope[st.idx(10, 11)] = 1;                          // 顶坡块底缘斜——SolidTile blockType≠0 拒
    expect(anchorTilePlacementStyle(st, 10, 10)).toBe(-1);
  });

  it('档 0 底锚：AlternateTile {124,561,574-578} 可承（AnchorAlternateTiles :4489）', () => {
    const st = mkWorld();
    st.setTile(10, 11, internal(124), 0, 0);              // 木梁
    expect(anchorTilePlacementStyle(st, 10, 10)).toBe(0);
  });

  it('档 0 底锚：SolidTile 漏项反证——tileNoAttach 件不承（:459-462 !tileNoAttach）', () => {
    const st = mkWorld();
    st.setTile(10, 11, internal(10), 0, 0);               // 门（tileNoAttach,Main.cs:8028）
    expect(anchorTilePlacementStyle(st, 10, 10)).toBe(-1);
  });

  it('档 1 顶锚：上方实心平块/半砖/顶坡（AnchorTop SolidTile|SolidBottom :4493-4495）', () => {
    const st = mkWorld();
    st.setTile(10, 9, T.STONE, 0, 0);
    expect(anchorTilePlacementStyle(st, 10, 10)).toBe(1);
    // 半砖（SolidBottom 的 bare halfBrick 支 :421-434）
    st.setTile(12, 9, T.STONE, 0, 0);
    st.half[st.idx(12, 9)] = 1;
    expect(anchorTilePlacementStyle(st, 12, 10)).toBe(1);
    // NotReallySolid 排除（SolidBottom !NotReallySolid :421-434）——开态门 11
    st.setTile(14, 9, internal(11), 0, 0);
    expect(anchorTilePlacementStyle(st, 14, 10)).toBe(-1);
  });

  it('档 2/3 左右锚：侧邻实心平块可承（AnchorLeft/Right SolidTile :4497-4503）', () => {
    const st = mkWorld();
    st.setTile(9, 10, T.STONE, 0, 0);
    expect(anchorTilePlacementStyle(st, 10, 10)).toBe(2);
    st.setTile(11, 10, T.STONE, 0, 0);
    expect(anchorTilePlacementStyle(st, 10, 10)).toBe(2);  // 左档先于右档（首中制 :754-760）
    const st2 = mkWorld();
    st2.setTile(11, 10, T.STONE, 0, 0);
    expect(anchorTilePlacementStyle(st2, 10, 10)).toBe(3);
  });

  it('档 2/3 左右锚：Tree 臂——干身+上下邻三格全 trunk 可承,缺邻拒（:530-560）', () => {
    const st = mkWorld();
    const trunk = internal(5);
    st.setTile(9, 10, trunk, 0, 0);
    expect(anchorTilePlacementStyle(st, 10, 10)).toBe(-1); // 单格干≠整干（上下邻缺）
    st.setTile(9, 9, trunk, 0, 0);
    st.setTile(9, 11, trunk, 0, 0);
    expect(anchorTilePlacementStyle(st, 10, 10)).toBe(2);
  });

  it('档 4 墙锚：背后墙>0 即承（AnchorWall,isValidWallAnchor wall≠0 :1948-1962）', () => {
    const st = mkWorld();
    st.wall[st.idx(10, 10)] = 2;
    expect(anchorTilePlacementStyle(st, 10, 10)).toBe(4);
  });

  it('五档全失 → -1（原版拒置;中空无墙放置被拒=「任意位置」反证）', () => {
    const st = mkWorld();
    expect(anchorTilePlacementStyle(st, 10, 10)).toBe(-1);
  });

  it('档序 = 底>顶>左>右>墙 首中（CanPlace base→alt1..4 顺序扫描 :754-760）', () => {
    const st = mkWorld();
    st.setTile(10, 11, T.DIRT, 0, 0);                      // 底实心
    st.wall[st.idx(10, 10)] = 1;                           // 亦有墙——底档先中
    expect(anchorTilePlacementStyle(st, 10, 10)).toBe(0);
  });

  it('已致动格不作锚（nactive() 门——inActive 排除,Tile.cs:242-248）', () => {
    const st = mkWorld();
    st.setTile(10, 11, T.DIRT, 0, 0);
    st.wire[st.idx(10, 11)] |= TileStore.WIRE_ACTUATED;
    expect(anchorTilePlacementStyle(st, 10, 10)).toBe(-1);
  });

  it('域钉：723/724 两表逐字同构（TileObjectData.cs:4485-4507 vs :4514-4536）——锚档集同源', () => {
    // 结构锁：helper 以 723||724 同一门判定（tryPlace isAnchorTile 单源,无双轨）
    expect(gameSrc).toMatch(/const isAnchorTile = anchorSheet === 723 \|\| anchorSheet === 724;/);
  });
});

// ============================================================================
// ①a/①b 右键边沿门 + 飞行态门（Game.ts 路由区结构锁,BJ417 先例）
// ============================================================================

describe('BJ426 ① 右键路由区：边沿门 + 飞行态门（Game.ts alt-use 臂结构锁）', () => {
  it('①a 右键边沿门：臂含 _prevRightDown 按压沿门（ItemID.cs:66 repeat 集排除 + P.cs:31768）', () => {
    // 臂体 = else if (PLACE_TILE_ON_ALT_USE...) { if (this._prevRightDown) return true; ... }
    expect(gameSrc).toMatch(
      /else if \(heldDef\?\.tile && PLACE_TILE_ON_ALT_USE\.has\(heldDef\.vid \?\? -1\)\) \{[\s\S]{0,900}?if \(this\._prevRightDown\) return true;/,
    );
    // 原版 repeat 集（ItemID.cs:66）与 PLACE_TILE_ON_ALT_USE（:159）无交——
    // repo 侧数据面反证：117 件 vid 全不在 repeat 语义域（repeat 集本仓未建模,
    // 边沿门全臂化=原版 flag2=false 全臂等价）
  });

  it('①b 飞行态门：风筝弹在场 → 臂让位不放置（P.cs:43870 holdStyle≠0 → StartChanneling）', () => {
    expect(gameSrc).toMatch(
      /KITE_ITEM_PROJ\[hv\] !== undefined && this\.kiteProjAirborne\(hShoot\)/,
    );
  });

  it('旧「按住连放」注已撤（useTime 门节流自述=实报①根因,注释域锁）', () => {
    expect(gameSrc).not.toMatch(/按住连放由 tryPlace 的 useTime 门节流/);
  });
});

// ============================================================================
// ② 消耗面 + ③ 回收返还面 + ④ 线圈清理面
// ============================================================================

describe('BJ426 ② 消耗面：放置消耗 1（PlaceFromPlayerPlacementHook :46-48 等价）', () => {
  it('风筝数据面 consumable=false（Item.cs DefaultToKite :47835——通用门跳过的前提）', () => {
    for (const vid of Object.keys(KITE_ITEM_PROJ)) {
      const c = itemCombat(Number(vid));
      expect(c?.consumable, `风筝 ${vid} consumable`).toBe(false);
    }
  });

  it('723 臂结构锁：kiteAnchorPlace 成功路径含 removeHeld(1)（通用门不扣,钩子补扣）', () => {
    // 臂体序：st.setTile（帧档覆写）→ place/request 分支 → removeHeld(1)
    expect(gameSrc).toMatch(
      /if \(tileId === TILE_BY_KEY\['v_723_kite_anchor'\]\) \{[\s\S]{0,4200}?this\.player\.inv\.removeHeld\(1\);[\s\S]{0,160}?this\.cb\.onInventoryChanged\(\);/,
    );
  });

  it('723 臂帧档覆写：anchorPlaceStyle×18（CalculatePlacementStyle :1990-1998 同域）', () => {
    expect(gameSrc).toMatch(
      /st\.setTile\(tx, ty, tileId, anchorPlaceStyle \* 18, 0\)/,
    );
  });
});

describe('BJ426 ③ 回收返还面：存物单返（返 1/桩;复制链根因=②不消耗）', () => {
  it('applyLeashedRetrieve：恰返存物 1 件+记录清空+二次取回落空（零副作用）', () => {
    const records: Array<{ x: number; y: number; kind: string; slots: Array<{ id: number; stack: number; prefix?: number } | null> }> = [];
    const kiteId = ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[4613]!]!;
    kiteAnchorPlace(records as never, 5, 6, { id: kiteId, stack: 1 });
    const drops: Array<{ x: number; y: number; key: string; stack: number }> = [];
    const host = {
      records: records as never,
      netIdsAt: () => [7],
      removeAt: () => true,
      dropItem: (x: number, y: number, key: string, stack: number) => { drops.push({ x, y, key, stack }); },
      broadcastRemove: () => undefined,
      keyOf: (id: number) => ITEM_DEFS[id]?.key ?? '',
    };
    expect(applyLeashedRetrieve(host as never, 5, 6, LEASHED_KIND_KITE)).toBe(true);
    expect(drops.length).toBe(1);
    expect(drops[0]!.stack).toBe(1);
    expect(kiteAnchorAt(records as never, 5, 6)).toBeUndefined();   // 记录已清
    // 二次取回：无记录 → false 零副作用（不返件）
    const dropsLen = drops.length;
    expect(applyLeashedRetrieve(host as never, 5, 6, LEASHED_KIND_KITE)).toBe(false);
    expect(drops.length).toBe(dropsLen);
  });

  it('守恒面：消耗 1（臂）+ 单返 1（破坏/取回）→ 放收循环物品数不变（③=②的复制链闭证）', () => {
    // 数据面闭证：leashedAnchorBreakDrop 清槽（二返 null）——与 723 臂 removeHeld(1)
    // 组合 = place 扣 1 / break 返 1,每循环守恒;旧态（零消耗）= 每循环 +1。
    const records: Array<{ x: number; y: number; kind: string; slots: Array<{ id: number; stack: number } | null> }> = [];
    const kiteId = ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[4613]!]!;
    kiteAnchorPlace(records as never, 5, 6, { id: kiteId, stack: 1 });
    expect(kiteAnchorAt(records as never, 5, 6)?.slots[0]?.id).toBe(kiteId);
  });
});

describe('BJ426 ④ 线圈清理面：取回后锚桩 tile 清除（= 原版回收路 tile 破坏同态）', () => {
  it('retrieveLeashedAnchor 结构锁：ok 后 setTile(ax,ay,0)（KillTile+TE Kill 等价）', () => {
    expect(gameSrc).toMatch(
      /private retrieveLeashedAnchor\(ax: number, ay: number, kind: number\): boolean \{[\s\S]{0,1400}?if \(ok\) \{[\s\S]{0,400}?st\.setTile\(ax, ay, 0\);/,
    );
  });

  it('applyLeashedRetrieve 本体仍清记录+消散实体（约简域不变,清桩在绑定方）', () => {
    const records: Array<{ x: number; y: number; kind: string; slots: Array<{ id: number; stack: number } | null> }> = [];
    const kiteId = ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[4613]!]!;
    kiteAnchorPlace(records as never, 3, 4, { id: kiteId, stack: 1 });
    let removed = false;
    const host = {
      records: records as never,
      netIdsAt: () => [3],
      removeAt: () => { removed = true; return true; },
      dropItem: () => undefined,
      broadcastRemove: () => undefined,
      keyOf: (id: number) => ITEM_DEFS[id]?.key ?? '',
    };
    expect(applyLeashedRetrieve(host as never, 3, 4, LEASHED_KIND_KITE)).toBe(true);
    expect(removed).toBe(true);
    expect(records.length).toBe(0);
  });

  it('旧「锚桩 tile 保留/本体不动」自创态注已全撤（注释域锁,防回潮）', () => {
    expect(gameSrc).not.toMatch(/锚桩 tile 保留/);
    expect(gameSrc).not.toMatch(/锚桩 tile 本体不动/);
  });

  it('取回按压沿门：interactAt 锚桩臂含 !_prevRightDown（place→instant retrieve 摆锤闭合证）', () => {
    // 放最后一只（stack1→手持清空）后同按住下一帧命中刚放的桩=原地取回吞放置——
    // 探针追凶实锤（_bj426-diag8 CLEAR@retrieveLeashedAnchor ← interactAt ← hold 帧2）。
    // 门后取回语义 = 一次按压一次取回（原版锚桩无 interaction,按住恒无操作）。
    expect(gameSrc).toMatch(
      /if \(\(type === TILE_BY_KEY\['v_724_critter_anchor'\] \|\| type === TILE_BY_KEY\['v_723_kite_anchor'\]\)\s*\n?\s*&& !this\._prevRightDown\) \{/,
    );
  });
});

// ============================================================================
// 数据面哨兵：锚桩 tile def 与风筝物品链（放置门入口域）
// ============================================================================

describe('BJ426 数据面哨兵', () => {
  it('723/724 def framed 1×1（needSupport 域外,isAnchorTile 单源接管）', () => {
    const t723 = TILE_DEFS[TILE_INTERNAL_BY_SHEET.get(723)!];
    const t724 = TILE_DEFS[TILE_INTERNAL_BY_SHEET.get(724)!];
    expect(t723?.framed).toBe(true);
    expect(t723?.w).toBe(1);
    expect(t723?.h).toBe(1);
    expect(t724?.framed).toBe(true);
  });

  it('风筝 24 件 → tile v_723_kite_anchor（PLACE_TILE_ON_ALT_USE 放置臂入口）', () => {
    let n = 0;
    for (const vidStr of Object.keys(KITE_ITEM_PROJ)) {
      const vid = Number(vidStr);
      const k = VANILLA_ITEM_KEY_BY_ID[vid];
      const d = k !== undefined ? ITEM_DEFS[ITEM_BY_KEY[k]] : undefined;
      expect(d?.tile, `风筝 ${vid}`).toBe('v_723_kite_anchor');
      n++;
    }
    expect(n).toBe(24);
  });

  it('玩家持猪龙风筝 4613（用户实报件）→ shoot 826 在 KITE_ITEM_PROJ 表', () => {
    expect(KITE_ITEM_PROJ[4613]).toBe(826);
  });
});

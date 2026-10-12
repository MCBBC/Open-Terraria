// ★BJ657 FindGoodRestingSpot 同族宽化收编（BJ656 登记债 D1 清偿,2026-10-12）。
//
// 【定谳】原版 NPC.SolidOrSlopedTileOrPlatform（NPC.cs:53335-53343,亲读 1457）：
//   active ∧ (tileSolid∧!tileSolidTop ∨ TileID.Sets.Platforms) ∧ !inActive。
//   Platforms = TileID.cs:243 CreateBoolSet(19,427,435,436,437,438,439)【七件】。
//   唯一消费面 = AI_007_FindGoodRestingSpot 地板下探 :53352（椅搜 :53363+ 走
//   CanBeSatOnForNPCs 不经本谓词;:53363 面是城镇史莱姆/ai0==5 跳过门）。
// 【病】本仓 findChairSpot（TownNPC.ts:166）/restFloor（:3196）旧谓词
//   isSolid∪isPlatform 多计 {239,380}（tileSolid∩tileSolidTop 双 true 但不在
//   Platforms）+ 84 件家具顶（桌14/铁砧16/工作台18 等原版 tileSolid=false,
//   isPlatform frameY==0 可站面）→ 地板下探在家具顶提前停=假地板（原版语义：
//   家具顶不是地板,下探穿透至真实地面行）;假地板还使椅搜扫描窗错锚=漏椅。
//   ★isVanillaTileSolid（BJ656 九件套）含 239/380 同样宽化——本谓词必须独立
//   七件（TileStore.TILE_ID_PLATFORMS）,勿混用。
// 【判别】T2 家具顶排除（旧谓词 isPlatform 恒 true=恰红）;T3/T3b restFloor
//   家具顶/{239,380} 穿透（旧谓词停假地板行=恰红）;T4 七件 vs 九件套差异面
//   对拍;T5 findChairSpot 家具顶假地板漏椅（旧谓词恒 null=恰红）;
//   T7 平台地板保真（8-31 向导楼梯案同相,防收刀过窄）。
// 【变异】M1 findChairSpot 回旧 isSolid∪isPlatform → T5 恰红（T1/T2 保绿）;
//         M2 restFloor 回旧式 → T3/T3b 恰红;
//         M3 平台臂换九件套 PLATFORM_SOLID2_SHEETS → T4 恰红;
//         M4 摘致动门（WIRE_ACTUATED）→ T6 恰红。
//         逐字节还原+sha256 对拍。
import { describe, it, expect } from 'vitest';
import { TownNPC, findChairSpot } from '../src/entities/TownNPC';
import { TileStore } from '../src/world/TileStore';
import { TILE_BY_KEY, TILE_DEFS } from '../src/data/tiles';

const PLAT = TILE_BY_KEY['platform']!;       // sheet 19（Platforms 首领）
const DIRT = TILE_BY_KEY['dirt']!;
const WOOD = TILE_BY_KEY['wood']!;
const TABLE = TILE_BY_KEY['table']!;         // sheet 14 platform:true solid:false
const WORKBENCH = TILE_BY_KEY['workbench']!; // sheet 18 同上
const ANVIL = TILE_BY_KEY['anvil']!;         // sheet 16 同上
const CHAIR = TILE_BY_KEY['chair']!;         // sheet 15（isSitTile 面,非本谓词族）

/** 夹具世界：60×90（下探界 st.h-20=70 > 场景行 44）;高世界防下探触底假停 */
function makeStore(): TileStore {
  return new TileStore(60, 90);
}

/** TILE_DEFS 内 vanilla.sheet 反查 repo id（239/380/团队平台无速记键） */
function idBySheet(sh: number): number {
  const i = TILE_DEFS.findIndex((d) => d?.vanilla?.sheet === sh);
  expect(i, `vanilla sheet ${sh} 应有本仓 def`).toBeGreaterThan(-1);
  return i;
}

describe('BJ657 isSolidOrSlopedTileOrPlatform 谓词锁（=NPC.cs:53335-53343 七件式）', () => {
  it('T1 Platforms 七件逐项计入地板（TileID.cs:243 全量）', () => {
    for (const sh of [19, 427, 435, 436, 437, 438, 439]) {
      const st = makeStore();
      st.setTileSilent(20, 30, idBySheet(sh));
      expect(st.isSolidOrSlopedTileOrPlatform(20, 30),
        `sheet ${sh} 应计地板`).toBe(true);
    }
  });

  it('T2 家具顶排除（旧 isPlatform 宽化面;原版 tileSolid=false 不当地板）+实心对照', () => {
    for (const [key, id] of [['table', TABLE], ['workbench', WORKBENCH], ['anvil', ANVIL]] as const) {
      expect(TILE_DEFS[id]?.platform, `${key} fixture 须 platform:true`).toBe(true);
      const st = makeStore();
      st.setTileSilent(20, 30, id);       // frameY=0=底行可站顶（isPlatform 会计）
      expect(st.isSolidOrSlopedTileOrPlatform(20, 30),
        `${key} 家具顶不是地板（下探须穿透）`).toBe(false);
    }
    const st = makeStore();
    st.setTileSilent(20, 30, DIRT);
    st.setTileSilent(21, 30, WOOD);
    expect(st.isSolidOrSlopedTileOrPlatform(20, 30)).toBe(true);
    expect(st.isSolidOrSlopedTileOrPlatform(21, 30)).toBe(true);
  });

  it('T4 七件 vs 九件套差异面对拍：239/380 isVanillaTileSolid=true 但本谓词=false', () => {
    for (const sh of [239, 380]) {
      const st = makeStore();
      st.setTileSilent(20, 30, idBySheet(sh));
      expect(st.isVanillaTileSolid(20, 30),
        `sheet ${sh} 九件套 tileSolid 真表计入（BJ656 面,对照锚）`).toBe(true);
      expect(st.isSolidOrSlopedTileOrPlatform(20, 30),
        `sheet ${sh} 不在 TileID.Sets.Platforms——FindGoodRestingSpot 不当地板`).toBe(false);
    }
    // 七件对照：两谓词同 true（子集⊆全集）
    for (const sh of [19, 427]) {
      const st = makeStore();
      st.setTileSilent(20, 30, idBySheet(sh));
      expect(st.isVanillaTileSolid(20, 30), `sheet ${sh} 九件套计入`).toBe(true);
      expect(st.isSolidOrSlopedTileOrPlatform(20, 30), `sheet ${sh} 七件计入`).toBe(true);
    }
  });

  it('T6 nactive() 门：幽灵格/已致动不计（原版 active()∧!inActive() 同相）', () => {
    const st = makeStore();
    const i = st.idx(20, 30);
    st.type[i] = PLAT; st.flags[i] = 0;               // 幽灵保域残型（flags=0,type≠0）
    expect(st.isSolidOrSlopedTileOrPlatform(20, 30)).toBe(false);
    st.flags[i] = 1;
    expect(st.isSolidOrSlopedTileOrPlatform(20, 30)).toBe(true);
    st.wire[i] |= TileStore.WIRE_ACTUATED;            // 致动器缩入 → inActive
    expect(st.isSolidOrSlopedTileOrPlatform(20, 30)).toBe(false);
    st.wire[i] &= ~TileStore.WIRE_ACTUATED;
    // 实心致动同门（isSolid 臂 + 平台臂都拒——原版对整 tile 判 !inActive）
    st.type[i] = DIRT;
    st.wire[i] |= TileStore.WIRE_ACTUATED;
    expect(st.isSolidOrSlopedTileOrPlatform(20, 30)).toBe(false);
  });
});

// ============ findChairSpot/restFloor 场景锁（地板下探穿透判别） ============

/** 场景列：行 40 家具/平台悬浮件,行 44 真实地面;home 站格 (30,38) */
function setupColumn(st: TileStore, hover: number): void {
  st.setTileSilent(30, 40, hover);
  st.setTileSilent(30, 44, DIRT);
}

type Rest = { x: number; y: number } | null;

function restFloorOf(st: TileStore, homeY = 38): Rest {
  const npc = new TownNPC('town_slime_cool', 30 * 16 + 8, homeY * 16);
  npc.home = { x: 30, y: homeY };
  // restFloor 仅读 world.store（:3191-3199 头段 home/anchor + store）——裸 store 够用
  return (npc as unknown as { restFloor(w: { store: TileStore }): Rest })
    .restFloor({ store: st });
}

describe('BJ657 地板下探场景锁（restFloor/findChairSpot 换道判别）', () => {
  it('T3 restFloor 桌顶穿透：假地板行 40 不停,锚真实地面行 44（旧谓词停 40=恰红）', () => {
    const st = makeStore();
    setupColumn(st, TABLE);
    expect(restFloorOf(st)).toEqual({ x: 30, y: 44 });
  });

  it('T3b restFloor {239,380} 穿透：矿锭架/花盆箱不当地板（旧 isPlatform 显式计=恰红）', () => {
    for (const sh of [239, 380]) {
      const st = makeStore();
      setupColumn(st, idBySheet(sh));
      expect(restFloorOf(st), `sheet ${sh} 下探须穿透至真实地面`).toEqual({ x: 30, y: 44 });
    }
  });

  it('T5 findChairSpot 家具顶假地板漏椅：椅顶 42 只有真地面锚（fy=44）才收（旧谓词恒 null=恰红）', () => {
    const st = makeStore();
    setupColumn(st, TABLE);
    st.setTileSilent(28, 42, CHAIR);   // frameY=0=椅上格;归一 ry=42+2=44
    // 旧谓词 fy 停 40 → 扫描窗 {34..42},椅行 42 被 r+1<=fy+2(42) 拒 → null
    expect(findChairSpot(st, 30, 38)).toEqual({ x: 28, y: 44 });
  });

  it('T7 平台地板保真（8-31 向导楼梯案同相）：Platforms 七件是地板,下探即停', () => {
    const st = makeStore();
    setupColumn(st, PLAT);
    expect(restFloorOf(st)).toEqual({ x: 30, y: 40 });   // 平台行 40 = 地板（防收刀过窄）
  });

  it('T8 全空气列：下探触底界返回（基线不变;st.h-20=70）', () => {
    const st = makeStore();
    expect(restFloorOf(st)).toEqual({ x: 30, y: 70 });
  });
});

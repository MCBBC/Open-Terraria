// SW-BE1 2026-09-06：平台放置自动斜放+邻居联动（用户实报"放置平台始终水平"）。
// 原版链 = PlaceThing_Tiles_PlaceIt（Player.cs:40477）→ SpinSmartPlatform
// （:40989-41086）+ GetSmartPlatformSlope（:41087-41146）+ WorldGen.SlopeTile
// （WorldGen.cs:82045-82078）；1458 全等（P.cs:40987-41084,仅行移）。
// ★原版门 = TileID.Sets.Platforms(createTile) 且 Main.SmartCursorIsUsed
// （Main.cs:2985 ≡ SmartCursorWanted）——智能光标关闭时原版【恒平放】（斜坡靠锤
// 整形,SW-AW1b 面）；此前本段整缺=智能光标态放置也恒平。
// slope 编码：1=左高(下行向右) 2=右高（TileCollision.ts:199 同码,SmoothWorld
// WorldGen.cs:16542/:16553 对角几何同证）。
// 测法：真实 tryPlace 链（Game 壳,ghost-place-swap 同款）+ 邻位矩阵/联动/回平/
// 门控/语义零变/与锤循环（SW-AW1b 等价步进）零冲突。
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { Game } from '../src/core/Game';
import { ITEM_DEFS } from '../src/data/items';
import { TILE_BY_KEY, TILE_DEFS } from '../src/data/tiles';
import type { TileStore } from '../src/world/TileStore';

const TILE = 16;
const PLAT = TILE_BY_KEY['platform']!;
const STONE = TILE_BY_KEY['stone']!;
const CHEST = TILE_BY_KEY['chest']!;
const PLAT_ITEM = ITEM_DEFS.find((d) => d.tile === 'platform');
const PLAT_VID = PLAT_ITEM ? ITEM_DEFS.indexOf(PLAT_ITEM) : -1;

type PlatItem = typeof ITEM_DEFS[number];

interface Shell {
  tryPlace(tx: number, ty: number, def: PlatItem): void;
  player: { useTime: number };
}

/** Game 壳（ghost-place-swap.test 同款）：只接 tryPlace 链消费面。
 *  smart = smartCursor.wanted（≡ Main.SmartCursorIsUsed,Main.cs:2985）；
 *  plays/dusts/consumed = 音/尘/消耗记录（sfx.play/spawnParticles/removeHeld 桩） */
function shell(w: World, o: { smart?: boolean; plays?: string[]; dusts?: number[]; consumed?: number[] } = {}): Shell {
  const g = Object.create(Game.prototype) as unknown as Record<string, unknown> & Shell;
  g.world = w;
  g.chunks = { markDirtyArea: () => {} };
  g.sfx = { play: (k: string) => { o.plays?.push(k); } };
  g.cb = { onInventoryChanged: () => {} };
  g.input = {};
  g.entities = { critters: [], enemies: [], npcs: [], projectiles: [] };
  g.remotePlayerProxies = [];
  g.smartCursor = { wanted: o.smart ?? true, showing: false };
  g.spawnParticles = () => { o.dusts?.push(1); };
  g.recLog = () => {};
  g.spawnDrop = () => {};
  g.achievements = { notifyTileDestroyed: () => {}, handleMining: () => {} };
  g.player = {
    // 站位：目标行 y=20 在射程盒内（inTileRange,原版 IsTargetTileInItemRange）
    cx: 10 * TILE + 8, cy: 16 * TILE + 8, x: 10 * TILE + 2, y: 16 * TILE, w: 12, h: 28,
    facing: 1, useTime: 0, attackSpeedMult: 1, dead: false, gfxOffY: 0,
    buffs: { has: () => false }, equipStats: {},
    inv: {
      selected: 0,
      slots: [{ id: PLAT_VID, stack: 5 }],
      heldItem: () => ({ id: PLAT_VID, stack: 5 }),
      removeAt: () => {},
      removeHeld: () => { o.consumed?.push(1); },
    },
  } as unknown as Shell['player'] & Record<string, unknown>;
  return g;
}

function mkWorld(): { w: World; st: TileStore } {
  const w = new World(40, 40, 7, 'sw-be1');
  return { w, st: w.store as TileStore };
}

/** 既有平台（跳过放置链,只布邻位）;place 支撑/断言辅助 */
function setPlat(st: TileStore, x: number, y: number): void {
  st.setTileSilent(x, y, PLAT);
}
function setStone(st: TileStore, x: number, y: number): void {
  st.setTileSilent(x, y, STONE);
}
function slopeAt(st: TileStore, x: number, y: number): number {
  return st.slope[st.idx(x, y)];
}

describe('SW-BE1 平台放置自动斜放（SpinSmartPlatform Player.cs:40989-41086,1457）', () => {
  it('原版门：智能光标关（SmartCursorIsUsed=false）→ 有邻平台也恒平放（:40991-40994）', () => {
    const { w, st } = mkWorld();
    setPlat(st, 9, 20);                       // 左横邻平台（若开智能光标会被尾段取消,但门先关）
    shell(w, { smart: false }).tryPlace(10, 20, PLAT_ITEM!);
    expect(st.type[st.idx(10, 20)]).toBe(PLAT);
    expect(slopeAt(st, 10, 20)).toBe(0);      // 平放
    expect(slopeAt(st, 9, 20)).toBe(0);       // 旧台不动
  });

  it('孤立放置（3×3 无平台）→ 平（:40996-41007 早退）；放置语义零变（帧/消耗/音）', () => {
    const { w, st } = mkWorld();
    setStone(st, 10, 21);                     // 支撑（SolidTile2 下行,不参与斜向计分）
    const plays: string[] = [], consumed: number[] = [];
    const g = shell(w, { smart: true, plays, consumed });
    g.tryPlace(10, 20, PLAT_ITEM!);
    expect(st.type[st.idx(10, 20)]).toBe(PLAT);
    expect(st.flags[st.idx(10, 20)]).toBe(1);
    expect(st.frameX[st.idx(10, 20)]).toBe(0);
    expect(st.frameY[st.idx(10, 20)]).toBe(0);          // case 19: frameY = 18*style,style 0
    expect(slopeAt(st, 10, 20)).toBe(0);                // 孤立恒平
    expect(consumed.length).toBe(1);                    // 消耗门不变
    expect(plays.filter((k) => k === 'place').length).toBe(1);
    expect(plays.filter((k) => k === 'dig').length).toBe(0);   // 无联动=无 SlopeTile 音
    expect(g.player.useTime).toBeGreaterThanOrEqual(1);        // ApplyItemTime 不变
  });

  it('placeStyle 2 → frameY=36（WorldGen.PlaceTile case 19 :60712-60716 `tile.frameY = 18*style`）', () => {
    const { w, st } = mkWorld();
    setStone(st, 10, 21);
    shell(w).tryPlace(10, 20, { ...PLAT_ITEM!, placeStyle: 2 });
    expect(st.frameY[st.idx(10, 20)]).toBe(36);
    expect(slopeAt(st, 10, 20)).toBe(0);      // 孤立仍平
  });

  it('上左平台 (x-1,y-1) → 新台 slope1 + 【旧台联动改斜】slope1（:41019-41037 上对角链）', () => {
    const { w, st } = mkWorld();
    setPlat(st, 9, 19);                       // 上左平台
    setStone(st, 10, 21);                     // 支撑
    const plays: string[] = [], dusts: number[] = [];
    shell(w, { plays, dusts }).tryPlace(10, 20, PLAT_ITEM!);
    expect(slopeAt(st, 10, 20)).toBe(1);      // 新台自斜（GetSmartPlatformSlope=1）
    expect(slopeAt(st, 9, 19)).toBe(1);       // 旧台被联动改斜（双方联动）
    // 新台自斜 noEffects:true=无尘；旧台联动 noEffects:false=有尘；两拍都播 dig（:82057 恒播）
    expect(dusts.length).toBe(1);
    expect(plays.filter((k) => k === 'dig').length).toBe(2);
  });

  it('上右平台 (x+1,y-1) → 新台 slope2 + 旧台联动 slope2', () => {
    const { w, st } = mkWorld();
    setPlat(st, 11, 19);
    setStone(st, 10, 21);
    shell(w).tryPlace(10, 20, PLAT_ITEM!);
    expect(slopeAt(st, 10, 20)).toBe(2);
    expect(slopeAt(st, 11, 19)).toBe(2);
  });

  it('下左平台 (x-1,y+1) → 新台 slope2 + 旧台联动 slope2（:41038-41049 下对角链）', () => {
    const { w, st } = mkWorld();
    setPlat(st, 9, 21);
    setStone(st, 10, 21);                     // 支撑（下行实心不参与左右计分）
    shell(w).tryPlace(10, 20, PLAT_ITEM!);
    expect(slopeAt(st, 10, 20)).toBe(2);
    expect(slopeAt(st, 9, 21)).toBe(2);       // 下对角旧台联动
  });

  it('下右平台 (x+1,y+1) → 新台 slope1 + 旧台联动 slope1', () => {
    const { w, st } = mkWorld();
    setPlat(st, 11, 21);
    setStone(st, 10, 21);
    shell(w).tryPlace(10, 20, PLAT_ITEM!);
    expect(slopeAt(st, 10, 20)).toBe(1);
    expect(slopeAt(st, 11, 21)).toBe(1);
  });

  it('实心计分仅在有平台锚时参与：纯实心邻 → 平（:40996-41007 早退,3×3 无平台）', () => {
    const { w, st } = mkWorld();
    setStone(st, 9, 20);                      // 仅左实心（非平台）——早退,不平坡
    shell(w).tryPlace(10, 20, PLAT_ITEM!);
    expect(slopeAt(st, 10, 20)).toBe(0);
  });

  it('实心计分（:41109-41116 SolidTile）：左上+左下平台 → 平（平票）；+左实心 → slope1（反侧镜像 → slope2）', () => {
    {
      const { w, st } = mkWorld();
      setPlat(st, 9, 19);                     // 左上平台 → num=1
      setPlat(st, 9, 21);                     // 左下平台 → num2=1
      setStone(st, 10, 21);                   // 支撑（下行不参与左右计分）
      shell(w).tryPlace(10, 20, PLAT_ITEM!);
      expect(slopeAt(st, 10, 20)).toBe(0);    // 1:1 平票 → 平
      expect(slopeAt(st, 9, 19)).toBe(0);     // 平放段无横邻 → 零联动
      expect(slopeAt(st, 9, 21)).toBe(0);
    }
    {
      const { w, st } = mkWorld();
      setPlat(st, 9, 19);
      setPlat(st, 9, 21);
      setStone(st, 9, 20);                    // +左实心 → num=2 > num2=1
      setStone(st, 10, 21);
      shell(w).tryPlace(10, 20, PLAT_ITEM!);
      expect(slopeAt(st, 10, 20)).toBe(1);    // 实心入分定斜向
      expect(slopeAt(st, 9, 19)).toBe(1);     // 上对角链联动
      expect(slopeAt(st, 9, 21)).toBe(0);     // 下对角链只沿 slope1 的右下臂,左下不动
    }
    {
      const { w, st } = mkWorld();
      setPlat(st, 11, 19);
      setPlat(st, 11, 21);
      setStone(st, 11, 20);                   // 右实心 → num2=2 > num=1
      setStone(st, 10, 21);
      shell(w).tryPlace(10, 20, PLAT_ITEM!);
      expect(slopeAt(st, 10, 20)).toBe(2);
      expect(slopeAt(st, 11, 19)).toBe(2);    // slope2 的右上上对角臂联动
      expect(slopeAt(st, 11, 21)).toBe(0);
    }
  });

  it('横邻平台 (x±1,y) → 平（:41131-41144 尾段取消,成排横铺不斜）', () => {
    const { w, st } = mkWorld();
    setPlat(st, 9, 20);
    shell(w).tryPlace(10, 20, PLAT_ITEM!);
    expect(slopeAt(st, 10, 20)).toBe(0);
    expect(slopeAt(st, 9, 20)).toBe(0);       // 平斜台=0,回平臂不触发（sl!==0 门）
  });

  it('回平联动：横邻旧斜台(slope1)被新平放拍回 0（:41050-41085）;进位格已有 slope1 平台则保留', () => {
    {
      const { w, st } = mkWorld();
      setPlat(st, 9, 20);
      st.setSlope(9, 20, 1);                  // 旧台锤过的斜台
      shell(w).tryPlace(10, 20, PLAT_ITEM!);
      expect(slopeAt(st, 10, 20)).toBe(0);    // 新台平（横邻取消）
      expect(slopeAt(st, 9, 20)).toBe(0);     // ★旧斜台被拍平（SlopeTile(x±1,y,0)）
    }
    {
      const { w, st } = mkWorld();
      setPlat(st, 9, 20);
      st.setSlope(9, 20, 1);
      setPlat(st, 10, 21);                    // 进位格 (slope1?右下:左下) 已有 slope1 平台=楼梯延续
      st.setSlope(10, 21, 1);
      shell(w).tryPlace(10, 20, PLAT_ITEM!);
      expect(slopeAt(st, 10, 20)).toBe(0);
      expect(slopeAt(st, 9, 20)).toBe(1);     // num6=2 ≠ 进位格 slope1 → 不拍平
    }
  });

  it('三连对角楼梯：三台全 slope1（放置期联动,无需锤）', () => {
    const { w, st } = mkWorld();
    setStone(st, 10, 21);                     // A 支撑
    const g = shell(w);
    g.tryPlace(10, 20, PLAT_ITEM!);           // A（孤立→平）
    (g.player as { useTime: number }).useTime = 0;
    setStone(st, 9, 20);                      // B 支撑
    g.tryPlace(9, 19, PLAT_ITEM!);            // B（A 的左上）→ B slope1 + A 联动 slope1
    (g.player as { useTime: number }).useTime = 0;
    setStone(st, 8, 19);                      // C 支撑
    g.tryPlace(8, 18, PLAT_ITEM!);            // C（B 的左上）→ C slope1（B 已斜不动）
    expect(slopeAt(st, 8, 18)).toBe(1);
    expect(slopeAt(st, 9, 19)).toBe(1);
    expect(slopeAt(st, 10, 20)).toBe(1);
    expect(st.half[st.idx(8, 18)] | st.half[st.idx(9, 19)] | st.half[st.idx(10, 20)]).toBe(0);
  });

  it('CanPoundTile 门：上格 ForbidsSloping（箱 21）→ 新台不斜;邻台链原版不回退仍联动（:82046-82049）', () => {
    const { w, st } = mkWorld();
    st.setTileSilent(10, 19, CHEST);          // 上格=箱（ForbidsSloping :82022-82040）
    setPlat(st, 11, 19);                      // 上右平台（斜向计分→2）
    shell(w).tryPlace(10, 20, PLAT_ITEM!);
    expect(slopeAt(st, 10, 20)).toBe(0);      // 自斜被 CanPoundTile 拒
    expect(slopeAt(st, 11, 19)).toBe(2);      // 原版不判 SlopeTile 返回值→邻台链照走
  });

  it('与锤循环零冲突：自动斜放产物直接进 SW-AW1b 循环拍（slope1→2→半砖）', () => {
    const { w, st } = mkWorld();
    setPlat(st, 9, 19);
    setStone(st, 10, 21);
    shell(w).tryPlace(10, 20, PLAT_ITEM!);    // 自动 slope1
    expect(slopeAt(st, 10, 20)).toBe(1);
    // 平台锤循环等价步进（platform-hammer.test cycleStep 同式,num 默认 1/other 2）
    const cycle = () => {
      const i = st.idx(10, 20);
      const s = st.slope[i];
      if (s === 0) { st.setSlope(10, 20, 1); return; }
      if (s === 1) { st.setSlope(10, 20, 2); return; }
      st.setSlope(10, 20, 0); st.setHalfBrick(10, 20, true);
    };
    cycle();
    expect(slopeAt(st, 10, 20)).toBe(2);      // 自动斜放不破坏循环状态机
    cycle();
    expect(st.half[st.idx(10, 20)]).toBe(1);
    expect(slopeAt(st, 10, 20)).toBe(0);
  });

  it('数据面自检：platform tile = sheet 19 且物品 def 在册（防用例空转）', () => {
    expect(TILE_DEFS[PLAT]?.vanilla?.sheet).toBe(19);
    expect(PLAT_ITEM).toBeDefined();
    expect(PLAT_VID).toBeGreaterThan(0);
  });
});

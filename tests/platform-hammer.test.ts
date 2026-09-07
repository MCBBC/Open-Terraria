// 平台族锤循环 + 坡面平台楼梯碰撞（TryPoundingTile 平台支 Player.cs:46410-46445,1457
//  ——旧引 :45394-45440 系 1456 布局,SW-AW1b 校正 / Collision.cs:1851-1866）：
// ① 锤输入循环状态机：半砖→整 / 整→slope(num)→slope(另一侧)→半砖（num 由
//    右邻(y-1)平台/左下邻(y+1)平台/右实左空决定）
// ② 坡面平台单向碰撞：站上坡面贴合、上升不挡（stepUp 爬楼梯）、按住下穿透、
//    楼梯竖柱里侧（num4<0 高端侧外）走过不抬
// 锤输入侧走 Game 级直调（private 名 mineTileWithTool 不可达——用 Game 实例太重，
// 循环状态机以等价谓词函数复算 + TileStore 状态推进断言；碰撞侧直接 moveAndCollide）
import { describe, it, expect } from 'vitest';
import { TileStore } from '../src/world/TileStore';
import type { World } from '../src/world/World';
import { moveAndCollide } from '../src/physics/TileCollision';
import { TILE_BY_KEY, TILE_DEFS } from '../src/data/tiles';
import type { FurnitureItemRecord } from '../src/world/FurnitureItems';   // ★SW-BO1 P2 姿态循环 stub 用

const TILE = 16;
const PLAT = TILE_BY_KEY['platform']!;
const DIRT = TILE_BY_KEY['dirt']!;

function makeWorld(w = 40, h = 20): World {
  return { store: new TileStore(w, h), w, h } as unknown as World;
}

interface TestBody { x: number; y: number; w: number; h: number; vx: number; vy: number; onGround: boolean; hitWall: boolean; hitHead: boolean }

describe('平台族锤循环状态机（Player.cs:46410-46445,1457——旧引 :45394-45440 系 1456 布局,SW-AW1b 校正）', () => {
  /** 与 Game 锤平台分支同式的循环步进（对 TileStore 直接演算）。
   *  SW-RB2 2026-09-06：platAt 对齐 Game 收窄后的原版 Platforms 邻判
   *  （TileID.cs:243 {19,427,435-439},非 platform 旗超集）;solidFull 对齐 st.isSolid()
   *  （含 !inActive 半边,G1 谓词形态批同式） */
  const PLATFORMS_SHEETS = new Set<number>([19, 427, 435, 436, 437, 438, 439]);
  function cycleStep(st: TileStore, x: number, y: number): void {
    const i = st.idx(x, y);
    if (st.half[i]) { st.setHalfBrick(x, y, false); return; }
    const solidFull = (ax: number, ay: number) => {
      if (!st.inBounds(ax, ay)) return false;
      const j = st.idx(ax, ay);
      return st.isSolid(ax, ay) && !!TILE_DEFS[st.type[j]]
        && !TILE_DEFS[st.type[j]].platform && !st.half[j] && st.slope[j] === 0;
    };
    const platAt = (ax: number, ay: number) =>
      st.inBounds(ax, ay)
      && PLATFORMS_SHEETS.has(TILE_DEFS[st.type[st.idx(ax, ay)]]?.vanilla?.sheet ?? -1);
    let num = 1, other = 2;
    if (platAt(x + 1, y - 1) || platAt(x - 1, y + 1)
      || (solidFull(x + 1, y) && !solidFull(x - 1, y))) { num = 2; other = 1; }
    const s = st.slope[i];
    if (s === 0) st.setSlope(x, y, num);
    else if (s === num) st.setSlope(x, y, other);
    else { st.setSlope(x, y, 0); st.setHalfBrick(x, y, true); }
  }

  it('孤立平台四拍循环：slope1 → slope2 → 半砖 → 整（num=1 起步）', () => {
    const st = new TileStore(10, 10);
    st.setTile(5, 5, PLAT);
    cycleStep(st, 5, 5);
    expect(st.slope[st.idx(5, 5)]).toBe(1);          // 整 → slope1（num 默认 1）
    cycleStep(st, 5, 5);
    expect(st.slope[st.idx(5, 5)]).toBe(2);          // slope1 → slope2
    cycleStep(st, 5, 5);
    expect(!!st.half[st.idx(5, 5)]).toBe(true);      // slope2 → 半砖（非 num 档 → Pound）
    expect(st.slope[st.idx(5, 5)]).toBe(0);
    cycleStep(st, 5, 5);
    expect(!!st.half[st.idx(5, 5)]).toBe(false);     // 半砖 → 回整
    expect(st.slope[st.idx(5, 5)]).toBe(0);
  });

  it('右邻(y-1)平台 → num=2 起步：slope2 → slope1 → 半砖', () => {
    const st = new TileStore(10, 10);
    st.setTile(5, 6, PLAT);
    st.setTile(6, 5, PLAT);   // 右邻上一行是平台 → num=2
    cycleStep(st, 5, 6);
    expect(st.slope[st.idx(5, 6)]).toBe(2);
    cycleStep(st, 5, 6);
    expect(st.slope[st.idx(5, 6)]).toBe(1);
    cycleStep(st, 5, 6);
    expect(!!st.half[st.idx(5, 6)]).toBe(true);
  });

  it('右实左空 → num=2（贴墙做楼梯的朝向感知）', () => {
    const st = new TileStore(10, 10);
    st.setTile(5, 6, PLAT);
    st.setTile(6, 6, DIRT);   // 右侧实心、左侧空
    cycleStep(st, 5, 6);
    expect(st.slope[st.idx(5, 6)]).toBe(2);
  });
});

describe('坡面平台楼梯碰撞（Collision.cs:1851-1866 单向门）', () => {
  /** x=20 处一格 slope1 平台（左高右低），下方 y+1 起 air——可从右侧走入爬坡 */
  function stairWorld(): World {
    const w = makeWorld();
    const st = w.store;
    st.setTile(20, 10, PLAT);
    st.setSlope(20, 10, 1);
    return w;
  }

  it('从坡面上方落下 → 贴合斜面站立（onGround）', () => {
    const w = stairWorld();
    // slope1 高侧在左：身体左缘进格 2px（num4=2）；脚从坡面上方落入格内带
    // （Y 轴平落被 slopePass 让位给坡面贴合，slopeCollide 抬到斜面 num4 深度处）
    const b: TestBody = { x: 20 * TILE + 2, y: 130, w: 12, h: 28,
      vx: 0, vy: 6, onGround: false, hitWall: false, hitHead: false };
    moveAndCollide(b as never, w, 0, 6);
    expect(b.onGround).toBe(true);
    expect(b.y + b.h).toBe(10 * TILE + 2);   // 斜面 2px 深度处 = 坡顶表面
  });

  it('上升中（vy<0）不挡——平台单向', () => {
    const w = stairWorld();
    const b: TestBody = { x: 20 * TILE, y: 10 * TILE - 20, w: 12, h: 28,
      vx: 0, vy: -5, onGround: false, hitWall: false, hitHead: false };
    moveAndCollide(b as never, w, 0, -5);
    expect(b.hitHead).toBe(false);   // 不当头顶
  });

  it('按住下（dropThrough）→ 穿透楼梯落下', () => {
    const w = stairWorld();
    const b = { x: 20 * TILE, y: 9 * TILE + 2, w: 12, h: 28, vx: 0, vy: 2,
      onGround: false, hitWall: false, hitHead: false, dropThrough: true };
    const body = b as { x: number; y: number; w: number; h: number; vx: number; vy: number;
      onGround: boolean; hitWall: boolean; hitHead: boolean; dropThrough?: boolean };
    for (let f = 0; f < 12; f++) {
      body.vy = Math.min(8, body.vy + 0.4);
      moveAndCollide(body, w, 0, body.vy);
    }
    expect(body.y).toBeGreaterThan(10 * TILE);   // 穿过平台
    expect(body.onGround).toBe(false);
  });

  it('楼梯竖柱里侧（低端侧外，num4<0）走过不抬升', () => {
    const w = stairWorld();
    // slope1 高侧在左：身体在格右缘之外（x 超过 21*TILE 即 num4<0 侧）不属本格——
    // 用格内右端深潜身体验证不抬：脚在格底、身体右缘越过格右缘
    const b: TestBody = { x: 20 * TILE + 14, y: 10 * TILE + 2, w: 12, h: 28,
      vx: 0, vy: 2, onGround: false, hitWall: false, hitHead: false };
    moveAndCollide(b as never, w, 0, 2);
    expect(b.y).toBe(10 * TILE + 2 + 2);   // 原样下落，未被抬到坡面
    expect(b.onGround).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// SW-AW1b（2026-09-06）分派级回归：Windows 用户实报"平台没做锤变形"。
// 根因 = Game.tryMine 的 isHammerTarget 缺平台臂 → 瞄准平台复位闩 + 整形门恒闭，
// 坡循环整段死码。上文"状态机"用本地复算函数绕过了 Game 门（代码 PASS≠实机成立
// 再犯）——本节走【真 Game.tryMine 分派】钉门。
// 原版锚：IsAHammerTarget（Player.cs:45923-45930）→ IsTilePoundable（:45932-45943）；
// ★Main.cs:8031-8032 平台 tileSolidTop/tileSolid 双 true（平台=solid，仓库数据面拆
// 在 platform 旗故门需 PLATFORMS_SHEETS 补臂）；平台支 = Player.cs:46410-46445。
import { Game } from '../src/core/Game';

function mkHammerGame(w = 40, h = 20) {
  const store = new TileStore(w, h);
  const world = { store, w, h, flags: {}, chests: [], furnitureItems: [] as FurnitureItemRecord[] } as unknown as World;
  const g = Object.create(Game.prototype) as unknown as Record<string, any>;
  g.world = world;
  g.player = { cx: 8 * TILE, cy: 8 * TILE, x: 8 * TILE - 10, y: 8 * TILE - 21, w: 20, h: 42, equipStats: {} };
  g.tickCount = 100;
  g.lastMineHitTick = -999;
  g.hammerPoundRelease = true;
  g.trackTile = 0;
  g.mining = null;
  // ★SW-BJ10 2026-09-07：锤整形写位后走 squareTileFramePlatform → markDirtyArea 3×3
  // （运行时平台帧重算新链）——stub 与 sw-bj3/sw-be1 shell 同式
  g.chunks = { markDirtyArea: () => {} };
  g.sfx = { play: () => {}, playWavFile: () => true };
  g.playSfxFile = () => true;
  g.spawnParticles = () => {};
  g.hitTiles = { addDamage: () => 0, clear: () => {} };
  g.input = { mouseX: 8 * TILE, mouseY: 8 * TILE, rightDown: false, mouseDown: false, mouseHeld: false };
  return { g, store };
}

describe('SW-AW1b 分派级：真 tryMine 锤门（旧版死码定罪）', () => {
  it('孤立木平台四拍循环：整 → slope1 → slope2 → 半砖 → 整（闩逐步再武装）', () => {
    const { g, store } = mkHammerGame();
    store.setTileSilent(8, 8, PLAT, 0, 0);
    for (const want of [1, 2, 0]) {
      g.hammerPoundRelease = true;                    // 原版节拍：松开→再按的第一挥整形
      (g as any).tryMine(8, 8, 0, 'hammer', 20);
      g.lastMineHitTick = -999;                       // 逐步去节流
      expect(store.slope[store.idx(8, 8)]).toBe(want);
    }
    expect(!!store.half[store.idx(8, 8)]).toBe(true); // 第三拍（slope2→CanPoundTile 门）→ 半砖
    g.hammerPoundRelease = true;
    (g as any).tryMine(8, 8, 0, 'hammer', 20);
    expect(!!store.half[store.idx(8, 8)]).toBe(false); // 第四拍 → PoundTile 回整
    expect(store.slope[store.idx(8, 8)]).toBe(0);
  });

  it('闩=false（按住期）→ 形不变——原版按住拆墙/松开整形节拍（poundRelease 门）', () => {
    const { g, store } = mkHammerGame();
    store.setTileSilent(8, 8, PLAT, 0, 0);
    g.hammerPoundRelease = false;
    (g as any).tryMine(8, 8, 0, 'hammer', 20);
    expect(store.slope[store.idx(8, 8)]).toBe(0);
    expect(!!store.half[store.idx(8, 8)]).toBe(false);
  });

  it('platform=solid 定谳臂：427 队伍平台同入锤目标可循环；16 铁砧/18 工作台非目标且复位闩（IsTilePoundable 对齐）', () => {
    const TEAM = TILE_BY_KEY['v_427_red_team_platform']!;
    const ANVIL = TILE_BY_KEY['anvil']!;
    const BENCH = TILE_BY_KEY['workbench']!;
    const { g, store } = mkHammerGame();
    store.setTileSilent(8, 8, TEAM, 0, 0);
    g.hammerPoundRelease = true;
    (g as any).tryMine(8, 8, 0, 'hammer', 20);
    expect(store.slope[store.idx(8, 8)]).toBe(1);     // 427 在 PLATFORMS_SHEETS → 可整形
    // ——铁砧/工作台：非锤目标 → 闩被复位（原版 :45997-46003 瞄准非目标复位）、形不变
    for (const [key, id] of [['anvil', ANVIL], ['workbench', BENCH]] as const) {
      store.setTileSilent(10, 8, id, 0, 0);
      g.hammerPoundRelease = true;
      (g as any).tryMine(10, 8, 0, 'hammer', 20);
      expect(g.hammerPoundRelease).toBe(false);       // 复位闩
      expect(!!store.half[store.idx(10, 8)]).toBe(false);
      expect(store.slope[store.idx(10, 8)]).toBe(0);
      void key;
    }
  });

  it('方向感知走原版 Platforms 邻判：右实左空 → num=2 起步（slope2 先行）', () => {
    const DIRT = TILE_BY_KEY['dirt']!;
    const { g, store } = mkHammerGame();
    store.setTileSilent(8, 8, PLAT, 0, 0);
    store.setTileSilent(9, 8, DIRT, 0, 0);            // 右实
    g.hammerPoundRelease = true;
    (g as any).tryMine(8, 8, 0, 'hammer', 20);
    expect(store.slope[store.idx(8, 8)]).toBe(2);     // num=2（贴墙楼梯朝向）
  });

  // ---- SW-RB2 2026-09-06：CanPoundTile 内门补齐（vanilla PoundTile :82083/SlopeTile
  //      :82022 均内嵌;原版平台分支仅第三拍显式判 :46435,尾段两支全靠内门） ----

  it('CanPoundTile 内门：上邻 ForbidsSloping（梳妆台 88 压平台）→ 平台不坡化、形不变', () => {
    const DRESSER = TILE_BY_KEY['dresser']!;          // sheet 88 ∈ ForbidsSloping(:81480+)
    const { g, store } = mkHammerGame();
    store.setTileSilent(8, 8, PLAT, 0, 0);
    store.setTileSilent(8, 7, DRESSER, 0, 0);         // 台上家具
    g.hammerPoundRelease = true;
    (g as any).tryMine(8, 8, 0, 'hammer', 20);
    expect(store.slope[store.idx(8, 8)]).toBe(0);     // 原版 SlopeTile 内门拒 → 形不变
    expect(!!store.half[store.idx(8, 8)]).toBe(false);
    expect(g.hammerPoundRelease).toBe(false);         // 闩照常消费（vanilla :46700）
  });

  it('CanPoundTile 内门：尖刺 48 尾段拒整形（原版 case 48 恒拒,不产半砖/坡）', () => {
    const SPIKE = TILE_BY_KEY['v_48_spike']!;         // solid && !framed → 旧式尾段可整形=越权
    const { g, store } = mkHammerGame();
    store.setTileSilent(8, 8, SPIKE, 0, 0);
    g.hammerPoundRelease = true;
    (g as any).tryMine(8, 8, 0, 'hammer', 20);
    expect(!!store.half[store.idx(8, 8)]).toBe(false);
    expect(store.slope[store.idx(8, 8)]).toBe(0);
    expect(g.hammerPoundRelease).toBe(false);         // 目标成立（tileSolid）→ 闩消费同原版
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// SW-BA1（2026-09-06）锤击/输入域备案项清偿：
//   ① 239 矿石条架/380 种植箱（双 true 全集 RB2 B-3）入锤目标门——239 走尾段
//     else PoundTile 整↔半 toggle（Player.cs:46687/WorldGen.cs:82096-82103，
//     tileSolidTop 使通用坡支 :46646 不可入=非平台坡循环）；380 被 CanPoundTile
//     （:81972 case 380）拒整形=门内闩消费 no-op。
//   ② TryPoundingTile 特例四支（137 :46494-46546 / 424 :46548-46560 /
//     442 :46560-46644 / 470 :46403-46405）+ 尾段终端化——原版 :46373
//     `hitWall=false` 在分派前已置=闩消费挥【恒不拆墙】，旧仓库未命中整形臂
//     回落拆墙段=比原版早一挥拆墙。
//   ③ 非锤工具挥击清闩（TryPoundingTile 头 :46365-46368 `sItem.hammer <= 0 ||
//     !tile.active() → poundRelease=false`）；钻头链不清（Mount.UseDrill →
//     PickTile 直调 Mount.cs:3071-3140，不经过 TryPoundingTile）。
// 判别力：每例走【真 Game.tryMine 分派】——删 isHammerTarget 对应臂/撤终端化/
// 撤清闩行即变红（门测试学：禁用单门应变红）。
describe('SW-BA1：239/380 双 true 家族 + 特例四支 + 尾段终端化 + 非锤清闩', () => {
  const ORE_BARS = TILE_BY_KEY['v_239_ore_bars']!;
  const PLANTER = TILE_BY_KEY['v_380_planter_boxes']!;
  const PIPE = TILE_BY_KEY['v_424_wirepipe']!;
  const TRAP = TILE_BY_KEY['v_137_traps']!;
  const PAD = TILE_BY_KEY['v_442_projectilepressurepad']!;
  const DOLL = TILE_BY_KEY['v_470_mannequins']!;
  const ALTAR = TILE_BY_KEY['v_26_altars']!;

  /** mkHammerGame + addDamage 记录器：wallHits 非空=拆墙段被到达（闩消费挥恒空） */
  function mkBA1(w = 24, h = 24) {
    const { g, store } = mkHammerGame(w, h);
    const wallHits: Array<[number, number, number]> = [];
    g.hitTiles = {
      addDamage: (x: number, y: number, d: number) => { wallHits.push([x, y, d]); return d; },
      clear: () => {},
      getDamage: () => 0,
      prune: () => {},   // PickWall 尾 :46377 dmgW!=0 → Prune（tryMine :18147）
    };
    return { g, store, wallHits };
  }
  const halfAt = (st: TileStore, x: number, y: number): boolean => !!st.half[st.idx(x, y)];

  it('239 矿石条架：整↔半 toggle（尾段 PoundTile，slope 恒 0 不坡化）', () => {
    const { g, store } = mkBA1();
    store.setTileSilent(8, 8, ORE_BARS, 0, 0);
    for (const wantHalf of [true, false, true]) {
      g.hammerPoundRelease = true;                    // 松开→再按的第一挥整形
      (g as any).tryMine(8, 8, 0, 'hammer', 20);
      g.lastMineHitTick = -999;
      expect(halfAt(store, 8, 8)).toBe(wantHalf);     // :46687 else PoundTile toggle
      expect(store.slope[store.idx(8, 8)]).toBe(0);   // tileSolidTop → 通用坡支不可入
      expect(g.hammerPoundRelease).toBe(false);       // 闩消费（:46700）
    }
  });

  it('380 种植箱：入目标门但 CanPoundTile(case 380) 拒整形=闩消费 no-op；闩消费挥不拆墙（对照：闩=false 同挥拆墙）', () => {
    const { g, store, wallHits } = mkBA1();
    store.setTileSilent(8, 8, PLANTER, 0, 0);
    store.setWall(8, 8, 1);                           // 身后自然墙（3×3 有开口=可拆）
    g.hammerPoundRelease = true;
    (g as any).tryMine(8, 8, 5, 'hammer', 20);        // power>0=墙分支本可及
    expect(g.hammerPoundRelease).toBe(false);         // 闩照常消费（原版 :46700）
    expect(wallHits.length).toBe(0);                  // ★终端化：整形挥不落拆墙段
    expect(store.get(8, 8)).toBe(PLANTER);            // 型不变
    expect(store.half[store.idx(8, 8)]).toBe(0);      // CanPoundTile 拒 → 无半砖
    // 对照：闩=false（按住态）同格同 power → 墙被锤（原版 TryHittingWall 门
    // `!poundRelease` 在按住态恒真）
    g.lastMineHitTick = -999;
    (g as any).tryMine(8, 8, 5, 'hammer', 20);
    expect(wallHits.length).toBe(1);
    expect(wallHits[0][0]).toBe(8);
    expect(wallHits[0][1]).toBe(8);
  });

  it('424 接线盒：frameX 0→18→36→0 三态循环（:46548-46560 verbatim），闩消费挥不拆墙', () => {
    const { g, store, wallHits } = mkBA1();
    store.setTileSilent(8, 8, PIPE, 0, 0);
    store.setWall(8, 8, 1);
    for (const want of [18, 36, 0]) {
      g.hammerPoundRelease = true;
      (g as any).tryMine(8, 8, 5, 'hammer', 20);
      g.lastMineHitTick = -999;
      expect(store.frameX[store.idx(8, 8)]).toBe(want);
      expect(g.hammerPoundRelease).toBe(false);
    }
    expect(wallHits.length).toBe(0);                  // 三挥全为闩消费挥 → 墙完好
  });

  it('137 陷阱换向映射表（:46494-46546 verbatim）：行 0 循环 / 行 3 映射 / default 档', () => {
    const { g, store } = mkBA1();
    store.setTileSilent(8, 8, TRAP, 0, 0);            // frameY=0（行 0 飞镖档）
    for (const want of [36, 72, 18, 54, 90, 0]) {     // col0→2,col2→4,col4→1,col1→3,col3→5,col5→0
      g.hammerPoundRelease = true;
      (g as any).tryMine(8, 8, 0, 'hammer', 20);
      g.lastMineHitTick = -999;
      expect(store.frameX[store.idx(8, 8)]).toBe(want);
    }
    expect(store.frameY[store.idx(8, 8)]).toBe(0);    // frameY 不动（:46543 只写 frameX）
    // 行 3（尖刺球档 frameY=54）：col0→3、col2→4、col3→2、col4→0（default col5→0）
    const rowCases: Array<[number, number]> = [[0, 54], [36, 72], [54, 36], [72, 0], [90, 0]];
    for (const [fx, want] of rowCases) {
      store.setTileSilent(8, 8, TRAP, fx, 54);
      g.hammerPoundRelease = true;
      (g as any).tryMine(8, 8, 0, 'hammer', 20);
      g.lastMineHitTick = -999;
      expect(store.frameX[store.idx(8, 8)]).toBe(want);
    }
  });

  it('442 弹幕压力垫板重算朝向（:46560-46644）：无支撑维持原帧 / 左支撑→44 / 上支撑→22', () => {
    const { g, store } = mkBA1();
    const DIRT = TILE_BY_KEY['dirt']!;
    // 无任何支撑：cur0 → flag 全 false → num10=-1 维持原帧（:46634 门）
    store.setTileSilent(8, 8, PAD, 0, 0);
    g.hammerPoundRelease = true;
    g.lastMineHitTick = -999;
    (g as any).tryMine(8, 8, 0, 'hammer', 20);
    expect(store.frameX[store.idx(8, 8)]).toBe(0);
    // 左支撑（实心邻）：cur0 → flag2=true → num10=2 → frameX=44
    store.setTileSilent(7, 8, DIRT, 0, 0);
    g.hammerPoundRelease = true;
    g.lastMineHitTick = -999;
    (g as any).tryMine(8, 8, 0, 'hammer', 20);
    expect(store.frameX[store.idx(8, 8)]).toBe(44);
    // 上支撑：清左邻（上一步残留）→ cur0 → flag=true、flag2=false → num10=1 → frameX=22
    store.setTileSilent(7, 8, 0, 0, 0);
    store.setTileSilent(8, 8, PAD, 0, 0);
    store.setTileSilent(8, 7, DIRT, 0, 0);
    g.hammerPoundRelease = true;
    g.lastMineHitTick = -999;
    (g as any).tryMine(8, 8, 0, 'hammer', 20);
    expect(store.frameX[store.idx(8, 8)]).toBe(22);
  });

  it('470 模特假人：★SW-BO1 P2 姿态循环（TryChangePose TEDisplayDoll.cs:900-923）——闩消费、假人无损、pose 0→1→2→3→回 0', () => {
    const { g, store, wallHits } = mkBA1();
    store.setTileSilent(8, 8, DOLL, 0, 0);
    store.setWall(8, 8, 1);
    const poseOf = () => (g.world.furnitureItems as FurnitureItemRecord[]).find(
      (r) => r.x === 8 && r.y === 8 && r.kind === 'display_doll')?.pose;
    const poses: Array<number | undefined> = [];
    for (let hit = 1; hit <= 4; hit++) {
      g.hammerPoundRelease = true;
      (g as any).tryMine(8, 8, 5, 'hammer', 20);
      g.lastMineHitTick = -999;                       // 解除挥击节流（同 239 循环例）
      expect(g.hammerPoundRelease).toBe(false);       // 闩消费（原版 470 支先于尾段）
      expect(wallHits.length).toBe(0);                // 不落拆墙段（hitWall=false :46373）
      expect(store.get(8, 8)).toBe(DOLL);             // 假人无损（pose=TE 态,无 tile 写面）
      expect(store.frameX[store.idx(8, 8)]).toBe(0);
      poses.push(poseOf());
    }
    // ChangePose（:918-923）：++ 后 IsValidPose（≤3 恒合法;持握槽空 → 4 非法回 0）
    expect(poses).toEqual([1, 2, 3, 0]);
  });

  it('非锤工具挥击清闩（:46365-46368）；钻头链不清（Mount.UseDrill → PickTile 直调）', () => {
    const { g, store } = mkBA1();
    // 镐挥祭坛（tileHammer 族非锤=整支无动作）→ 闩清（TryPoundingTile 头 hammer<=0 臂）
    store.setTileSilent(8, 8, ALTAR, 0, 0);
    g.hammerPoundRelease = true;
    (g as any).tryMine(8, 8, 0, 'pick', 20);
    expect(g.hammerPoundRelease).toBe(false);
    // 镐挥空格（!tile.active() 同支）→ 闩清
    store.setTileSilent(10, 10, 0, 0, 0);
    g.hammerPoundRelease = true;
    (g as any).tryMine(10, 10, 0, 'axe', 20);
    expect(g.hammerPoundRelease).toBe(false);
    // 钻头链不清：Mount.UseDrill → PickTile 不经过 TryPoundingTile（勿过度接线）
    g.hammerPoundRelease = true;
    (g as any).tryMine(10, 10, 0, 'pick', 20, undefined, { drill: true });
    expect(g.hammerPoundRelease).toBe(true);
  });

  // SW-RB4b 2026-09-06：锁门邻接拒整形门（TryPoundingTile :46377-46387 damageAmount=0
  // → AddDamage<100 fail 支 = 效尘+Dig 音、【不整形】、早退在 :46700 消费点前=闩保留）
  it('SW-RB4b 锁门邻接拒整形：上邻神庙锁门 → 不整形+闩保留+不落拆墙段；清锁门对照 → 正常整形', () => {
    const { g, store, wallHits } = mkBA1();
    const DOOR = TILE_BY_KEY['door_closed']!;
    store.setTileSilent(8, 8, ORE_BARS, 0, 0);
    store.setTileSilent(8, 7, DOOR, 0, 594);          // 神庙锁门段（IsLockedDoor: fy∈[594,646]∧fx<54）
    store.setWall(8, 8, 1);
    g.hammerPoundRelease = true;
    (g as any).tryMine(8, 8, 5, 'hammer', 20);
    expect(store.half[store.idx(8, 8)]).toBe(0);      // 不整形（fail 支早退）
    expect(g.hammerPoundRelease).toBe(true);          // 闩保留（:46387 早退未到 :46700）
    expect(wallHits.length).toBe(0);                  // 同挥也不落拆墙段（hitWall=false 已置）
    // 下邻锁门同门（vanilla 查 y±1 双向）
    store.setTileSilent(8, 7, 0, 0, 0);
    store.setTileSilent(8, 9, DOOR, 0, 594);
    g.hammerPoundRelease = true;
    g.lastMineHitTick = -999;                         // 去节流（每次独立挥击）
    (g as any).tryMine(8, 8, 5, 'hammer', 20);
    expect(store.half[store.idx(8, 8)]).toBe(0);
    expect(g.hammerPoundRelease).toBe(true);
    // 对照：清锁门 → 同挥尾段 PoundTile toggle 整→半、闩消费
    store.setTileSilent(8, 9, 0, 0, 0);
    g.hammerPoundRelease = true;
    g.lastMineHitTick = -999;
    (g as any).tryMine(8, 8, 5, 'hammer', 20);
    expect(store.half[store.idx(8, 8)]).toBe(1);
    expect(g.hammerPoundRelease).toBe(false);
  });

  // SW-RB4b 2026-09-06：尾段 slope 邻读界卫——原版 tileTarget 钳 [5,maxTiles-5]
  //（Player.cs:25594-25604）x±1 恒在界内;本仓 tileUnder 无钳,tx=w-1 时裸读
  // st.idx 回绕下一行读他行 slope 误翻 num12/num13 朝向感知
  it('SW-RB4b 尾段 slope 界卫：tx=w-1 时下一行 (0,y+1) 的 slope 不得误翻朝向', () => {
    const { g, store } = mkBA1(24, 24);
    const DIRT = TILE_BY_KEY['dirt']!;
    g.player.cx = 22 * TILE; g.player.cy = 8 * TILE;  // 挪近目标（inTileRange 门）
    g.player.x = 22 * TILE - 10; g.player.y = 8 * TILE - 21;
    store.setTileSilent(23, 8, DIRT, 0, 0);           // 世界最右列目标格（shaped: slope1）
    store.setSlope(23, 8, 1);
    // 回绕陷阱格：st.idx(24,8)=8*24+24=216 ≡ (0,9)——装 slope1 复现误翻
    store.setTileSilent(0, 9, DIRT, 0, 0);
    store.setSlope(0, 9, 1);
    g.hammerPoundRelease = true;
    (g as any).tryMine(23, 8, 0, 'hammer', 20);
    // 界卫读 0 → 不翻转 num12=1/num13=2：s=1→num12=1 命中 → num13=2
    expect(store.slope[store.idx(23, 8)]).toBe(2);
    expect(g.hammerPoundRelease).toBe(false);
  });
});

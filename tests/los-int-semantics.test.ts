// ★2026-08-31 Collision.CanHit 家族 C# 整型语义清零批回归：
// 原版 tile 提取不是 Math.floor——CanHit(Point,…)（1457 Collision.cs:390-393）是
// ToPoint(int 截断)+int 半宽+int÷16 三段纯整型链；CanHitLine(:592-595) 是
// `(int)((X+(float)(W/2))/16f)` 浮点链。旧实现 `Math.floor((x+w/2)/16)` 单式通用
// 两链，本批钉死四件事：
//   A 提取基元逐值（trunc 朝零/int÷半宽/f32 加法舍入/P1 等价性扫掠）；
//   B 负坐标深负区的钳制吸收等价性（证明的端到端形式，非 vacuous 值断言）；
//   C 奇数尺寸×半格交界唯一正区可观测窗的受控场景翻边实证；
//   D losRayAnchors 手位/目标锚 int÷ 与 f32 站岗。
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { TILE_BY_KEY } from '../src/data/tiles';
import {
  canHit, canHitLine, playerCanHitEntity, losRayAnchors,
  canHitStartTile, canHitLineStartTile,
} from '../src/physics/LineOfSight';
import type { LOSBox } from '../src/physics/LineOfSight';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { TILE } from '../src/core/constants';

const STONE = TILE_BY_KEY['stone'];
type Store = World['store'];

/** 旧实现参照式（仅作差异举证用，不进产品代码）：Math.floor 单式 */
function legacyFloorStartTile(x: number, sizePx: number): number {
  return Math.floor((x + sizePx / 2) / 16);
}

/** 空场骨架；可选放一块石。 */
function makeScene(place?: (st: Store) => void): Store {
  const world = new World(64, 64, 42, 'los-int');
  if (place) place(world.store);
  return world.store;
}

const stoneAt = (st: Store, col: number, row: number): void => { st.setTile(col, row, STONE); };

describe('A 提取基元：C# (int)/int÷ 截断链', () => {
  it('①修复窗·奇数尺寸×半格交界：vanilla 不把 .5 半像素计进分子', () => {
    // CanHit 整型链：ToPoint(31.5)=31 +(1÷2 int=0) → 31/16 = 1
    expect(canHitStartTile(31.5, 1)).toBe(1);
    // 旧 floor 版分子吃进半宽 .5 进位：floor((31.5+.5)/16)=2 —— 正区唯一可观测窗
    expect(legacyFloorStartTile(31.5, 1)).toBe(2);
    // 同型其余两例：(T(x)+h)≡15 (mod 16) 才翻——46.5/3:(46+1)/16=2 旧 floor(48/16)=3；
    // 93.5/5:(93+2)/16=5 旧 floor(96/16)=6
    expect(canHitStartTile(46.5, 3)).toBe(2);
    expect(legacyFloorStartTile(46.5, 3)).toBe(3);
    expect(canHitStartTile(93.5, 5)).toBe(5);
    expect(legacyFloorStartTile(93.5, 5)).toBe(6);
  });

  it('②修复窗·负小数近零带×大盒：ToPoint 预截断先归零再整型除', () => {
    // vanilla: ToPoint(-0.5)=0 + (128÷2=64) → 64/16=4；旧 floor((-0.5+64)/16)=3
    expect(canHitStartTile(-0.5, 128)).toBe(4);
    expect(legacyFloorStartTile(-0.5, 128)).toBe(3);
    // 小盒同坐标：结果 ≤1 的域交钳制吸收兜底
    expect(canHitStartTile(-0.5, 20)).toBeLessThanOrEqual(1);
  });

  it('负坐标一律朝零截断（trunc ≠ floor），深负值待钳制吸收', () => {
    expect(canHitStartTile(-10.5, 0)).toBe(0);                 // T(-10/16)=-0.625→0；floor=-1
    expect(canHitStartTile(-260, 80)).toBe(-13);               // (-260+40)/16=-13.75→-13；floor=-14
    expect(canHitStartTile(-160000, 40)).toBe(-9998);          // (-159980)/16=-9998.75→-9998
  });

  it('偶数尺寸控制组：新旧逐位一致（零行为差域）', () => {
    expect(canHitStartTile(200.7, 20)).toBe(13);
    expect(legacyFloorStartTile(200.7, 20)).toBe(13);
    expect(canHitStartTile(31.5, 20)).toBe(2);                 // (31+10)/16→2
    expect(legacyFloorStartTile(31.5, 20)).toBe(2);
    expect(canHitStartTile(264.75, 42)).toBe(17);              // (264+21)/16→17
  });

  it('P1 等价性扫掠（非负域：两提取式除登记自异窗外逐位恒等）', () => {
    const fracs = [0, 0.25, 0.49, 0.5, 0.75, 0.997];           // 该量级 f32 上舍阈值 >0.9999，全在安全侧
    const sizes = [0, 1, 2, 3, 5, 20, 21, 40, 41, 42];
    const bases = [0, 1, 15, 16, 31, 47, 63, 100, 191, 255, 256, 400];
    for (const b of bases) for (const f of fracs) for (const s of sizes) {
      const x = b + f;
      expect(canHitLineStartTile(x, s)).toBe(canHitStartTile(x, s));
      expect(canHitStartTile(x, s)).toBeGreaterThanOrEqual(Math.floor(b / 16) - 1);
    }
  });

  it('CanHitLine 浮点提取：f32 加法舍入物化 + (int) 朝零', () => {
    // 255.999999999 距 256 仅 1e-9 < [128,256) 区间 f32 半 ulp(≈1.5e-5) → 上舍到 256
    expect(canHitLineStartTile(255.999999999, 0)).toBe(16);
    // 对照纯 f64 式会给 15 —— 证明 /16f+(int) 链确实经 float32 圆整站岗
    expect(Math.trunc(255.999999999 / 16)).toBe(15);
    // ★A⑥ F4 批翻案重钉（旧版钉 ==15 是"输入无存储域量化"的错误模型）：原版坐标
    //   是 Vector2(float32) 存储域——写入即舍入，ToPoint 读到的 v.X 已是 fr(x)=256。
    //   SW 实体链 f64 自由演算无量化层 ⇒ canHitStartTile 入口先 Math.fround 复刻
    //   物化语义。修正后 hit==line==16（此窗两式应一致；真正合法自异窗见 A⑦）：
    expect(canHitStartTile(255.999999999, 0)).toBe(16);
    expect(canHitStartTile(255.999999999, 0)).toBe(canHitLineStartTile(255.999999999, 0));
    expect(canHitLineStartTile(-10.5, 0)).toBe(0);             // -10.5/16=-0.656→(int)0
  });

  it('A⑦ 正域 bin 穿越自异锚（hit8192/line8193）：两式各保真原文不合并', () => {
    // x=131039.9921875=131072−32−1/128：在 [2¹⁶,2¹⁷) 域 f32 恰可表示（该域
    // ulp=1/128，分数恰为格点），故入口 fr(x) 不动它 ⇒ hit 侧 T(x)=131039，
    // (131039+48)/16 截断=8192。
    expect(canHitStartTile(131039.9921875, 96)).toBe(8192);
    // 而 x+48=131087.9921875 已落入 [2¹⁷,2¹⁸) 细粒度 bin（ulp=1/64）：127/128 分数
    // = 相邻 f32 格点的 half-ulp 中点 → ties-even 上舍 131088 → /16 截断=8193。
    expect(canHitLineStartTile(131039.9921875, 96)).toBe(8193);
    // 大世界可达性：maxTilesX=8400 → 世界宽 134400px > 131072（[2¹⁷bin 起点）
    expect(8400 * 16).toBeGreaterThan(131072);
  });

  it('合法自异对（负小数带,s≡0 mod 16）：hit 恰整数线 vs line 从左逼近掉一格', () => {
    // x=-0.25,w=96：hit=(T(-0.25)+48)/16=3；line=T(fround(47.75)/16)=2 ——原版两公式固有分叉
    expect(canHitStartTile(-0.25, 96)).toBe(3);
    expect(canHitLineStartTile(-0.25, 96)).toBe(2);
  });
});

describe('B 负坐标钳制吸收（cs:394-424 `if(n<=1)n=1` 对一切 ≤1 终值一视同仁）', () => {
  // 「tile1 孪生」入界起点取值要过盒中心换算：x 型 T(x)+10∈[16,32) ⇒ x∈{21…}；
  // 盒 20×42 的行走行 = T(300+21)/16 = 20（墙体一律放行走行上才会被穿）。
  it('世界左侧深负起点 == tile1 孪生起点：多墙位×远靶全谱同判', () => {
    const targets = [88, 3 * 16 + 8, 6 * 16 + 8];              // tile5 / tile3 / tile6(穿墙)
    for (const wall of [null, 2, 4] as Array<number | null>) {
      const st = makeScene(wall === null ? undefined : (s) => stoneAt(s, wall, 20));
      for (const tx of targets) {
        const deepLeft = canHit(st, -500, 300, 20, 42, tx, 300, 20, 42);
        const twin = canHit(st, 21, 300, 20, 42, tx, 300, 20, 42);
        const megaDeep = canHit(st, -160000, 300, 20, 42, tx, 300, 20, 42);
        expect(deepLeft).toBe(twin);
        expect(megaDeep).toBe(twin);
        if (wall === null && tx !== 6 * 16 + 8) expect(twin).toBe(true);   // 护栏：对拍有内容
        if (wall === 2 && tx === 6 * 16 + 8) expect(twin).toBe(false);     // 穿墙护栏
        if (wall === 4 && tx === 88) expect(twin).toBe(false);             // 穿墙护栏 2
      }
    }
  });

  it('世界上方深负 Y 起点 == tile1 孪生起点（纵列穿墙位一致）', () => {
    for (const wall of [false, true]) {
      const st = makeScene((s) => { if (wall) stoneAt(s, 19, 12); });       // 纵列 x-tile=19
      const pair = (sy: number, tyRow: number): boolean =>
        canHit(st, 300, sy, 20, 42, 300, tyRow * 16 + 8, 20, 42);
      expect(pair(-500, 22)).toBe(pair(5, 22));                // y 孪生 tile1 起点
      expect(pair(-160000, 22)).toBe(pair(5, 22));
      if (!wall) expect(pair(-500, 22)).toBe(true);            // 护栏
    }
  });

  it('canHitLine 同吸收域：浮点链深负起点与入界等价', () => {
    const st = makeScene();
    const probe = (sx: number): boolean =>
      canHitLine(st, sx, 300, 0, 0, 400, 300, 0, 0);
    expect(probe(-500)).toBe(probe(24));                       // 双双钳到 tile1 起步
    expect(probe(-160000)).toBe(probe(40));
    expect(probe(-500)).toBe(true);                            // 护栏：空场直通
  });

  it('playerCanHitEntity 全射线族深负起点与镜像正侧同判（Player.CanHit 收敛面）', () => {
    const st = makeScene();
    const boxAt = (x: number, y: number): LOSBox =>
      ({ x, y, w: 20, h: 42, cx: x + 10, cy: y + 21, facing: 1 });
    const tgt = boxAt(480, 280);
    expect(playerCanHitEntity(st, boxAt(-500, 280), tgt))
      .toBe(playerCanHitEntity(st, boxAt(24, 280), tgt));
  });
});

describe('C 可观测窗口端到端（(31.5,w1) 新语义起点 tile1；旧 floor 版从 tile2 起步误判）', () => {
  // 几何：行 18 仅 (1,18) 实心石，终点 px20。rect 探针用 1×1 盒（h=1 → 整型半宽 0，
  // 与 point 射线同一 y-tile=18 对齐），保证两族判定走同一条 tile 带可比：
  //  · 新语义起点 tile1 == 终点 tile1 → 即刻通过 TRUE（起点实心不被检查,:432 先判达）；
  //  · 旧 floor 版起点 tile2 → 步进落进实心 (1,18) → FALSE。
  it('canHit：新语义 TRUE（即刻达标）；tile2 显式起步对照 FALSE', () => {
    const st = makeScene((s) => stoneAt(s, 1, 18));
    expect(canHit(st, 31.5, 300, 1, 1, 20, 300, 0, 0)).toBe(true);
    expect(canHit(st, 40, 300, 1, 1, 20, 300, 0, 0)).toBe(false);
    expect(canHitStartTile(31.5, 1)).toBe(1);                  // 提取值与几何对账
  });

  it('canHitLine：新语义 TRUE（d5=d6 即刻达）；tile2 显式起步对照 FALSE', () => {
    const st = makeScene((s) => stoneAt(s, 1, 18));
    expect(canHitLine(st, 31.5, 300, 0, 0, 20, 300, 0, 0)).toBe(true);
    expect(canHitLine(st, 40, 300, 0, 0, 20, 300, 0, 0)).toBe(false);
    expect(canHitLineStartTile(31.5, 0)).toBe(1);
  });

  it('w=3 非 residue-15 组合对照面：提取不翻、开阔地可达', () => {
    // (127+1)=128 → residue 0：非 15-residue 组合新旧一致——窗由 ≡15(mod16) 组合专属
    const st = makeScene();
    expect(canHitStartTile(127.5, 3)).toBe(canHitLineStartTile(127.5, 3));
    expect(legacyFloorStartTile(127.5, 3)).toBe(canHitStartTile(127.5, 3));
    expect(canHit(st, 127.5, 300, 3, 3, 60, 300, 0, 0)).toBe(true);
  });
});

describe('D losRayAnchors：手位/目标锚 int÷ 与 f32 站岗（Player.cs:42858-42862）', () => {
  it('奇宽手位偏移 int÷：w=21,facing±1 → ±10（非 ±10.5）；Center 兜底浮点半宽保持混态', () => {
    const pL: LOSBox = { x: 100, y: 200, w: 21, h: 42, facing: -1 };
    expect(losRayAnchors(pL, { x: 0, y: 0, w: 0, h: 0 }).hx).toBe(100.5);  // T(-21/2)=-10+110.5
    const pR: LOSBox = { x: 100, y: 200, w: 21, h: 42, facing: 1 };
    expect(losRayAnchors(pR, { x: 0, y: 0, w: 0, h: 0 }).hx).toBe(120.5);  // T(21/2)=10+110.5
  });

  it('奇高目标锚 int÷ 截断：h=41 → −13/+13（★F3 定案锁死；floor 会给 −14）', () => {
    const p: LOSBox = { x: 100, y: 200, w: 20, h: 42, facing: 1 };
    const e: LOSBox = { x: 600, y: 580, w: 18, h: 41 };        // Center=(609,600.5)
    const a = losRayAnchors(p, e);
    expect(a.exTop).toBe(609);
    expect(a.eyTop).toBe(587.5);                               // 600.5 + T(-41/3)
    expect(a.eyMid).toBe(600.5);
    expect(a.eyBot).toBe(613.5);                               // 600.5 + T(41/3)
  });

  it('标准身材回归锚值不变（既有认证面 w20/h42、e18/h40）', () => {
    const p: LOSBox = { x: 100, y: 200, w: 20, h: 42, facing: 1 };
    const e: LOSBox = { x: 600, y: 572, w: 18, h: 40 };        // Center=(609,592)
    const a = losRayAnchors(p, e);
    expect(a.hyBC).toBe(207);                                  // cy=221 + fround(-42/3)=-14
    expect(a.hyD).toBe(221);                                   // D 支 y 分量字面 0f → Center.Y 原样
    expect(a.eyTop).toBe(579);                                 // 592-13（40÷3 int）
    expect(a.eyBot).toBe(605);
  });

  it('手位 Y 偏移确有 f32 站岗：h=43 时 fround(−43/3) ≠ 纯 f64 商', () => {
    const p: LOSBox = { x: 100, y: 200, w: 20, h: 43, facing: 1 };
    const a = losRayAnchors(p, { x: 0, y: 0, w: 0, h: 0 });
    // pcy=Center.Y=fround(200+21.5)=221.5；dyHand=fround(fround(-43)/3) 单圆整后加法再圆整
    expect(a.hyBC).toBe(Math.fround(221.5 + Math.fround(Math.fround(-43) / 3)));
    expect(Math.fround(-43 / 3)).not.toBe(-43 / 3);            // 证非 cosmetic
  });

  it('playerCanHitEntity 奇尺寸盒开阔地全通（四射线口径一致性）', () => {
    const st = makeScene();
    const p: LOSBox = { x: 90, y: 280, w: 21, h: 43, cx: 100.5, cy: 301.5, facing: 1 };
    const e: LOSBox = { x: 500, y: 280, w: 18, h: 41 };
    expect(playerCanHitEntity(st, p, e)).toBe(true);
  });
});

// ============================================================
// ★F1 反重力活语义批（2026-08-31）：gravDir 不再恒 1——
//   · Gravitation 药水 buff18 在 Game.ts 按 Up 边沿翻转 player.gravDir；
//   · FTW 克脑 consumeBrainOfGravity 强制 gravDir=-1。
//   原版手位 Y = gravDir*(float)(-height)/3f（Player.cs:42859），gravDir=-1 时
//   B/C 支起点从 Center−h/3 翻到 Center+h/3；D 支字面 0f 不受影响。
// ============================================================
describe('E F1 反重力语义：手位翻侧 + 石壁双侧翻转不变性', () => {
  /** 标准身材站桩盒（cy 显式给出绕开兜底链），e0 与 describe D 同款。 */
  const stand = (gravDir?: number): LOSBox => {
    const b: LOSBox = { x: 478, y: 243, w: 20, h: 42, cx: 488, cy: 264, facing: 1 };
    return gravDir === undefined ? b : { ...b, gravDir };
  };
  const e0: LOSBox = { x: 600, y: 572, w: 18, h: 40 };

  it('手位 Y 单元锚：gd=1 → cy−h/3 链；gd=-1 → cy+h/3 链；D 支两态同值', () => {
    // gd=1：dy=fround(fround(1*-42)/3)=-14 → hyBC=250；gd=-1：+14 → 278（全整点链零舍入差）
    expect(losRayAnchors(stand(), e0).hyBC).toBe(250);
    expect(losRayAnchors(stand(-1), e0).hyBC).toBe(278);
    expect(losRayAnchors(stand(-1), e0).hyBC)
      .toBe(Math.fround(264 + Math.fround(Math.fround(-1 * -42) / 3)));
    // D 支（Player.cs:42862 字面 0f）：gravDir 无关，两态同为 Center.Y
    expect(losRayAnchors(stand(), e0).hyD).toBe(264);
    expect(losRayAnchors(stand(-1), e0).hyD).toBe(264);
    expect(losRayAnchors(stand(), e0).hyD).toBe(losRayAnchors(stand(-1), e0).hyD);
    // 起点格随翻侧移位：250→行15 / 278→行17（[240,256)/[272,288)）
    expect(canHitLineStartTile(250, 0)).toBe(15);
    expect(canHitLineStartTile(278, 0)).toBe(17);
    // 奇高混态：h=43 时乘链 fround(±43)→/3f 各自保真（不做减法回推——外层加法
    // 舍入不消去，直接按原文公式对照）
    expect(losRayAnchors({ ...stand(1), h: 43 }, e0).hyBC)
      .toBe(Math.fround(264 + Math.fround(Math.fround(-43) / 3)));
    expect(losRayAnchors({ ...stand(-1), h: 43 }, e0).hyBC)
      .toBe(Math.fround(264 + Math.fround(Math.fround(43) / 3)));
  });

  it('B/C 射线级判别（确定性垂直射线）：单行石壁只挡真侧别支', () => {
    // 挡 gd=1 支：墙 @col31,row15。gd=1 手位起点格 (31,15) 即实心 → 首查即死；
    // gd=-1 起点 (31,17) 向下走 rows≥16 扫掠带永不触 row15 → 通。
    const stLow = makeScene((s) => stoneAt(s, 31, 15));
    expect(canHitLine(stLow, 500, 250, 0, 0, 500, 400, 0, 0)).toBe(false);
    expect(canHitLine(stLow, 500, 278, 0, 0, 500, 400, 0, 0)).toBe(true);
    // 镜像挡 gd=-1 支：墙 @row17。gd=-1 起步格实心即死；gd=1 从 row15 上行(rows≤16)通。
    const stHigh = makeScene((s) => stoneAt(s, 31, 17));
    expect(canHitLine(stHigh, 500, 250, 0, 0, 500, 200, 0, 0)).toBe(true);
    expect(canHitLine(stHigh, 500, 278, 0, 0, 500, 200, 0, 0)).toBe(false);
  });

  it('石壁双侧翻转不变性：mirror(W)+gd=-1 ≡ W+gd=+1（全链四射线 OR 收敛面）', () => {
    // 行镜像映射 r→32−r（pcy=264 ⇒ 2*pcy=33*16，中心点 c_r=r*16+8 映到 (32−r)*16+8）；
    // 盒/目标关于 cy=264 自对称、锚行集 {15,16,17}↔自身，故四射线 OR 判在镜像下保等。
    const mirrorRows = (rows: number[]): number[] => rows.map((r) => 32 - r);
    const placeColWalls = (st: Store, rows: number[]): void => {
      for (const r of rows) stoneAt(st, 31, r);
    };
    const patterns: number[][] = [
      [],                                            // 空场
      [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24],  // 全列（含 D/A 带）
      [18, 19, 20],                                  // 下半带
      [12, 13, 14],                                  // 上半带（18..20 的镜像）
      [15],
      [17],
      [22, 23],
    ];
    const enemyOf = (): LOSBox => ({ x: 511, y: 244, w: 18, h: 40 });   // center=(520,264)，tile32 避开墙列
    for (const rows of patterns) {
      const stA = makeScene((s) => placeColWalls(s, rows));
      const stB = makeScene((s) => placeColWalls(s, mirrorRows(rows)));
      expect(playerCanHitEntity(stA, stand(1), enemyOf()))
        .toBe(playerCanHitEntity(stB, stand(-1), enemyOf()));
    }
    // 护栏（非 vacuous）：空场真、带心列假——不变性不是恒真恒假的空转
    expect(playerCanHitEntity(makeScene(), stand(1), enemyOf())).toBe(true);
    expect(playerCanHitEntity(
      makeScene((s) => placeColWalls(s, [8, 16, 24])), stand(1), enemyOf(),
    )).toBe(false);
  });

  it('真实 Player 结构流：Game.ts 两调用面传 this.player 实例 → gravDir 经本体直达射线族', () => {
    // Game.ts:21117 meleeCanHitLOS / :21890 PVP 直呼都以【Player 实体对象】作 p 参
    // ——LOSBox.gravDir 为可选字段后 Player.gravDir:number 结构化自动满足，
    // 调用点无需包裹改写（包裹反会丢原型 getter）。本测试以真实实例证编译流+
    // 数值与裸盒等价：
    const pl = new Player(300 * TILE, 300 * TILE, new Inventory());
    pl.x = 478; pl.y = 243; pl.w = 20; pl.h = 42; pl.facing = 1;
    pl.gravDir = -1;
    const e: LOSBox = { x: 600, y: 572, w: 18, h: 40 };
    // cx/cy 为 getter-only（Entity.ts:60）→ 兜底链 Center=fround(478+10)/fround(243+21)
    // 与显式站桩盒同值；编译期结构适配由本行直接实证（Game.ts 两调用面同构）
    const a = losRayAnchors(pl, e);
    expect(a.hyBC).toBe(278);                              // 翻侧链生效
    const plDown = new Player(0, 0, new Inventory());
    plDown.x = 478; plDown.y = 243; plDown.w = 20; plDown.h = 42; plDown.facing = 1;
    expect(losRayAnchors(plDown, e).hyBC).toBe(250);       // 缺省重力缺省手位
  });
});

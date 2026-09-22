// BJ244（2026-09-21）怪物粒子全量普查落刀：
// ★用户实报"飞龙（Wyvern）尾部也有粒子,本仓没有"——判谳【REFUTED】：
//   Terarria1457/Terraria/NPC.cs 全文件 932 处 Dust 调用普查（AI()主核 19858-41560、
//   AI_006_Worms 51506-52820、HitEffect 82492-90939、FindFrame、Transform、
//   ParticleOrchestraType 全枚举、AmbientSky.WyvernSkyEntity 全部读过）——
//   type 87-92（NPCID.cs:11245-11255 WyvernHead..WyvernTail）在 AI 移动面零尘零粒子
//   （★S4-B 勘误 BJ263 2026-09-22:「任何面均零尘」系过度声明——HitEffect 面有尘:
//   87-92 @NPC.cs:89933 hit=dust16 hitK50 scale1.5 velMul1.5 ng / death=n10,已由
//   BJ254 表（vanilla-npcdust.json）+spawnNpcDeathDust/spawnNpcHitDust 承载）；
//   1456/1458 交叉对拍同判（925/927 处均无 87 系）。terraria.wiki.gg Wyvern 页
//   无任何粒子/尾迹变更记载（最新可见性条目 1.3.5 贴图）。用户所见应为 1.4.5 新增
//   背景 ambience 飞龙（AmbientSky WyvernSkyEntity :1026,贴图 5 帧无粒子）或贴图
//   自绘尾迹的误认。按铁律"先定谳再动刀/禁止凭感觉补粒子"——飞龙不落刀,本测试
//   即判谳锁（防未来凭观感补粒子）。
// 本批真缺三面（普查→原版逐参数锚）：
//   ① 387 特斯拉炮塔部署环绕尘（NPC.cs:35416-35496）：部署 120t 内每 tick 8 粒
//      尘 226（scale0.5/α100/noGravity/vel0/position=Center+spinningpoint×num1087
//      +vector125;spinningpoint=(0,-30)旋 num1085×1.5×2π 后 ×(1,0.4),每档用后
//      ×-1 且取反跨档持续）;旧实现 ai1%6 掷 1 粒≈密度差 48 倍——升 1:1。
//   ② 388 火星无人机蓝尘拖尾双面（:35605-35619 每 tick 1 粒 vel=velocity/5、位=
//      Center+spin2（:35611-35617,14px 环绕偏移——★BJ251 补位覆写面+断言,旧注
//      "盒抖位保留"建模错误已纠）;:35715-35724 蓄力支 Next(4)==0 再 1 粒
//      vel=抖速+向外单位向量）——整缺补入。
//   ③ 412 日耀爬尾虫头火尘（:52201-52213）：spawnParticles 近似升级为原版尘通道
//      （尘 6/scale1+NextFloat×3/α100/noGravity+noLight/fadeIn=1/vel=0/位−4）。
// 断言：飞龙零粒子判谳锁（AI 面+shared 渐显尾）+①②③逐参数+对照弹（418 零 226、
// 388 自爆态零拖尾、621 渐显尘 5 在场证明尘捕获桩非哑）。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Enemy } from '../src/entities/Enemy';
import { World } from '../src/world/World';
import { Inventory } from '../src/items/Inventory';
import { Player } from '../src/entities/Player';
import { TILE } from '../src/core/constants';
import { martianDroneAI, teslaTurretAI } from '../src/entities/bossAI_martian';
import { crawltipedeAI } from '../src/entities/bossAI_lunar_misc';
import type { GameHooks } from '../src/entities/types';
import { seededRandom, BATTERY_SEED } from './seeded-rng';

beforeEach(() => { vi.spyOn(Math, 'random').mockImplementation(seededRandom(BATTERY_SEED)); });
afterEach(() => { vi.restoreAllMocks(); });

const W = 200, H = 160, FLOOR = 130;

type DustCall = {
  x: number; y: number; w: number; h: number; type: number;
  vx: number; vy: number; alpha: number; scale: number;
  noGravity: boolean; perfect: boolean;
  noLight?: boolean; fadeIn?: number;
};

function makeWorld(): World {
  const w = new World(W, H, 11, 'bj244-census');
  const st = w.store;
  w.groundLevel = 40;
  for (let x = 0; x < W; x++) {
    st.setTile(x, FLOOR, 1);
    st.setTile(x, FLOOR + 1, 1);
  }
  return w;
}

/** spawnDust/spawnParticles 双捕获桩 */
function makeHooks(w: World, dust: DustCall[], parts: number[], playerAt = { x: 100, y: FLOOR - 4 }) {
  const player = new Player(playerAt.x * TILE, playerAt.y * TILE, new Inventory());
  return {
    world: w, player,
    enemies: () => [] as Enemy[], critters: () => [], npcs: () => [],
    entities: { nextId: 1, add: () => {} },
    spawnDrop: () => null, damagePlayer: (): number => 0, addDamageNumber: () => {},
    onEnemyKilled: () => {}, spawnEnemy: () => {}, spawnParticles: () => { parts.push(1); },
    notifyInventoryChanged: () => {}, playSfx: () => {}, playSfxFiles: () => {},
    showPickupLabel: () => {}, cutTile: () => {},
    spawnDust: (
      x: number, y: number, wn: number, hn: number, type: number,
      sx = 0, sy = 0, alpha = 0, _color: unknown = null, scale = 1,
      noGravity = false, perfect = false,
    ) => {
      const rec: DustCall = {
        x, y, w: wn, h: hn, type, vx: sx, vy: sy, alpha, scale,
        noGravity, perfect,
      };
      dust.push(rec);
      // 返回活对象——调用方后置写 vx/vy/noLight/fadeIn/noGravity 可观测
      return rec as unknown as {
        vx: number; vy: number; x: number; y: number;
        noGravity: boolean; noLight: boolean; fadeIn: number;
      };
    },
    scene: {},
  } as unknown as GameHooks;
}

function spawn(vid: number, tx = 100, ty = FLOOR - 4): Enemy {
  const e = Enemy.fromVanilla(vid, tx * TILE, ty * TILE);
  expect(e).not.toBeNull();
  return e!;
}

/** ★BJ251 引擎 NewDust 链补全包装（scale 面）：捕获桩原样记录 spawnDust 的 Scale
 *  形参；原版引擎在 NewDust 内还有 比例抖 ±20%（Dust.cs:192,1+Next(-20,21)×0.01）
 *  与烟雾族特例 scale×0.7（Dust.cs:216-220,type 6 命中;1456/1457/1458 同句;本仓
 *  引擎 VanillaDust.spawn :275/:306-312 同式保真）→ 入池终值分布 = [1,4)×[0.8,1.2]×0.7
 *  = [0.56,3.36)。本包装按引擎同式补全链,使 ③ 的记录面 = 入池终值（断言带才能锁真
 *  分布——旧桩记形参原值,带 [0.8,4.8) 结构性恒绿=锁不住）。掷流口径：每粒 +1 掷
 *  （比例抖,引擎 :192 同掷型）;烟雾 ×0.7 非掷。仅本文件 ③ 使用（①② 锁形参原值,
 *  不套用）。 */
function wrapDustChain(g: GameHooks): GameHooks {
  const raw = g.spawnDust!.bind(g);
  return Object.assign({}, g, {
    spawnDust: (
      x: number, y: number, w: number, h: number, type: number,
      sx = 0, sy = 0, alpha = 0, color: { r: number; g: number; b: number; a: number } | null = null, scale = 1,
      noGravity = false, perfect = false,
    ) => {
      const d = raw(x, y, w, h, type, sx, sy, alpha, color, scale, noGravity, perfect) as
        unknown as DustCall | null;
      if (d) {
        d.scale = (1 + ((Math.random() * 41 | 0) - 20) * 0.01) * scale;   // Dust.cs:192 比例抖
        if (type === 6) d.scale *= 0.7;                                    // :220 烟雾特例（本测面只触 type 6）
      }
      return d;
    },
  }) as GameHooks;
}

describe('BJ244 飞龙判谳锁（原版零粒子——禁凭观感补）', () => {
  it('87 头 wormAI 90 tick + fixedUpdate 20 tick：spawnDust 与 spawnParticles 均恒零', () => {
    const w = makeWorld();
    const dust: DustCall[] = [], parts: number[] = [];
    const g = makeHooks(w, dust, parts);
    const e = spawn(87);
    const wormAI = (e as unknown as { wormAI(h: GameHooks, p: Player | null): void })
      .wormAI.bind(e);
    for (let t = 0; t < 90; t++) wormAI(g, g.player);
    for (let t = 0; t < 20; t++) e.fixedUpdate(1 / 60, g);
    expect(dust.length).toBe(0);
    expect(parts.length).toBe(0);
  });

  it('全段链 88/89/90/91/92 同判零粒子（尾段 92 是用户点名面）', () => {
    for (const vid of [88, 89, 90, 91, 92]) {
      const w = makeWorld();
      const dust: DustCall[] = [], parts: number[] = [];
      const g = makeHooks(w, dust, parts);
      const e = spawn(vid);
      for (let t = 0; t < 30; t++) e.fixedUpdate(1 / 60, g);
      expect(dust.length, `vid=${vid}`).toBe(0);
      expect(parts.length, `vid=${vid}`).toBe(0);
    }
  });

  it('捕获桩非哑对照：621 血鳗鱼渐显期 dust 5 ×2/tick 在场（:51556-51561 通道）', () => {
    const w = makeWorld();
    const dust: DustCall[] = [], parts: number[] = [];
    const g = makeHooks(w, dust, parts);
    const e = spawn(621);
    e.spawnAlpha = 255;                       // 出生渐显态（wormAI 建链侧约定）
    for (let t = 0; t < 4; t++) e.fixedUpdate(1 / 60, g);
    expect(dust.filter((d) => d.type === 5).length).toBeGreaterThanOrEqual(8);
  });
});

describe('BJ244 ① 387 特斯拉炮塔部署环绕尘 1:1（:35416-35496）', () => {
  it('部署期每 tick 恰 8 粒尘 226：α100/scale0.5/noGravity/perfect（vel0 位精确）', () => {
    const w = makeWorld();
    const dust: DustCall[] = [], parts: number[] = [];
    const g = makeHooks(w, dust, parts, { x: 100, y: FLOOR - 30 });
    const e = spawn(387, 100, FLOOR - 4);
    const snap: Array<{ cx: number; cy: number; ai1: number }> = [];
    for (let t = 0; t < 40; t++) {
      snap.push({ cx: e.cx, cy: e.cy, ai1: e.ai1 });
      teslaTurretAI(e, g, g.player);
    }
    // 每 tick 8 粒（40 tick 全在部署带）
    expect(dust.length).toBe(40 * 8);
    for (const d of dust) {
      expect(d.type).toBe(226);                              // 尘 226（:35485）
      expect(d.alpha).toBe(100);                             // :35485 第 7 参
      expect(d.scale).toBe(0.5);                             // :35485 第 9 参
      expect(d.noGravity).toBe(true);                        // :35486
      expect(d.perfect).toBe(true);                          // position/velocity 整字段覆写通道
    }
    // 首拍几何（ai1=1,ai1 递增先于尘段）：n1085=1/60；spinningpoint 每 k 首粒
    // 用当值、随后 ×-1 且取反【跨档持续】（vanilla 无逐档复位）→ 序列 [+,-,-,+,+,-,-,+]
    const s = snap[0];
    const a = (s.ai1 + 1) / 60 * 1.5 * Math.PI * 2;
    let spX = 30 * Math.sin(a), spY = -12 * Math.cos(a);
    const V125Y = [-15, -5, 5, 20];
    const N1087 = [0.15, 0.3, 0.6, 0.45];
    let idx = 0;
    for (let k = 0; k < 4; k++) {
      const d = dust[idx++];
      expect(d.x).toBeCloseTo(s.cx + spX * N1087[k], 4);
      expect(d.y).toBeCloseTo(s.cy + spY * N1087[k] + V125Y[k], 4);
      expect(d.vx).toBe(0); expect(d.vy).toBe(0);            // velocity=Vector2.Zero
      spX = -spX; spY = -spY;                                // 每档取反一次且持续
      const d2 = dust[idx++];
      expect(d2.x).toBeCloseTo(s.cx + spX * N1087[k], 4);
      expect(d2.y).toBeCloseTo(s.cy + spY * N1087[k] + V125Y[k], 4);
    }
  });
});

describe('BJ244 ② 388 火星无人机蓝尘拖尾双面（:35605-35619 / :35715-35724）', () => {
  it('悬浮态（ai0=0）每 tick 恰 1 粒拖尾①：type226/α100/scale0.5/noGravity/vel=v/5', () => {
    const w = makeWorld();
    const dust: DustCall[] = [], parts: number[] = [];
    // 玩家置于正上方 → aimAng=-π/2 ∉ (π/8,π-π/8) → 悬浮支持续、ai0 保持 0
    const g = makeHooks(w, dust, parts, { x: 100, y: FLOOR - 40 });
    const e = spawn(388, 100, FLOOR - 4);
    e.vx = 3; e.vy = -1;                                     // 定向锚
    for (let t = 0; t < 20; t++) {
      if (e.ai0 !== 3) { /* 悬浮/锁定演进,断言仅看 226 */ }
      const vxNow = e.vx, vyNow = e.vy, fNow = e.facing;
      const cxNow = e.cx, cyNow = e.cy;
      martianDroneAI(e, g, g.player);
      const d = dust.filter((x) => x.type === 226).pop();
      if (e.ai0 !== 3 && d) {
        expect(d.alpha).toBe(100);
        expect(d.scale).toBe(0.5);
        expect(d.noGravity).toBe(true);
        // velocity 覆写 = 拍前 velocity/5
        expect(d.vx).toBeCloseTo(vxNow / 5, 5);
        expect(d.vy).toBeCloseTo(vyNow / 5, 5);
        // ★BJ251 位覆写断言（:35611-35617）：位 = Center + spin2 —— (-10,10) 经
        //  spriteDirection==1 翻 X 后 RotatedBy(rotation 速度角钳 [-π/2,π/2])，
        //  ≈14px 环绕偏移面，【非】盒内抖动（旧注"盒抖位保留"建模错误已纠）
        const sd = Math.sign(vxNow) !== 0 ? -Math.sign(vxNow) : fNow;   // :35463-35465 本拍求值
        let rot = Math.atan2(vyNow, vxNow);                             // :35456
        if (rot < -Math.PI / 2) rot += Math.PI;                         // :35457-35462
        if (rot > Math.PI / 2) rot -= Math.PI;
        const sxp = sd === 1 ? 10 : -10;                                // spin2.X（==1 → 翻 X）
        expect(d.x).toBeCloseTo(cxNow + sxp * Math.cos(rot) - 10 * Math.sin(rot), 6);
        expect(d.y).toBeCloseTo(cyNow + sxp * Math.sin(rot) + 10 * Math.cos(rot), 6);
      }
    }
    // 非自爆态下 20 tick 至少 19 粒（每 tick 1 粒,允许至多 1 tick 进自爆）
    expect(dust.filter((x) => x.type === 226).length).toBeGreaterThanOrEqual(19);
  });

  it('蓄力态（ai0=1）拖尾②：1/4 掷率 + 向外漂移合成（vel 幅>纯拖尾①）', () => {
    const w = makeWorld();
    const dust: DustCall[] = [], parts: number[] = [];
    const g = makeHooks(w, dust, parts, { x: 100, y: FLOOR - 40 });
    const e = spawn(388, 100, FLOOR - 4);
    (e as unknown as { bInit: boolean }).bInit = true;       // 跳过首拍 ai0=0 复位
    e.ai0 = 1; e.ai1 = 0;
    e.ai2 = 1; e.ai3 = 0;                                    // 蓄力方向锚
    e.vx = 0.5; e.vy = 0;
    let ticks = 0;
    const perTick: DustCall[][] = [];
    for (let t = 0; t < 28 && e.ai0 === 1; t++) {
      ticks++;
      const mark = dust.length;
      martianDroneAI(e, g, g.player);
      perTick.push(dust.slice(mark));
    }
    // 28 tick 全程蓄力（风闸 30t 前不转态）；每 tick 恰 1 粒拖尾①（ai0!=3 门）
    expect(ticks).toBe(28);
    expect(perTick.every((arr) => arr.length >= 1)).toBe(true);
    // 拖尾② = 每 tick 第二粒（同一 tick 内拖尾①先发）——1/4 掷率带宽
    const trailB = perTick.filter((arr) => arr.length >= 2).map((arr) => arr[1]);
    expect(trailB.length).toBeGreaterThanOrEqual(2);
    expect(trailB.length).toBeLessThanOrEqual(12);           // 28×1/4 期望 7,带宽防脆
    for (const d of trailB) {
      expect(d.alpha).toBe(100);
      expect(d.scale).toBe(0.5);
      expect(d.noGravity).toBe(true);
      // vel = NewDust 抖速 + 单位向外向量：抖速 ≤2 每轴 → |vel| < 3.6；
      // 且向外合成 → |vel| ≥ |抖速+单位| 下界 0.2（拖尾①纯 v/5=0.1,量级可分）
      const mag = Math.hypot(d.vx, d.vy);
      expect(mag).toBeGreaterThan(0.2);
      expect(mag).toBeLessThan(3.6);
    }
  });

  it('对照弹：418 日耀行者零 226（其拖尾是尘 6）+ 388 自爆态零拖尾', () => {
    const w = makeWorld();
    const dust: DustCall[] = [], parts: number[] = [];
    const g = makeHooks(w, dust, parts, { x: 100, y: FLOOR - 40 });
    const c = spawn(418, 100, FLOOR - 4);
    for (let t = 0; t < 15; t++) martianDroneAI(c, g, g.player);
    expect(dust.filter((d) => d.type === 226).length).toBe(0);
    expect(dust.filter((d) => d.type === 6).length).toBeGreaterThan(0);  // 418 尘 6 拖尾在场

    const dust2: DustCall[] = [], parts2: number[] = [];
    const g2 = makeHooks(w, dust2, parts2, { x: 100, y: FLOOR - 40 });
    const b = spawn(388, 100, FLOOR - 4);
    (b as unknown as { bInit: boolean }).bInit = true;       // 跳过首拍 ai0=0 复位
    b.ai0 = 3; b.ai1 = 0;
    martianDroneAI(b, g2, g2.player);
    expect(dust2.filter((d) => d.type === 226).length).toBe(0);
  });
});

describe('BJ244 ③ 412 日耀爬尾虫头火尘升原版尘通道（:52201-52213）', () => {
  it('每 tick 恰 2 粒尘 6：α100/noGravity/noLight/fadeIn=1/vel=0/scale∈[0.56,3.36)/锚点−4', () => {
    const w = makeWorld();
    const dust: DustCall[] = [], parts: number[] = [];
    // ★BJ251 scale 带建模修正：旧带 [0.8,4.8) 漏乘烟雾特例 ×0.7（Dust.cs:216-220,
    //  type 6;1456/1457/1458 同句;仓引擎 VanillaDust.spawn :306-312 同式保真）——
    //  原版入池终值 = Scale形参[1,4)（:52204,1+NextFloat×3）× 比例抖[0.8,1.2]
    //  （Dust.cs:192）× 0.7 → 真分布 [0.56,3.36)。旧带下界 0.8 > 真下界 0.56 =
    //  换种子伪红源;旧桩又只记形参原值（无抖）使旧带结构性恒绿=锁不住真分布。
    //  改 = wrapDustChain 补全引擎链 + 真分布带。
    const g = wrapDustChain(makeHooks(w, dust, parts, { x: 110, y: FLOOR - 30 }));
    const e = spawn(412, 100, FLOOR - 20);
    e.vx = 2; e.vy = 1;
    for (let t = 0; t < 12; t++) {
      crawltipedeAI(e, g, g.player);
    }
    expect(dust.length).toBe(24);                             // 12 tick × 2 粒
    for (const d of dust) {
      expect(d.type).toBe(6);
      expect(d.alpha).toBe(100);
      expect(d.noGravity).toBe(true);
      expect(d.noLight).toBe(true);                           // obj.noLight = true
      expect(d.fadeIn).toBe(1);                               // obj.fadeIn = 1f
      expect(d.vx).toBe(0); expect(d.vy).toBe(0);             // obj.velocity = Zero
      expect(d.scale).toBeGreaterThanOrEqual(0.56);           // [1,4)×[0.8,1.2]×0.7（Dust.cs:192/:220）
      expect(d.scale).toBeLessThan(3.36);
    }
  });
});

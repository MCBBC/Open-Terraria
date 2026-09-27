// BJ372 充能爆破炮蓄力效果回归（2026-09-27 用户实报"没有蓄力效果"）：
//   定谳 = 460 AI 蓄力视觉面（两段尘发射）整缺：
//   ① 蓄力尘（P.cs:67473-67493 [1457] = :63513-63535 [1456]）：ai0>10 严格门未满蓄,
//      每 tick num20+1 粒 226 电尘（k 奇偶 scale 0.4/0.65）在枪口前 18px 点
//      （vector11 = Center + UnitX×18 RotatedBy(rotation−π/2)）周围半径 (12−num20×2)
//      圆环出生（NewDust 盒 16×16 @ vector12−(8,8)）,速度覆写 = Normalize(前点−出生点)
//      ×1.5×(10−num20×2)/10（档 0/1/2 → 1.5/1.2/0.9,汇向枪口）;noGravity;
//      customData=player → Dust.cs:2337-2341 position += 主角本拍位移
//   ② 满蓄喷焰（P.cs:67495-67518 [1457] = :63537-63560 [1456]）：每 tick 2 粒
//      （scale 0.35/0.45）自枪口前 14px 点 ±(π/4)×0.8×|num28| 锥 6px 处出生
//      （NewDust 盒 24×24 @ vector14−(12,12)）,速度 = 锥向 × Lerp(1.5,9,
//      GetLerpValue(1,0,|num28|,clamped))（中轴 9、|num28|≥1 封底 1.5）;fadeIn=0.5
//   同批补 VanillaDust case 226 的 followPlayer 消费面（:2337-2341,原版 226 分支
//   customData=Player 持续跟随——此前 R4-30 登记不建模,今 460 蓄力尘成首位消费方）。
//   手法：weapon-prism-fix.test.ts makeGame 桩 + spawnDust 录制器（VDust 面板回吐,
//   实体侧覆写字段全记录）;种子掷（Math.random mockReturnValueOnce）做几何全等判别。
import { describe, it, expect, vi, afterEach } from 'vitest';
import { ChargedBlaster } from '../src/entities/PrismProj';
import { VanillaDust } from '../src/fx/VanillaDust';
import { World } from '../src/world/World';
import { TILE } from '../src/core/constants';
import type { GameHooks } from '../src/entities/types';

/** spawnDust 录制器：盒参/scale/型原样入账,返回可覆写 VDust 面板（实体侧写 vx/vy/
 *  noGravity/fadeIn/followPlayer 全落账）——真实池随机化（位/速/帧抖）不掺和判别 */
interface DustRec {
  x: number; y: number; w: number; h: number; type: number; scale: number;
  d: { vx: number; vy: number; noGravity: boolean; fadeIn: number; followPlayer: boolean };
}
function makeGame(projectiles: unknown[], dust: DustRec[]) {
  return {
    world: new World(200, 200, 30, 'open'),
    player: { cx: 90 * TILE, cy: 90 * TILE } as unknown,
    enemies: () => [], critters: () => [],
    entities: { nextId: 1, add: (e: unknown) => { projectiles.push(e); } },
    playSfx: () => {}, playSfxFiles: () => {}, playSfxFile: () => {},
    spawnParticles: () => {}, addDamageNumber: () => {}, spawnDrop: () => null,
    damagePlayer: (): number => 0, notifyInventoryChanged: () => {},
    onEnemyKilled: () => {}, spawnEnemy: () => {}, cutTile: () => {},
    spawnDust: (x: number, y: number, w: number, h: number, type: number,
      _sx = 0, _sy = 0, _a = 0, _c = null, scale = 1, noGravity = false) => {
      const d = { vx: 0, vy: 0, noGravity, fadeIn: 0, followPlayer: false };
      dust.push({ x, y, w, h, type, scale, d });
      return d;
    },
  } as unknown as GameHooks;
}
const mkBl = (projectiles: unknown[]) => {
  const bl = new ChargedBlaster(1, 0, 100, 2,
    () => true, () => ({ x: 91 * TILE, y: 90 * TILE }), () => true);
  projectiles.push(bl);
  return bl;
};
// 玩家桩 (90T,90T)、初向 (1,0)：晶体 Center=(90T,90T),枪口前点 = Center+dir×N
const PX = 90 * TILE, PY = 90 * TILE;

afterEach(() => { vi.restoreAllMocks(); });

describe('BJ372 460 蓄力尘（P.cs:67473-67493）', () => {
  it('① 严格门 ai0>10：t1-10（charge=1..10）零尘;t11（=11）起每 tick 1 粒（num20=0 → num20+1）', () => {
    const projectiles: unknown[] = [], dust: DustRec[] = [];
    const game = makeGame(projectiles, dust);
    const bl = mkBl(projectiles);
    for (let t = 1; t <= 10; t++) bl.fixedUpdate(1, game);
    expect(dust.length).toBe(0);               // charge=10 不 > 10（原版严格大于）
    bl.fixedUpdate(1, game);                   // t11：charge=11
    expect(dust.length).toBe(1);
    for (let t = 12; t <= 79; t++) bl.fixedUpdate(1, game);
    expect(dust.length).toBe(1 + 68);          // stage0 每 tick 恒 1 粒
  });

  it('② 三档粒数：t80-179 每 tick 2 粒（num20=1）；满蓄 t180+ 转 2 粒喷焰（24 盒）', () => {
    const projectiles: unknown[] = [], dust: DustRec[] = [];
    const game = makeGame(projectiles, dust);
    const bl = mkBl(projectiles);
    for (let t = 1; t <= 79; t++) bl.fixedUpdate(1, game);
    const n79 = dust.length;
    bl.fixedUpdate(1, game);                   // t80：stage1
    expect(dust.length - n79).toBe(2);
    for (let t = 81; t <= 179; t++) bl.fixedUpdate(1, game);
    const n179 = dust.length;
    expect(n179 - n79).toBe(2 + 99 * 2);       // t80 + 81..179 各 2
    for (let t = 180; t <= 190; t++) bl.fixedUpdate(1, game);
    const recent = dust.slice(-22);
    expect(recent.every((r) => r.w === 24 && r.h === 24)).toBe(true);   // 全转 24×24 喷焰盒
    expect(recent.every((r) => r.d.fadeIn === 0.5)).toBe(true);         // 喷焰 fadeIn=0.5
    expect(dust.some((r) => r.w === 16)).toBe(true);                    // 蓄力尘 16×16 存在于前段
  });

  it('③ scale 奇偶序列：stage1 双粒 = 0.4/0.65；喷焰双粒 = 0.35/0.45（:67479/:67503）', () => {
    const projectiles: unknown[] = [], dust: DustRec[] = [];
    const game = makeGame(projectiles, dust);
    const bl = mkBl(projectiles);
    for (let t = 1; t <= 79; t++) bl.fixedUpdate(1, game);
    bl.fixedUpdate(1, game);                   // t80 双粒
    expect(dust.slice(-2).map((r) => r.scale)).toEqual([0.4, 0.65]);
    for (let t = 81; t <= 179; t++) bl.fixedUpdate(1, game);
    bl.fixedUpdate(1, game);                   // t180 喷焰双粒
    expect(dust.slice(-2).map((r) => r.scale)).toEqual([0.35, 0.45]);
  });

  it('④ 几何+汇向速度全等（种子掷 0.25→角 π/2）：盒 (fx−8,fy+4,16,16)、速度 (0,−1.5) 汇向枪口', () => {
    const projectiles: unknown[] = [], dust: DustRec[] = [];
    const game = makeGame(projectiles, dust);
    const bl = mkBl(projectiles);
    for (let t = 1; t <= 10; t++) bl.fixedUpdate(1, game);
    vi.spyOn(Math, 'random').mockReturnValueOnce(0.25);   // 角 = 0.25×2π = π/2
    bl.fixedUpdate(1, game);                   // t11：stage0 单粒
    expect(dust.length).toBe(1);
    const r = dust[0];
    const fx = PX + 18, fy = PY;               // vector11 = Center + dir×18
    const px = fx + Math.cos(Math.PI / 2) * 12, py = fy + Math.sin(Math.PI / 2) * 12;
    expect(r.type).toBe(226);
    expect(r.x).toBe(px - 8); expect(r.y).toBe(py - 8);   // NewDust 盒 16×16 @ vector12−(8,8)
    expect(r.w).toBe(16); expect(r.h).toBe(16);
    expect(r.d.noGravity).toBe(true);
    expect(r.d.followPlayer).toBe(true);       // customData=player → 226 跟随（Dust.cs:2337-2341）
    // 速度 = Normalize(vector11−vector12)×1.5×(10−0×2)/10：出生点在正下方 12px → 汇向 = (0,−1)×1.5
    expect(r.d.vx).toBe(0);
    expect(r.d.vy).toBeCloseTo(-1.5, 12);
    // 对照掷 0 → 角 0 → 出生点在正右 12px → 汇向 (−1,0)×1.5
    vi.spyOn(Math, 'random').mockReturnValueOnce(0);
    bl.fixedUpdate(1, game);                   // t12
    const r2 = dust[1];
    expect(r2.x).toBe(fx + 12 - 8);
    expect(r2.d.vx).toBeCloseTo(-1.5, 12);
    expect(r2.d.vy).toBeCloseTo(0, 12);
  });
});

describe('BJ372 460 满蓄喷焰（P.cs:67495-67518）', () => {
  it('⑤ 中轴速度 9 / 锥缘封底 1.5（Lerp(1.5,9,GetLerpValue(1,0,|num28|))）+ 速度∥锥向', () => {
    const projectiles: unknown[] = [], dust: DustRec[] = [];
    const game = makeGame(projectiles, dust);
    const bl = mkBl(projectiles);
    for (let t = 1; t <= 179; t++) bl.fixedUpdate(1, game);
    const n179 = dust.length;                  // 蓄力尘已入账,只看 t180 增量
    // num28 = roll×2π−π ∈ (−π,π]；dAng = 0 + num28×(π/4)×0.8；速度 = 锥向×Lerp
    vi.spyOn(Math, 'random').mockReturnValueOnce(0.5)     // l0：num28 = 0 → 中轴 → spd 9
      .mockReturnValueOnce(0.75);                         // l1：num28 = π/2 ≥ 1 → 封底 spd 1.5
    bl.fixedUpdate(1, game);                   // t180（charge 179→180 满蓄首拍）
    expect(dust.length - n179).toBe(2);
    const fx = PX + 14, fy = PY;               // vector13 = Center + dir×14
    const [j0, j1] = dust.slice(-2);
    // 喷焰 0：中轴正右
    expect(j0.w).toBe(24); expect(j0.h).toBe(24);
    const px0 = fx + Math.cos(0) * 6, py0 = fy + Math.sin(0) * 6;
    expect(j0.x).toBe(px0 - 12); expect(j0.y).toBe(py0 - 12);
    expect(j0.d.vx).toBeCloseTo(9, 12); expect(j0.d.vy).toBeCloseTo(0, 12);
    expect(j0.d.fadeIn).toBe(0.5);
    expect(j0.d.followPlayer).toBe(true);
    // 喷焰 1：|num28|=π/2 → t=clamp(1−π/2)=0 → spd 1.5;方向 = 锥向单位向
    const dAng1 = 0.5 * Math.PI * (Math.PI / 4) * 0.8;
    const px1 = fx + Math.cos(dAng1) * 6, py1 = fy + Math.sin(dAng1) * 6;
    expect(j1.x).toBe(px1 - 12); expect(j1.y).toBe(py1 - 12);
    expect(j1.d.vx).toBeCloseTo(Math.cos(dAng1) * 1.5, 12);
    expect(j1.d.vy).toBeCloseTo(Math.sin(dAng1) * 1.5, 12);
  });

  it('⑥ 蓄力面补刀不扰动发射门：459 节拍 1/10/20/30/40/50（…计 9 发至 t150）+ t180 发 461 光束', () => {
    const projectiles: unknown[] = [], dust: DustRec[] = [];
    const game = makeGame(projectiles, dust);
    const bl = mkBl(projectiles);
    for (let t = 1; t <= 150; t++) bl.fixedUpdate(1, game);
    const bolts = projectiles.filter((q) => (q as { projId?: number }).projId === 459);
    expect(bolts.length).toBe(9);              // 1/10/20/30/40/50/90/120/150（weapon-prism-fix ④ 同账）
    for (let t = 151; t <= 180; t++) bl.fixedUpdate(1, game);   // 蓄到 180
    expect(bl.beam).toBeTruthy();              // 461 光束同拍（发射门不受尘影响）
    expect(bl.beam!.damage).toBe(150);         // (int)(100×1.5)
  });
});

describe('BJ372 VanillaDust case 226 followPlayer 消费面（Dust.cs:2337-2341）', () => {
  it('⑦ followPlayer 尘 position += 主角本拍位移（持续,不清位）;对照尘只走速度', () => {
    const vd = new VanillaDust();
    const a = vd.spawn(100, 100, 16, 16, 226, 3, 0, 0, null, 0.4);
    const b = vd.spawn(100, 100, 16, 16, 226, 3, 0, 0, null, 0.4);
    expect(a).toBeTruthy(); expect(b).toBeTruthy();
    for (const d of [a!, b!]) { d.noGravity = true; d.vx = 1; d.vy = 0.5; }
    a!.followPlayer = true;                    // customData=Player 等价通道
    const ax0 = a!.x, ay0 = a!.y, bx0 = b!.x, by0 = b!.y;
    vd.update(0, 0, 100000, 100000, 5, -3, null, null, null);
    // 共同速度位移（226：noGravity → ×0.93 再 ×(0.97,0.99)）之后 follow 尘额外 += (5,−3)
    expect(a!.x - ax0).toBeCloseTo((b!.x - bx0) + 5, 10);
    expect(a!.y - ay0).toBeCloseTo((b!.y - by0) - 3, 10);
    vd.update(0, 0, 100000, 100000, 5, -3, null, null, null);   // 持续跟随（原版不清 customData）
    expect(a!.x - ax0).toBeCloseTo((b!.x - bx0) + 10, 10);
  });

  it('⑧ 无 spawnDust 桩（旧桩/池缺省）：200 tick 静默不崩（?. 契约）', () => {
    const projectiles: unknown[] = [];
    const game = makeGame(projectiles, []);
    delete (game as { spawnDust?: unknown }).spawnDust;
    const bl = mkBl(projectiles);
    expect(() => { for (let t = 1; t <= 200; t++) bl.fixedUpdate(1, game); }).not.toThrow();
    expect(bl.beam).toBeTruthy();
  });
});

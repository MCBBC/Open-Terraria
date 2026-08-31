// 台账清偿批回归（2026-08-31，approx-registry M 级武器面 A①②③/B⑤ + C 档）：
//   A① Daybreak 953 爆炸 AoE（AI_117 扩盒 Damage 数值面）
//   A② Spear 三类伴生弹生成门（343/228/1107-1109,缩回相+单发闩）
//   A③ Chain Guillotines 481 出程撞块截停（tileCollide 出程真值）
//   A④ 光刃再掷召回门（recallGate）
//   B⑤ 彩虹棒 X 钳符号/Y 缓降特例（P.cs:19798-19821）
import { describe, it, expect } from 'vitest';
import { TileStore } from '../src/world/TileStore';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import {
  DaybreakFlare, DaybreakExplosionProj, daybreakExplosionSide,
  SpearProj, Boomerang, GlowstickProj, PHASEBLADE_PROJ,
} from '../src/entities/WeaponProj';
import { TILE } from '../src/core/constants';
import type { GameHooks } from '../src/entities/types';

const W = 200, H = 260;
// ★H=260（非 120）:Collision.CanHit 钳制上界 maxTilesY−40——矮世界里 row≥80 全被
// 钳进天空带导致视线门恒真（TileStore 网格行 ≥ 世界高−40 在 LOS 域外）。本文件
// 342 CanHit 门断言依赖真实扫描域,须保证墙/地面行 < H−40。

interface DustRec { type: number; x: number; y: number; vx: number; vy: number; scale: number; noGravity: boolean; fadeIn: number; alpha: number }

function mkHooks(opts: { wallColumn?: number; wallRows?: [number, number] } = {}) {
  const store = new TileStore(W, H);
  for (let x = 0; x < W; x++) for (let y = 100; y < H; y++) store.setTile(x, y, 1);
  if (opts.wallColumn !== undefined) {
    const [r0, r1] = opts.wallRows ?? [80, 99];
    for (let y = r0; y <= r1; y++) store.setTile(opts.wallColumn, y, 1);
  }
  const player = new Player(50 * TILE, 90 * TILE, new Inventory());
  const enemies: Array<Record<string, unknown>> = [];
  const projectiles: unknown[] = [];
  const dusts: DustRec[] = [];
  const sfxFiles: string[] = [];
  const sfxNames: string[] = [];
  const sfxWav: string[] = [];
  const hooks = {   // mock 简化面统一 unknown→GameHooks 收口（tests/weapons-entities 惯例）
    world: { store },
    player,
    enemies: () => enemies,
    critters: () => [],
    spawnDrop: () => null,
    damagePlayer: () => {},
    addDamageNumber: () => {},
    cutTile: () => {},
    onEnemyKilled: () => {},
    spawnEnemy: () => {},
    spawnParticles: () => {},
    notifyInventoryChanged: () => {},
    playSfx: (n: string) => sfxNames.push(n),
    playSfxFiles: (f: string[]) => sfxFiles.push(...f),
    playSfxFile: (f: string) => sfxWav.push(f),
    showPickupLabel: () => {},
    spawnFriendlyProj: (e: unknown) => projectiles.push(e),
    spawnDust: (x: number, y: number, _w: number, _h: number, type: number,
      sx = 0, sy = 0, alpha = 0) => {
      // 最小 VDust 面：位置=盒内均匀/速度含 ±2 抖动（fx/VanillaDust.spawn 同源抖动语义）
      const d = {
        type, x: x + Math.random() * 5, y: y + Math.random() * 5,
        vx: sx + (Math.random() * 41 - 20) * 0.1, vy: sy + (Math.random() * 41 - 20) * 0.1,
        scale: 1, noGravity: false, fadeIn: 0, alpha,
        noLight: false, noLightEmittance: false, color: null, rotation: 0,
        fx: 0, fy: 0, followPlayer: false, followOnce: false, dyeVid: -1,
      };
      dusts.push(d as unknown as DustRec);
      return d;
    },
  } as unknown as GameHooks;
  return { hooks, player, store, enemies, projectiles, dusts, sfxFiles, sfxNames, sfxWav };
}

type EnemyRec = Record<string, unknown> & {
  id: number; x: number; y: number; w: number; h: number; dead?: boolean;
  hits: Array<{ d: number; kx: number }>;
};

function addEnemy(enemies: EnemyRec[], id: number, ex: number, ey: number, w = 60, h = 40): EnemyRec {
  const e = {
    id, x: ex, y: ey, w, h, dead: false, hp: 999, maxHp: 999, iframes: 0,
    hits: [] as Array<{ d: number; kx: number }>,
    hurt(this: { x: number; w: number }, d: number, kx: number) {
      // 入参面与 hitEnemies 调用序对齐（其余可选参省略）
      (this as unknown as EnemyRec).hits.push({ d, kx });
      return true;
    },
  };
  // cx/cy = Entity/Enemy 暴露的中心 getter（DaybreakFlare 附着相直读 t.cx——
  // 缺省 mock 无此面会让附着坐标 NaN,与实体域语义不符）
  Object.defineProperty(e, 'cx', { get: () => e.x + e.w / 2, enumerable: true });
  Object.defineProperty(e, 'cy', { get: () => e.y + e.h / 2, enumerable: true });
  enemies.push(e as unknown as EnemyRec);
  return e as unknown as EnemyRec;
}

function run(e: { fixedUpdate: (dt: number, g: GameHooks) => void; dead?: boolean }, g: GameHooks, n: number): void {
  for (let i = 0; i < n && !e.dead; i++) e.fixedUpdate(1 / 60, g);
}

describe('A① Daybreak 953 爆炸 AoE（AI_117 扩盒 Damage :35095-35212）', () => {
  it('扩盒边长 = trunc(52×(ai1+0.01))，出生系数域 [0.85,2.0] → 盒边 [44..104]', () => {
    expect(daybreakExplosionSide(0.85)).toBe(44);   // trunc(52×0.86)
    expect(daybreakExplosionSide(2.0)).toBe(104);   // trunc(52×2.01)
    expect(daybreakExplosionSide(1.0)).toBe(Math.trunc(52 * 1.01)); // 52
    let lo = 999, hi = 0;
    for (let i = 0; i < 400; i++) {
      const s = daybreakExplosionSide(0.85 + Math.random() * 1.15);
      lo = Math.min(lo, s); hi = Math.max(hi, s);
    }
    expect(lo).toBeGreaterThanOrEqual(44);
    expect(hi).toBeLessThanOrEqual(104);
  });

  it('附着镖死亡 → Kill 掷 953（伤满额/kb10）→ 首拍扩盒对盒内敌单次结算', () => {
    const t = mkHooks();
    const px = t.player.cx, py = t.player.cy;
    // 敌摆在飞行线上（vx=6/tick×2 子步,大盒宽 60 必然捕获）
    addEnemy(t.enemies as EnemyRec[], 1, px + 12, py - 20);
    const flare = new DaybreakFlare(px, py, 6, 0, 50, 2);
    run(flare, t.hooks, 200);
    // 已命中并附着 → 敌死后目标失效 → killNow → 掷 953
    (t.enemies[0] as EnemyRec).dead = true;
    run(flare, t.hooks, 8);
    expect(t.projectiles.length).toBeGreaterThanOrEqual(1);
    const boom = (t.projectiles.find((p) => p instanceof DaybreakExplosionProj)) as DaybreakExplosionProj | undefined;
    expect(boom).toBeDefined();
    // 新敌放在爆炸盒内（min 边 44 → 距心 ≤22px 内必中）后首拍结算单次
    const bx = boom!.x + boom!.w / 2, by = boom!.y + boom!.h / 2;
    const e2 = addEnemy(t.enemies as EnemyRec[], 2, bx - 20, by - 20);
    boom!.fixedUpdate(1 / 60, t.hooks);           // 首拍:扩盒+Damage+音尘
    expect(boom!.w).toBeGreaterThanOrEqual(44);      // trunc(52×scale) 扩盒生效
    expect(boom!.h).toBe(boom!.w);
    expect(e2.hits.length).toBe(1);
    expect(e2.hits[0].d).toBe(50);          // 无 melee 类旗 → 不掷暴击、伤害原样
    expect(Math.abs(e2.hits[0].kx)).toBe(10);   // NewProjectile kb=10f（:73405）
    run(boom!, t.hooks, 30);
    expect(e2.hits.length).toBe(1);                  // 后续拍不再结算（单窗）
    expect(boom!.dead).toBe(true);
  });

  it('爆炸存续 = 3×projFrames[953]=15 tick；首拍后不再结算（usesLocalNPCImmunity 单窗）', () => {
    const t = mkHooks();
    const flare = new DaybreakFlare(50 * TILE, 90 * TILE, 4, 0, 40, 1);
    run(flare, t.hooks, 300);   // 无敌 → 计数/timeLeft 门自灭,同样掷 953
    const boom = (t.projectiles.find((p) => p instanceof DaybreakExplosionProj)) as DaybreakExplosionProj | undefined;
    expect(boom).toBeDefined();
    // 15 tick 生命周期计步（不依赖盒内目标;仅验证寿命门）
    for (let i = 0; i < 15 && !boom!.dead; i++) boom!.fixedUpdate(1 / 60, t.hooks);
    expect(boom!.dead).toBe(true);
  });
});

describe('A② Spear 三类伴生弹生成门（1458 P.cs:46749-46802）', () => {
  /** 长矛伴生掷点在缩回相(itemAnimation<max/3)——dur=T 时伸出相≈前 2/3,缩回相末 1/3 */
  function mkSpear(projId: number, dmg = 40, kb = 4) {
    const t = mkHooks();
    const calls: Array<{ x: number; y: number; vx: number; vy: number; projId: number; dmg: number; kb: number; extra?: { timeLeft?: number } }> = [];
    const dur = 30;
    const spear = new SpearProj(1, 0, 5, dur, dmg, kb, projId);
    spear.spawnProj = (x, y, vx, vy, sProj, sDmg, sKb, extra) => {
      calls.push({ x, y, vx, vy, projId: sProj, dmg: sDmg, kb: sKb, extra });
    };
    return { ...t, calls, spear, dur };
  }

  it('342 北极：缩回相一次性掷 343,v×2.4/kb×0.85;伸出相零掷', () => {
    const t = mkSpear(342, 40, 4);
    run(t.spear, t.hooks, t.dur);
    expect(t.calls.filter((c) => c.projId === 343).length).toBe(1);
    const c = t.calls[0];
    expect(c.vx / 5).toBeCloseTo(2.4, 5);       // v = dx×spd×2.4（dx=1）
    expect(c.dmg).toBe(40);                     // 伤满额
    expect(c.kb).toBeCloseTo(4 * 0.85, 5);      // kb×0.85
    // CanHit 放行（空旷地面上方视线通透）→ 有掷
    expect(c.x).toBeGreaterThan(50 * TILE);     // 弹体随前刺越过玩家中心
  });

  it('222 叶绿 partisan：缩回相一次性掷 228,速度原样/伤·kb 满额', () => {
    const t = mkSpear(222, 36, 3);
    run(t.spear, t.hooks, t.dur);
    expect(t.calls.filter((c) => c.projId === 228).length).toBe(1);
    expect(t.calls[0].vx / 5).toBeCloseTo(1, 5);  // v 原样（dx×spd/dx×spd×1）
    expect(t.calls[0].dmg).toBe(36);
    expect(t.calls[0].kb).toBe(3);
  });

  it('367 黑曜鱼叉：Next(1,4)=1..3 枚 1107+rand(3),damage×0.5/kb0/timeLeft∈[30,149],同拍齐发', () => {
    const t = mkSpear(367, 41, 7);
    run(t.spear, t.hooks, t.dur);
    expect(t.calls.length).toBeGreaterThanOrEqual(1);
    expect(t.calls.length).toBeLessThanOrEqual(3);
    const firstTick = t.calls[0];
    for (const c of t.calls) {
      expect([1107, 1108, 1109]).toContain(c.projId);
      expect(c.dmg).toBe(Math.trunc(41 * 0.5));
      expect(c.kb).toBe(0);
      expect(c.extra?.timeLeft).toBeGreaterThanOrEqual(30);
      expect(c.extra!.timeLeft!).toBeLessThanOrEqual(149);
      // 同一出生点（首拍齐发,无逐拍分批）
      expect(c.y).toBe(firstTick.y);
    }
    // 速度乘区:vX = dx×spd×fX×fG×2,fX∈[0.7,1.3]/fG∈[0.8,1.2] → ratio∈[1.12,3.12]
    const ratio = t.calls[0].vx / 5;
    expect(ratio).toBeGreaterThan(1.119);
    expect(ratio).toBeLessThan(3.121);
  });

  it('342 单发闩先于 CanHit 门判定——失线期锁定即弃掷次（latch-before-gate 真值序）', () => {
    // 墙列置于玩家(列50-52)右侧 tx=56 全高封死;缩回相首拍弹体已在 tx≈60 →
    // 玩家盒→弹体盒直线被墙截断 → canHit false
    const t = mkHooks({ wallColumn: 56, wallRows: [84, 99] });
    const calls: number[] = [];
    const spear = new SpearProj(1, 0, 5, 30, 40, 4, 342);
    spear.spawnProj = (_x, _y, _vx, _vy, sProj) => calls.push(sProj);
    run(spear, t.hooks, 30);
    expect(calls.filter((n) => n === 343).length).toBe(0);
  });
});

describe('A③ Chain Guillotines 481 出程撞块截停（tileCollide 出程真值 :5563-5572/:19632-19665）', () => {
  it('出程撞墙不再穿墙:实体停在墙面外侧并立即转回收（不反转速度走回收制速）', () => {
    // 玩家 @ tile(50,90)；墙列 tx=58 全高封死 → 水平飞行 ~70px 内必撞
    const t = mkHooks({ wallColumn: 58, wallRows: [80, 99] });
    const guil = new SpearProj(1, 0, 20, 600, 25, 4, 481);
    for (let i = 0; i < 40 && !guil.dead; i++) guil.fixedUpdate(1 / 60, t.hooks);
    const wallLeftX = 58 * TILE;
    // 弹体从未越入墙格（22px 盒左缘不可 ≥ 墙左面 − 容差）
    expect(guil.x + guil.w).toBeLessThanOrEqual(wallLeftX + 1);
    // 收刀途中会被近手门(<50px)消亡——整段循环不死则中途已转回收并回手
    run(guil, t.hooks, 200);
    expect(guil.dead).toBe(true);           // 返回段与玩家 AABB 近距 Kill(:25090-25092)
  });

  it('发射响尘/挖掘音一次接上（HitTiles 尘 + SoundID 0）', () => {
    const t = mkHooks({ wallColumn: 58, wallRows: [80, 99] });
    const guil = new SpearProj(1, 0, 20, 600, 25, 4, 481);
    for (let i = 0; i < 40 && !guil.dead; i++) guil.fixedUpdate(1 / 60, t.hooks);
    expect(t.sfxNames).toContain('dig');
  });
});

describe('A④ 光刃再掷召回门（P.cs:39717-39722 IsAPhaseblade+controlUseItem）', () => {
  it('recallGate 电平 → ai0 提前置 1 进返回段（returning true）', () => {
    const t = mkHooks();
    expect(PHASEBLADE_PROJ.has(1067)).toBe(true);
    const blade = new Boomerang(t.player.cx, t.player.cy, 14, -2, 30, 4, 1067);
    blade.recallGate = () => true;             // 持同类光刃按住使用键
    blade.fixedUpdate(1 / 60, t.hooks);     // 首 tick 即应置召回
    expect(blade.returning).toBe(true);
    // 回收朝玩家飞 → 逐步贴近直到回手消亡
    run(blade, t.hooks, 200);
    expect(blade.dead).toBe(true);
  });
  it('无 recallGate（缺省电平假）→ 光刃照常滞留出程', () => {
    const t = mkHooks();
    const blade = new Boomerang(t.player.cx, t.player.cy, 14, -2, 30, 4, 1067);
    blade.fixedUpdate(1 / 60, t.hooks);
    expect(blade.returning).toBe(false);
  });
});

describe('B⑤ 彩虹棒反弹钳档（1458 P.cs:19798-19821）', () => {
  it('快掷触墙 → 弹性主档 v=-lastV×0.99（X 轴碰撞旗标路径）', () => {
    const t = mkHooks({ wallColumn: 58, wallRows: [40, 99] });   // 横贯弹体行的墙列
    const fast = new GlowstickProj(58 * TILE - 14, 60 * TILE, 5, 0, 1089);
    let flippedAtLeastOnce = false;
    for (let i = 0; i < 30 && !flippedAtLeastOnce; i++) {
      fast.fixedUpdate(1 / 60, t.hooks);
      if (fast.vx > -5 && fast.vx < 0) flippedAtLeastOnce = true;
    }
    expect(flippedAtLeastOnce).toBe(true);
    expect(fast.vx).toBeCloseTo(-4.95, 5);     // -lastV×0.99 弹性主档
  });

  it('Y 缓降特例:lastVy∈(0,1) 触撞 → 定值 −1 上弹（防贴底蠕动,旧实现缺该档）', () => {
    const t = mkHooks();
    // y+h 恰探入地面行的第一拍（vy=0.6,前 5 tick 无重力叠加）
    const stick = new GlowstickProj(90 * TILE, 100 * TILE - 6 - 0.01, 0, 0.6, 1089);
    stick.fixedUpdate(1 / 60, t.hooks);
    expect(stick.vy).toBe(-1);
  });
});

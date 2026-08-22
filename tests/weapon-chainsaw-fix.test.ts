// 链锯/插孔锤 修复批回归（2026-08-22 武器审计 ❌ 清偿）：
//   ① 音效分档（Projectile.cs:23866-23878）：持械物品 pick>0 → Item190 每 15t、
//     否则 Item189 每 20t（509 axe30/pick0、252 hammer90/pick0 均走 189 档）
//   ② 火花尘系数（:23933-23941）：出生 = position+velocity×Next(6,10)×0.1
//     （单掷同乘双轴 0.6-0.9，曾 X 0.36-0.6/Y 恒 0.06 分乘）+ X−4、noGravity、
//     vy = −Next(7,13)×0.15（曾把 ×0.15 系数当全值落 grav）
//   ③ 挂手锚 RotatedRelativePoint(MountedCenter)（:23879 → Player.cs:4063-4089，
//     曾裸 MountedCenter）+ 瞄准向归一×shootSpeed×scale（:23884-23902）+
//     velocity.X 抖动 ×(1+Next(−3,4)×0.01)（:23932）
//   ④ 252 叶绿插孔锤持械弹存在性（Item.cs:15631-15650 → 弹 252 aiStyle20
//     :3083-3089）：18×18/scale1.1/4 帧 4t + items.ts 1262 shoot/useTime/channel
// 手法：原型直调（最小 mock GameHooks 跑 fixedUpdate）+ 记录型 spawnDust/
//   spawnParticles/playSfxFiles（同 weapon-flail-fix.test.ts 先例）。
import { describe, it, expect } from 'vitest';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { ChainsawProj, rotatedRelativePoint } from '../src/entities/ChainsawProj';
import { projectileData } from '../src/data/vanillaProjectiles';
import { ITEM_DEFS, ITEM_BY_KEY } from '../src/data/items';
import type { GameHooks } from '../src/entities/types';

interface DustRec {
  type: number; x: number; y: number; w: number; h: number;
  alpha: number; scale: number; vx: number; vy: number;
  noGravity: boolean;
}
interface ParticleRec {
  x: number; y: number; grav?: number;
}

function makeHooks() {
  const player = new Player(50 * 16, 90 * 16, new Inventory());
  const enemies: Array<Record<string, unknown>> = [];
  const dusts: DustRec[] = [];
  const particles: ParticleRec[] = [];
  const sfx: string[] = [];
  const hooks: GameHooks = {
    world: { store: {} } as never,
    player: player as never,
    enemies: () => enemies,
    critters: () => [],
    spawnDrop: () => null,
    damagePlayer: () => {},
    addDamageNumber: () => {},
    cutTile: () => {},
    onEnemyKilled: () => {},
    spawnEnemy: () => {},
    spawnParticles: (x, y, _c, _n, _s, opts) => {
      particles.push({ x, y, grav: opts?.grav });
    },
    notifyInventoryChanged: () => {},
    playSfx: () => {},
    playSfxFiles: (files) => { sfx.push(files[0]); },
    showPickupLabel: () => {},
    spawnDust: (x, y, w, h, type, sx, sy, alpha, _c, scale) => {
      const d: DustRec = {
        type, x, y, w, h, alpha: alpha ?? 0, scale: scale ?? 1,
        vx: sx ?? 0, vy: sy ?? 0, noGravity: false,
      };
      dusts.push(d);
      return d as never;   // 同引用返回——调用侧的 −4/noGravity/vy 覆写落在本记录上
    },
  };
  return { hooks, player, enemies, dusts, particles, sfx };
}

const run = (e: { fixedUpdate: (dt: number, g: GameHooks) => void; dead?: boolean }, g: GameHooks, n: number) => {
  for (let i = 0; i < n && !e.dead; i++) e.fixedUpdate(1 / 60, g);
};

// ============================================================
// ① 音效分档（Projectile.cs:23866-23878）
// ============================================================
describe('链锯音效分档（Projectile.cs:23866-23878）', () => {
  it('pick 0（509 axe30 / 252 hammer90）→ Item189 每 20t', () => {
    const { hooks, player, sfx } = makeHooks();
    const saw = new ChainsawProj(player, 120, 8, () => true,
      () => ({ x: player.cx + 100, y: player.cy }), { projId: 509, pick: 0, shootSpeed: 48 });
    run(saw, hooks, 1);                       // 首 tick sndT 0→−1 即播
    expect(sfx).toEqual(['Item_189']);
    run(saw, hooks, 19);                      // sndT=20 → 周期内不再播
    expect(sfx.length).toBe(1);
    run(saw, hooks, 1);                       // 第 21 tick 再播（20t 节奏）
    expect(sfx.length).toBe(2);
    expect(sfx[1]).toBe('Item_189');
  });

  it('pick > 0（钻族）→ Item190 每 15t', () => {
    const { hooks, player, sfx } = makeHooks();
    const saw = new ChainsawProj(player, 120, 8, () => true,
      () => ({ x: player.cx + 100, y: player.cy }), { projId: 509, pick: 100, shootSpeed: 48 });
    run(saw, hooks, 1);
    expect(sfx).toEqual(['Item_190']);
    run(saw, hooks, 14);
    expect(sfx.length).toBe(1);
    run(saw, hooks, 1);                       // 第 16 tick 再播（15t 节奏）
    expect(sfx.length).toBe(2);
    expect(sfx[1]).toBe('Item_190');
  });

  it('channel 断链即 Kill（:23904-23907）', () => {
    const { hooks, player } = makeHooks();
    let held = true;
    const saw = new ChainsawProj(player, 120, 8, () => held,
      () => ({ x: player.cx + 100, y: player.cy }), { projId: 509 });
    saw.fixedUpdate(1 / 60, hooks);
    expect(saw.dead).toBe(false);
    held = false;
    saw.fixedUpdate(1 / 60, hooks);
    expect(saw.dead).toBe(true);
  });
});

// ============================================================
// ② 火花尘系数（Projectile.cs:23933-23941）
// ============================================================
describe('链锯火花尘 31（Projectile.cs:23933-23941）', () => {
  const runUntilDust = (hooks: GameHooks, saw: ChainsawProj, dusts: DustRec[]) => {
    for (let i = 0; i < 600 && dusts.length === 0; i++) saw.fixedUpdate(1 / 60, hooks);
    expect(dusts.length).toBeGreaterThan(0);
  };

  it('1/6 率、尘 31、scale1.4/alpha80/noGravity、vy=−Next(7,13)×0.15 ∈ [−1.8,−1.05]', () => {
    const { hooks, player, dusts } = makeHooks();
    const saw = new ChainsawProj(player, 120, 8, () => true,
      () => ({ x: player.cx + 100, y: player.cy + 100 }), { projId: 509, pick: 0, shootSpeed: 48 });
    runUntilDust(hooks, saw, dusts);
    for (const d of dusts) {
      expect(d.type).toBe(31);
      expect(d.scale).toBe(1.4);
      expect(d.alpha).toBe(80);
      expect(d.noGravity).toBe(true);
      expect(d.vy).toBeGreaterThanOrEqual(-1.8 - 1e-9);
      expect(d.vy).toBeLessThanOrEqual(-1.05 + 1e-9);
    }
  });

  it('前向偏移 = velocity×Next(6,10)×0.1 单掷同乘双轴（+X−4）——曾 X 0.36-0.6/Y 恒 0.06 分乘', () => {
    const { hooks, player, dusts } = makeHooks();
    // 45° 瞄准 → |vx|≈|vy|，单掷 k 在双轴可校等式
    const saw = new ChainsawProj(player, 120, 8, () => true,
      () => ({ x: player.cx + 100, y: player.cy + 100 }), { projId: 509, pick: 0, shootSpeed: 48 });
    runUntilDust(hooks, saw, dusts);
    const d = dusts[dusts.length - 1];
    // 尘出生盒原点 = position + velocity×k（k∈[0.6,0.9]），velocity 已含 ±3% 抖动
    // → k_eff ∈ [0.6×0.97, 0.9×1.03]；记录对象被 −4 覆写（同引用）故 +4 还原
    const kx = (d.x + 4 - saw.x) / saw.vx;
    const ky = (d.y - saw.y) / saw.vy;
    expect(kx).toBeGreaterThanOrEqual(0.55);
    expect(kx).toBeLessThanOrEqual(0.95);
    expect(ky).toBeCloseTo(kx, 6);            // 同一掷乘双轴（结构修复核心）
  });

  it('无尘池兜底：反弹速度只落 grav 参数、前向偏移同式（spawnParticles 路径）', () => {
    const mk = () => makeHooks();
    const { hooks, player, particles } = mk();
    delete (hooks as Partial<GameHooks>).spawnDust;   // 走 spawnParticles 兜底
    const saw = new ChainsawProj(player, 120, 8, () => true,
      () => ({ x: player.cx + 100, y: player.cy + 100 }), { projId: 509, pick: 0, shootSpeed: 48 });
    for (let i = 0; i < 600 && particles.length === 0; i++) saw.fixedUpdate(1 / 60, hooks);
    expect(particles.length).toBeGreaterThan(0);
    for (const p of particles) {
      expect(p.grav).toBe(-0.15);             // −Next(7,13)×0.15 的 grav 通道映射
      const k = (p.x + 4 - saw.cx) / saw.vx;  // 兜底位 = 盒原点+半宽−4 → 相对中心 = vx·k−4
      expect(k).toBeGreaterThanOrEqual(0.55);
      expect(k).toBeLessThanOrEqual(0.95);
    }
  });
});

// ============================================================
// ③ 挂手锚 + 瞄准直写 + 抖动（Projectile.cs:23879/:23884-23902/:23932）
// ============================================================
describe('挂手锚 RotatedRelativePoint(MountedCenter)（:23879 → Player.cs:4063-4089）', () => {
  it('常规态（rot=0/gfx=0）恒等 MountedCenter', () => {
    expect(rotatedRelativePoint({ cx: 100, cy: 200, facing: 1, dead: false }))
      .toEqual({ x: 100, y: 200 });
  });

  it('gfxOffY 竖移随动（挂绳视觉补偿）——position = anchor − size/2', () => {
    const { hooks, player } = makeHooks();
    player.gfxOffY = 10;
    const saw = new ChainsawProj(player, 120, 8, () => true,
      () => ({ x: player.cx + 50, y: player.cy + 10 }), { projId: 509, shootSpeed: 48 });
    saw.fixedUpdate(1 / 60, hooks);
    expect(saw.x).toBeCloseTo(player.cx - 11);            // anchor.x − 22/2
    expect(saw.y).toBeCloseTo(player.cy + 10 - 11);       // anchor.y(=cy+gfx) − 22/2
  });

  it('瞄准向归一 ×(shootSpeed×scale)（:23884-23902）+ velocity.X 抖动 ±3%（:23932）', () => {
    const { hooks, player } = makeHooks();
    const saw = new ChainsawProj(player, 120, 8, () => true,
      () => ({ x: player.cx + 300, y: player.cy }), { projId: 509, shootSpeed: 48 });
    saw.fixedUpdate(1 / 60, hooks);
    const speedMod = Math.hypot(saw.vx, saw.vy);
    expect(speedMod).toBeGreaterThanOrEqual(48 * 1.2 * 0.97 - 1e-9);   // 57.6×(1±Next(3)×0.01)
    expect(speedMod).toBeLessThanOrEqual(48 * 1.2 * 1.03 + 1e-9);
    expect(saw.vy).toBeCloseTo(0, 6);                            // 水平瞄准
    expect(saw.vx).toBeGreaterThan(0);
  });

  it('面向跟随 velocity.X 符号（:23909-23916 ChangeDir）', () => {
    const { hooks, player } = makeHooks();
    const saw = new ChainsawProj(player, 120, 8, () => true,
      () => ({ x: player.cx - 300, y: player.cy }), { projId: 509, shootSpeed: 48 });
    saw.fixedUpdate(1 / 60, hooks);
    expect(player.facing).toBe(-1);
  });
});

// ============================================================
// ④ 252 叶绿插孔锤持械弹存在性（Item.cs:15631-15650 → :3083-3089）
// ============================================================
describe('252 插孔锤持械弹（aiStyle20 同门）', () => {
  it('SetDefaults（:3083-3089）：18×18 / scale1.1 / 速度模 46×1.1', () => {
    const { hooks, player } = makeHooks();
    const saw = new ChainsawProj(player, 45, 5.2, () => true,
      () => ({ x: player.cx + 100, y: player.cy }), { projId: 252, pick: 0, shootSpeed: 46 });
    expect(saw.projId).toBe(252);
    expect(saw.w).toBe(18);
    expect(saw.h).toBe(18);
    saw.fixedUpdate(1 / 60, hooks);
    const speedMod = Math.hypot(saw.vx, saw.vy);
    expect(speedMod).toBeGreaterThanOrEqual(46 * 1.1 * 0.97 - 1e-9);   // 抖动 ±3%（ε 容浮点）
    expect(speedMod).toBeLessThanOrEqual(46 * 1.1 * 1.03 + 1e-9);
  });

  it('帧动画 4 帧 4t/帧（:23840-23852；509 为 2 帧 2t :23853-23865）', () => {
    const { hooks, player } = makeHooks();
    const mk = (projId: 252 | 509) => new ChainsawProj(player, 45, 5.2, () => true,
      () => ({ x: player.cx + 100, y: player.cy }), { projId, shootSpeed: projId === 252 ? 46 : 48 });
    const j = mk(252);
    const frameOf = (e: ChainsawProj) => (e as unknown as { frame: number }).frame;
    run(j, hooks, 4);
    expect(frameOf(j)).toBe(1);              // 4t 后进第 2 帧
    run(j, hooks, 12);
    expect(frameOf(j)).toBe(4 % 4);          // 16t → 回 0（4 帧循环）
    const s = mk(509);
    run(s, hooks, 2);
    expect(frameOf(s)).toBe(1);              // 2t 进第 2 帧
    run(s, hooks, 2);
    expect(frameOf(s)).toBe(0);              // 2 帧循环
  });

  it('items.ts 1262：shoot 252 / channel / tool.useTime 7 / hammer90（Item.cs:15631-15650）', () => {
    const def = ITEM_DEFS[ITEM_BY_KEY['vi_1262_chlorophyte_jackhammer']];
    expect(def).toBeTruthy();
    expect(def.shoot).toBe(252);
    expect(def.channel).toBe(true);
    expect(def.tool?.type).toBe('hammer');
    expect(def.tool?.power).toBe(90);
    expect(def.tool?.useTime).toBe(7);
    // 弹 252 在原版弹表 = aiStyle20 持械族（Projectile.cs:3083-3089 DefaultToDrillOrChainsaw）
    expect(projectileData(252)?.aiStyle).toBe(20);
    expect(projectileData(509)?.aiStyle).toBe(20);
  });

  it('缺省 opts 保持 509 档（22×22）——旧调用面兼容', () => {
    const { player } = makeHooks();
    const saw = new ChainsawProj(player, 120, 8, () => true, () => ({ x: player.cx, y: player.cy }));
    expect(saw.projId).toBe(509);
    expect(saw.w).toBe(22);
    expect(saw.h).toBe(22);
  });
});

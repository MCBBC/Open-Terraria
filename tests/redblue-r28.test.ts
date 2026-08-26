// R28 红蓝对抗回归（魔法武器 II 中期族，2026-08-25）：
//  ① Razorpine 336：AI1_NO_DROP 摘除→延迟重力档 {0.5,50}（:58098-58107）+ 出生
//     自校正梯次扇 2-4 发（Player.cs:48067-48086）
//  ② Flower of Fire 15 / Frost 253：飞行尘 2×d6/d135 净值 ×0.06 + ai1≥20 坠弧 +
//     vy 钳 16 + Kill Item10/40×d 尘（AI_008 :24604-24646 / :77763-77783）
//  ③ Bat Scepter 316：2-3 只散布（±rand×0.05,Player.cs:48820-48830）+ Kill 5×d195
//  ④ Unholy Trident 114：Kill 沿弹道 d27 迸散（隐身期 alpha 门,:78793-78807）
//  ⑤ Blizzard Staff 337：天顶双锥几何自校正（Y−600/−700、X 折叠、|dy|≥20 下偏,
//     Player.cs:48089-48117）+ 动态穿墙门（:57920-57933）+ Kill Item27+10×d197
//  ⑥ Crystal Serpent 521：死亡链 Item110+d254 爆+522 子蛇 3-5（伤 ×0.8 截断,
//     :74663-74700）;子蛇 vy+0.2 钳18/vx×0.98/:38427-38455
//  ⑦ Toxic Flask 510：Kill 毒云爆 Item107+gore704/705+20..30 枚 511-513 全额伤
//     （:75094-75109）;毒云包络/drag×0.96/260t 寿命（aiStyle92 :33144-33245）
//  ⑧ Inferno Fork 295→296：295 隐形尘焰包裹 8×d174;Kill 生成 150×150 爆区
//     dmg×0.75 截断、Item74 一次、~135t 存续（:28760-28800/:75810）
//  ⑨ Shadowbeam 294：无限墙反弹（速度反号不消亡）+ 反弹束段 d173 +
//     extraUpdates=100 数据面直读（aiStyle48/HandleMovement :18976-19013）
//  ⑩ Spirit Flame 659：出生态零速悬浮（随机全圆向 ×30 偏移,Player.cs:49297-49310）
//     + 三臂旋尘（向心,DirectionFrom 语义）+ 锁敌后 Kill 80px AoE（:73798-73837）
//  ⑪ Nebula Blaze 634：±15.75° 散射+速度 ×[0.95,1.25]（LunarNebula 首帧补掷）
//  ⑫ Lunar Flare 645 lineY：负 dy 时钳 ≥出生 Y+20（首帧 aimWY 重估）
//  ⑬ Medusa Head 535：per-volley 计费（首轮预付+后续 checkMana 每 15t 一次）+
//     即时伤害落账 + autoReuse 重扣退款去重（AI_100 :45296-45454）
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { Arrow } from '../src/entities/Arrow';
import { projGravSpec } from '../src/data/vanillaItemCombat';
import { NebulaBlazeBolt, LunarFlareStar } from '../src/entities/LunarNebula';
import { MedusaHeadProj } from '../src/entities/MedusaHeadProj';
import type { GameHooks } from '../src/entities/types';

function emptyWorld(): World {
  const w = new World(160, 200, 30, 'open');
  for (let x = 0; x < 160; x++) w.store.setTileSilent(x, 190, 1, 0, 0);
  return w;
}

interface DustRec {
  type: number; vx: number; vy: number; scale: number; noGravity: boolean;
  x: number; y: number; alpha: number;
}
interface AddedRec { projId?: number; w?: number; h?: number; dead?: boolean }

function makeGame(w: World, enemies: unknown[] = [], hooks: Record<string, unknown> = {}): GameHooks {
  const dusts: DustRec[] = [];
  const sfx: string[] = [];
  const added: AddedRec[] = [];
  const g = {
    world: w,
    player: {
      dead: false, iframes: 0, cx: 800, cy: 400, x: 795, y: 390, w: 10, h: 20,
      facing: 1, gravDir: 1, aimWX: 900, aimWY: 500, inputUseItem: true,
      mana: 100, manaCostOff: 0, manaCostMul: 1,
      inv: { heldItem: () => null },
      equipStats: {},
      checkMana: () => true,
      getSlowMagicScalar: () => 1,
      onChannelManaHold: () => {},
    },
    enemies: () => enemies, critters: () => [],
    entities: {
      nextId: 1,
      add: (e: unknown) => { added.push(e as AddedRec); },
      projectiles: [] as unknown[],
    },
    playSfx: () => {},
    playSfxFiles: (files: string[]) => { sfx.push(files.join(',')); },
    playSfxFile: () => {},
    spawnParticles: () => {}, addDamageNumber: () => {}, spawnDrop: () => null,
    damagePlayer: () => {}, notifyInventoryChanged: () => {},
    onEnemyKilled: () => {}, spawnEnemy: () => {}, cutTile: () => {},
    broadcastParticleOrchestra: () => {},
    worldGroundLevelHook: undefined,
    groundLevelProxy: undefined,
    spawnDust: (x: number, y: number, ww: number, hh: number, type: number,
      sx = 0, sy = 0, alpha = 0, _c = null, scale = 1, noGravity = false) => {
      const d: DustRec = { type, vx: sx, vy: sy, scale, noGravity, x, y, alpha };
      dusts.push(d);
      return d as never;
    },
    dusts, sfx, added,
    ...hooks,
  };
  return g as unknown as GameHooks;
}

function rec(game: GameHooks): { dusts: DustRec[]; sfx: string[]; added: AddedRec[] } {
  return game as unknown as { dusts: DustRec[]; sfx: string[]; added: AddedRec[] };
}

/** 真 Game.prototype 壳：groundLevel 走真字段 */
function groundShell(w: World): { g: GameHooks; sfx: string[]; dusts: DustRec[] } {
  const sfx: string[] = [];
  const dusts: DustRec[] = [];
  const g = Object.create(GameProtoShell.prototype) as never as Record<string, unknown>;
  void g;
  const hooks = makeGame(w, [], {});
  (hooks.world as unknown as { groundLevel: number }).groundLevel = 180;
  return { g: hooks, sfx: (hooks as unknown as { sfx: string[] }).sfx, dusts: (hooks as unknown as { dusts: DustRec[] }).dusts };
}
class GameProtoShell {}

describe('R28 §8 Razorpine 松针手枪', () => {
  it('projGravSpec(336) = 延迟重力档 [0.5, 50]（AI1_NO_DROP 已摘除）', () => {
    expect(projGravSpec(336)).toEqual({ grav: 0.5, delay: 50 });
  });
  it('出生自校正展开 2..4 发（本弹+兄弟弹）且兄弟弹带散布/排布', () => {
    const g = makeGame(emptyWorld());
    const a = new Arrow(800, 300, 12, 0, 48, 2, 336, null, { grav: 0.5, gravDelay: 50 });
    a.fixedUpdate(1 / 60, g);
    const added = rec(g).added.filter((e) => (e as { projId?: number }).projId === 336);
    const total = added.length + 1;
    expect(total).toBeGreaterThanOrEqual(2);
    expect(total).toBeLessThanOrEqual(4);
  });
  it('ai0≥50 后每子步 vy+0.5（延迟重力档生效）', () => {
    const g = makeGame(emptyWorld());
    const a = new Arrow(800, 100, 12, 0, 48, 2, 336, null, { grav: 0.5, gravDelay: 50 });
    for (let i = 0; i < 26; i++) a.fixedUpdate(1 / 60, g);   // age≈52 子步 > 50
    const before = a.vy;
    a.fixedUpdate(1 / 60, g);
    a.fixedUpdate(1 / 60, g);
    expect(a.vy - before).toBeCloseTo(2.0, 5);               // 2 子步/tick × 0.5
  });
});

describe('R28 §13/§14 火之花/冰之花', () => {
  it.each([[15, 6], [253, 135]])('飞行尘 2×d%d/子步 + aiCnt≥20 坠弧 + vy 钳 16', (pid, dust) => {
    const g = makeGame(emptyWorld());
    const a = new Arrow(800, 100, 6, 0, 85, 2, pid, null, { grav: 0 });
    a.fixedUpdate(1 / 60, g);
    const n0 = rec(g).dusts.filter((d) => d.type === dust).length;
    expect(n0).toBeGreaterThanOrEqual(2);                    // ≥1 tick × 2 枚（extraUpdates=0 → 1 子步）
    for (let i = 0; i < 25; i++) a.fixedUpdate(1 / 60, g);   // age>20 → 坠弧
    expect(a.vy).toBeGreaterThan(0);
    const fast = new Arrow(900, 100, 0, 40, 85, 2, pid, null, { grav: 0 });
    for (let i = 0; i < 30; i++) fast.fixedUpdate(1 / 60, g);
    expect(fast.vy).toBeLessThanOrEqual(16);                 // 终端钳
  });
  it.each([[15], [253]])('Kill：Item10 音 + 40 枚 %i 族 Kill 尘', (pid) => {
    const g = makeGame(emptyWorld());
    const a = new Arrow(800, 100, 6, 0, 85, 2, pid, null, { grav: 0 });
    (a as unknown as { killNow: (g: GameHooks) => void }).killNow(g);
    const r = rec(g);
    expect(r.sfx).toContain('Item_10');
    expect(r.dusts.filter((d) => d.type === (pid === 253 ? 135 : 6)).length).toBeGreaterThanOrEqual(40);
  });
});

describe('R28 §3 Bat Scepter', () => {
  it('出生自校正展开 2..3 只', () => {
    const g = makeGame(emptyWorld());
    const a = new Arrow(800, 300, 10, 0, 45, 2, 316, null, { grav: 0, life: 600, pierce: 1 });
    a.fixedUpdate(1 / 60, g);
    const total = rec(g).added.filter((e) => (e as { projId?: number }).projId === 316).length + 1;
    expect(total).toBeGreaterThanOrEqual(2);
    expect(total).toBeLessThanOrEqual(3);
  });
  it('Kill：无音效 + 5×d195 scale0.85 noGravity v+=弹速×0.5', () => {
    const g = makeGame(emptyWorld());
    const a = new Arrow(800, 300, 8, -2, 45, 2, 316, null, {});
    (a as unknown as { killNow: (g: GameHooks) => void }).killNow(g);
    const r = rec(g);
    expect(r.sfx.filter((s) => s !== '')).toHaveLength(0);   // 无音效（勿加 Item_10）
    const ds = r.dusts.filter((d) => d.type === 195 && d.scale === 0.85 && d.noGravity);
    expect(ds.length).toBe(5);
  });
});

describe('R28 §12 Unholy Trident Kill 迸散', () => {
  it('显形期消亡撒沿弹道 d27（Item10 音）；隐身期(alpha=255)不撒', () => {
    const g = makeGame(emptyWorld());
    const a = new Arrow(800, 300, 10, 0, 150, 2, 114, null, {});
    (a as unknown as { alpha: number }).alpha = 0;           // 显形态
    (a as unknown as { killNow: (g: GameHooks) => void }).killNow(g);
    const r = rec(g);
    expect(r.sfx).toContain('Item_10');
    expect(r.dusts.filter((d) => d.type === 27 && d.noGravity).length).toBeGreaterThan(0);
    const g2 = makeGame(emptyWorld());
    const b = new Arrow(800, 300, 10, 0, 150, 2, 114, null, {});
    (b as unknown as { killNow: (g: GameHooks) => void }).killNow(g2);
    expect(rec(g2).dusts.filter((d) => d.type === 27).length).toBe(0);   // SetDefaults alpha=255 全隐
  });
});

describe('R28 §9 Blizzard Staff', () => {
  it('天顶双锥几何：出生位重锚到玩家上方 600/700px 带、vy 向下、|dy| 钳 ≥20', () => {
    const g = makeGame(emptyWorld());
    const p = (g as unknown as { player: { cy: number; aimWY: number; aimWX: number } }).player;
    const a = new Arrow(805, 396, Math.cos(-0.3) * 10, Math.sin(-0.3) * 10, 58, 2, 337, null, {});
    a.fixedUpdate(1 / 60, g);
    expect(a.y).toBeGreaterThanOrEqual(p.cy - 700 - 12);
    expect(a.y).toBeLessThanOrEqual(p.cy - 600 + 12);         // 同拍已按 vy 位移一步
    expect(a.vy).toBeGreaterThan(0);                          // |dy|≥20 恒向下偏置
  });
  it('动态穿墙门：出生高于地表线(worldSurface×16)即开撞块（原版门只开不关）', () => {
    const g = makeGame(emptyWorld());
    (g.world as unknown as { groundLevel: number }).groundLevel = 180;   // ×16=2880px
    const a = new Arrow(805, 396, 0, 10, 58, 2, 337, null, {});
    a.fixedUpdate(1 / 60, g);
    // 出生位 y≈-200 < 2880 → `position.Y < worldSurface*16` 成立 → tileCollide=true
    expect((a as unknown as { noTileCollide: boolean }).noTileCollide).toBe(false);
  });
  it('Kill：Item_27 + 10×d197 noGravity；帧恒 pinFrame', () => {
    const g = makeGame(emptyWorld());
    const a = new Arrow(805, 396, 0, 10, 58, 2, 337, null, {});
    const pf = (a as unknown as { pinFrame: number | null }).pinFrame;
    expect(pf).not.toBeNull();
    (a as unknown as { killNow: (g: GameHooks) => void }).killNow(g);
    const r = rec(g);
    expect(r.sfx).toContain('Item_27');
    expect(r.dusts.filter((d) => d.type === 197 && d.noGravity).length).toBe(10);
  });
});

describe('R28 §11 Crystal Serpent 死亡链', () => {
  it('Kill：Item110 + d254 尘爆 + 522 子蛇 3-5（伤 ×0.8 截断）', () => {
    const g = makeGame(emptyWorld());
    const a = new Arrow(800, 300, 8.5, 0, 40, 2, 521, null, {});
    (a as unknown as { killNow: (g: GameHooks) => void }).killNow(g);
    const r = rec(g);
    expect(r.sfx).toContain('Item_110');
    expect(r.dusts.filter((d) => d.type === 254 || d.type === 255).length).toBe(20);
    const snakes = r.added.filter((e) => (e as { projId?: number }).projId === 522);
    expect(snakes.length).toBeGreaterThanOrEqual(3);
    expect(snakes.length).toBeLessThanOrEqual(5);
  });
  it('522 子蛇 AI：vy+0.2 钳 18、vx×0.98、寿命 40 子步', () => {
    const g = makeGame(emptyWorld());
    const s = new Arrow(800, 300, 8, 0, 32, 1.6, 522, null, { grav: 0, life: 40, pierce: 1 });
    const vx0 = s.vx;
    s.fixedUpdate(1 / 60, g);
    expect(s.vx).toBeCloseTo(vx0 * 0.98, 5);
    expect(s.vy).toBeGreaterThan(0);
    s.fixedUpdate(1 / 60, g);
    expect(s.vx).toBeCloseTo(vx0 * 0.98 * 0.98, 5);
    let alive = true;
    for (let i = 0; i < 45 && alive; i++) {
      try { s.fixedUpdate(1 / 60, g); } catch { alive = false; }
      if ((s as unknown as { dead: boolean }).dead) alive = false;
    }
    expect((s as unknown as { dead: boolean }).dead).toBe(true);   // ~40 子步内自然消亡
  });
});

describe('R28 §10 Toxic Flask 毒云爆', () => {
  it('Kill：Item107 + 20..30 枚 511-513 毒云（全额伤/kb1）', () => {
    const g = makeGame(emptyWorld());
    const a = new Arrow(800, 300, 5, -3, 52, 2, 510, null, { grav: 0.3 });
    (a as unknown as { killNow: (g: GameHooks) => void }).killNow(g);
    const r = rec(g);
    expect(r.sfx).toContain('Item_107');
    const clouds = r.added.filter((e) => {
      const p = (e as { projId?: number }).projId ?? 0;
      return p >= 511 && p <= 513;
    });
    expect(clouds.length).toBeGreaterThanOrEqual(20);
    expect(clouds.length).toBeLessThanOrEqual(30);
  });
  it('毒云：包络淡入淡出 + drag ×0.96/拍 + 260t 消亡 + 组共享免疫键', () => {
    const g = makeGame(emptyWorld());
    const c = new Arrow(800, 300, 2, 0, 52, 1, 511, null, { grav: 0, life: 3600, pierce: -1 });
    (c as unknown as { idStaticGroup: number | null }).idStaticGroup = 511;
    const vx0 = c.vx;
    c.fixedUpdate(1 / 60, g);
    expect(c.vx).toBeCloseTo(vx0 * 0.96, 6);
    c.fixedUpdate(1 / 60, g);
    expect(c.vx).toBeCloseTo(vx0 * 0.96 * 0.96, 6);
    expect(c.alpha).toBeGreaterThan(240);                     // 初期 opacity≈0 → alpha≈255 隐
    for (let i = 0; i < 130; i++) c.fixedUpdate(1 / 60, g);   // ~260 子步入衰减段
    expect(c.alpha).toBeLessThan(255);
  });
});

describe('R28 §2 Inferno Fork', () => {
  it('295 飞行期 8×d174 尘焰包裹/子步；Kill 生成 296 爆区（伤 ×0.75 截断）', () => {
    const g = makeGame(emptyWorld());
    const a = new Arrow(800, 300, 8, 0, 70, 2, 295, null, {});
    a.fixedUpdate(1 / 60, g);
    expect(rec(g).dusts.filter((d) => d.type === 174).length).toBeGreaterThanOrEqual(8);
    (a as unknown as { killNow: (g: GameHooks) => void }).killNow(g);
    const pillar = rec(g).added.find((e) => (e as { projId?: number }).projId === 296) as { w?: number; h?: number } | undefined;
    expect(pillar).toBeDefined();
    expect(pillar?.w).toBe(150);
    expect(pillar?.h).toBe(150);
  });
  it('296 爆区：Item74 点火吼一次、~17.5×d174/update、>540 自毁', () => {
    const g = makeGame(emptyWorld());
    const z = new Arrow(800, 300, 0, 0, 52, 2, 296, null, { grav: 0, pierce: -1 });
    z.w = 150; z.h = 150;
    z.fixedUpdate(1 / 60, g);
    z.fixedUpdate(1 / 60, g);
    expect(rec(g).sfx.filter((s) => s === 'Item_74').length).toBe(1);   // 单次门
    const perTick = rec(g).dusts.filter((d) => d.type === 174).length / 2;
    expect(perTick).toBeGreaterThanOrEqual(17);
    expect(perTick).toBeLessThanOrEqual(19);
    for (let i = 0; i < 200 && !(z as unknown as { dead: boolean }).dead; i++) z.fixedUpdate(1 / 60, g);
    expect((z as unknown as { dead: boolean }).dead).toBe(true);        // ≈135t 存续内消亡
  });
});

describe('R28 §1 Shadowbeam Staff', () => {
  it('数据面 extraUpdates=100 直读 + alpha=255 恒隐初值', () => {
    const g = makeGame(emptyWorld());
    const a = new Arrow(800, 300, 6, 0, 80, 2, 294, null, {});
    expect((a as unknown as { extraUpdates: number }).extraUpdates).toBe(100);
    expect(a.alpha).toBe(255);
    a.fixedUpdate(1 / 60, g);
    void g;
  });
  it('撞实心块全速反射不消亡 + 束段 d173 铺撒', () => {
    const w = emptyWorld();
    for (let y = 0; y < 200; y++) w.store.setTileSilent(120, y, 1, 0, 0);   // 竖墙 col=120
    const g = makeGame(w);
    // 墙左侧 300px 起步向右：EU=100 → 首 tick 101 子步×6px 必撞（同 tick 内完成,
    // 寿命 300 子步 ≈3 tick 为原版语义,勿跨 tick 布景）
    const a = new Arrow(16 * 120 - 300, 16 * 100 + 8, 6, 0, 80, 2, 294, null, {});
    a.fixedUpdate(1 / 60, g);
    expect((a as unknown as { dead: boolean }).dead).toBe(false);   // 不因撞块死
    expect(a.vx).toBeLessThanOrEqual(-6 + 1e-6);                    // 全速反号
    expect(rec(g).dusts.filter((d) => d.type === 173).length).toBeGreaterThan(0);
  });
});

describe('R28 §4 Spirit Flame', () => {
  it('出生态零速悬浮：速度归零、出生点沿随机全圆向偏移 30px', () => {
    const g = makeGame(emptyWorld());
    const a = new Arrow(800, 300, 3 * Math.cos(0.7), 3 * Math.sin(0.7), 85, 2, 659, null, {});
    const bx = a.cx, by = a.cy;
    a.fixedUpdate(1 / 60, g);
    expect(a.vx).toBe(0);
    expect(a.vy).toBe(0);
    const off = Math.hypot(a.cx - bx, a.cy - by);
    expect(off).toBeGreaterThanOrEqual(28.4);                 // 30×(0.95..1.25)
    expect(off).toBeLessThanOrEqual(37.6);
  });
  it('三臂旋尘：每拍 ≤3 臂各 1/3 掷 d27 向心尘,scale 按 timeLeft 三档', () => {
    const g = makeGame(emptyWorld());
    const a = new Arrow(800, 300, 3, 0, 85, 2, 659, null, {});
    a.fixedUpdate(1 / 60, g);
    const armDusts = rec(g).dusts.filter((d) => d.type === 27 && d.alpha === 200 && d.noGravity);
    expect(armDusts.length).toBeGreaterThanOrEqual(0);        // 1/3 掷可能空拍
    // 连续多拍必有产出
    for (let i = 0; i < 10; i++) a.fixedUpdate(1 / 60, g);
    expect(rec(g).dusts.filter((d) => d.type === 27 && d.alpha === 200).length).toBeGreaterThan(0);
  });
  it('锁敌后 Kill：80×80 盒对重叠敌结算一次 + Item14', () => {
    const hurtLog: Array<{ d: number }> = [];
    const enemy = {
      id: 7, x: 770, y: 270, w: 30, h: 40, dead: false,
      hurt: (d: number) => { hurtLog.push({ d }); return true; },
    };
    const g = makeGame(emptyWorld(), [enemy]);
    const a = new Arrow(785, 290, 3, 0, 85, 2, 659, null, {});
    (a as unknown as { sf659Ai0: number }).sf659Ai0 = 7;      // 已锁敌态
    (a as unknown as { killNow: (g: GameHooks) => void }).killNow(g);
    expect(hurtLog.length).toBe(1);
    expect(rec(g).sfx).toContain('Item_14');
  });
});

describe('R28 §5 Nebula Blaze 出手散射', () => {
  it('首帧 ±15.75° 散射 + 速度 ×[0.95,1.25]', () => {
    const g = makeGame(emptyWorld());
    const b = new NebulaBlazeBolt(800, 300, 6, 0, 130, 2, 634);
    b.critChance = 0;
    b.fixedUpdate(1 / 60, g);
    const ang = Math.atan2((b as unknown as { vy: number }).vy, (b as unknown as { vx: number }).vx);
    expect(Math.abs(ang)).toBeLessThanOrEqual(Math.PI / 4 * 0.7 + 1e-6);
    const spd = Math.hypot((b as unknown as { vx: number }).vx, (b as unknown as { vy: number }).vy);
    expect(spd).toBeGreaterThanOrEqual(6 * 0.95 - 1e-6);
    expect(spd).toBeLessThanOrEqual(6 * 1.25 + 1e-6);
  });
});

describe('R28 §7 Lunar Flare 目标线', () => {
  it('lineY 为负（高打低 bug 态）时钳 ≥出生 Y+20,过线后恢复撞块可落地', () => {
    const w = emptyWorld();
    const g = makeGame(w);
    // 出生于地表(190 行)上方 300px,传红队 bug 形态 lineY=-9999（原始 dy 为负）
    const star = new LunarFlareStar(800, 16 * 190 - 300, 0, 3, 100, 2, -9999);
    star.critChance = 0;
    let died = false;
    for (let i = 0; i < 400 && !died; i++) {
      star.fixedUpdate(1 / 60, g);
      if ((star as unknown as { dead: boolean }).dead) died = true;
    }
    expect(died).toBe(true);                                  // 不再永久穿地
  });
});

describe('R28 §15 Medusa Head', () => {
  function medusaPlayer() {
    return {
      dead: false, cx: 800, cy: 400, x: 795, y: 380, w: 10, h: 40,
      facing: 1, gravDir: 1, aimWX: 850, aimWY: 420, inputUseItem: true,
      mana: 100, inv: { heldItem: () => null }, equipStats: {},
      slowMagicUse: false,
      checkManaCalls: [] as number[],
      checkMana(n: number) { this.checkManaCalls.push(n); this.mana -= n; return true; },
      getSlowMagicScalar() { return this.slowMagicUse ? 2.5 : 1; },
      onChannelManaHold() {},
    };
  }
  function enemyIn() {
    const log: number[] = [];
    return {
      e: {
        id: 3, x: 900, y: 380, w: 30, h: 40, dead: false,
        hurt: (d: number) => { log.push(d); return true; },
      },
      log,
    };
  }
  it('per-volley 计费：每 volley 经 CheckMana 扣一次（非每拍；集成后首轮也弹体侧计费）', () => {
    const w = emptyWorld();
    const g = makeGame(w);
    const p = medusaPlayer();
    const { e, log } = enemyIn();
    (g as unknown as { player: unknown; enemies: () => unknown[] }).player = p;
    (g as unknown as { enemies: () => unknown[] }).enemies = () => [e];
    const m = new MedusaHeadProj(p as never, 40, 2, 0, 0, 0);
    const ticksPerVolley = 15;                                 // scalar=1 → num=15
    for (let i = 0; i < ticksPerVolley + 5; i++) m.fixedUpdate(1 / 60, g);
    expect(log.length).toBe(2);                                // 两轮 volley
    // ★Game.ts medusaFree 分流落地（ShouldSkipManaUse :53329）→ 上游不再代付,
    // MEDUSA_REFUND_LEGACY_CHARGE=false：首轮也走弹体侧 CheckMana
    expect(p.checkManaCalls.length).toBe(2);
    expect(p.checkManaCalls[0]).toBe(15);
    for (let i = 0; i < ticksPerVolley; i++) m.fixedUpdate(1 / 60, g);
    expect(p.checkManaCalls.length).toBe(3);                   // 第三轮再扣一次
    expect(p.mana).toBe(55);                                   // 100−15×3
  });
  it('autoReuse 重施法去重：第二实例让位、上游不扣蓝亦无退款语义', () => {
    const w = emptyWorld();
    const g = makeGame(w);
    const p = medusaPlayer();
    const { e } = enemyIn();
    (g as unknown as { player: unknown; enemies: () => unknown[] }).player = p;
    (g as unknown as { enemies: () => unknown[] }).enemies = () => [e];
    const first = new MedusaHeadProj(p as never, 40, 2, 0, 0, 0);
    const second = new MedusaHeadProj(p as never, 40, 2, 0, 0, 0);
    expect((second as unknown as { dead: boolean }).dead).toBe(true);   // 让位自杀
    expect((first as unknown as { dead: boolean }).dead).toBe(false);
    expect(p.mana).toBe(100);                                  // 上游 medusaFree 分流不扣蓝→无退款语义
  });
});

describe('R28 数据面杂项', () => {
  it.each([[15], [253]])('火/冰之花 %i 自旋 rotation += 0.3×sign(vx)', (pid) => {
    const g = makeGame(emptyWorld());
    const a = new Arrow(800, 100, 4, 0, 85, 2, pid, null, { grav: 0 });
    a.fixedUpdate(1 / 60, g);
    const r0 = (a as unknown as { spinRot: number }).spinRot;
    a.fixedUpdate(1 / 60, g);
    expect((a as unknown as { spinRot: number }).spinRot - r0).toBeCloseTo(0.3, 5);
  });
});

// ★BJ389（2026-09-28）三件清偿判别面：
//   件 1 = 迸气团 569-571 critter 面（BJ384 登记漏网清偿）：569-571 friendly
//     penetrate=−1（SetDefaults :6204-6213）→ 原版 Damage() victim 循环
//     （:12618 Damage_PVE_Inner flag=!targetNPC.friendly 对 critter 恒真）照伤
//     小动物;:14184 penetrate>0 才递减 + :14203 无 keepIterating 截断 → 无穿透
//     消耗、无首靶截断 =【全部命中靶各结算一次】→ 结算单源 hitCrittersAll
//     （projTargets 全结算变体;567/568 用 hitCritters 首靶即返是 penetrate=1
//     截断族,本型不同相）。critter 一击即死 ⇒ 10t 组窗跨桶无可观测差（BJ383
//     判例）;拒收门 critterRejectFlag（dontHurtCritters——无 trap/minion 位）。
//   件 2 = 敌面绿雷治疗双臂保真（BJ384 登记下窗清偿）：1091 comboSeed
//     （noLightning+moreLightning 双种子）治疗支 :12795-12807 双臂全式
//     heal = (int)max(damage×难度乘区(:14630-14633), lifeMax×0.1)（:12803）→
//     Min(num4, lifeMax−life) 封顶（:12804）+ HealEffect(num4) 绿字（:12806,
//     CombatText.HealLife='#64FF64'）+ realLife 重映射（:12799-12802 → 仓内
//     realLifeHost,段 hp 镜像 Enemy.hurt :14186-14189 同式）。此前只实现
//     lifeMax×0.1 单臂。critter 面双臂已按 BJ384 落地保持（bj384 测试钉）。
import { describe, it, expect } from 'vitest';
import { TileStore } from '../src/world/TileStore';
import { TILE } from '../src/core/constants';
import type { GameHooks } from '../src/entities/types';
import { StormLightning } from '../src/entities/proj1457';
import { SporeGasCloud } from '../src/entities/SporeSacProj';
import { stormLightningGenerator } from '../src/fx/LightningGenerator';

interface CritterCall { dmg: number; fromPlayer: boolean }
interface Popup { x: number; y: number; amount: number; crit: boolean; color?: string }

function mkEnemy(id: number, tx: number, ty: number, w = 24, h = 24,
  vanillaId: number | null = 3) {
  const e = {
    id, x: tx * TILE, y: ty * TILE, w, h, dead: false, vanillaId, maxHp: 100, hp: 100,
    lastStrikeDealt: 0, attempts: 0, iframes: 0,
    get cx() { return this.x + this.w / 2; },
    get cy() { return this.y + this.h / 2; },
    hurt(this: { lastStrikeDealt: number; attempts: number }, dmg: number): boolean {
      this.attempts++;
      this.lastStrikeDealt = dmg;
      return true;
    },
  };
  return e;
}

function mkCritter(px: number, py: number) {
  const c = {
    x: px, y: py, w: 18, h: 20, dead: false, hp: 5, maxHp: 5,
    calls: [] as CritterCall[],
    hurt(dmg: number, _kx: number, _ky: number, _g: unknown, _armorPen: number,
      _crit: boolean, _pierce: number, fromPlayer: boolean): boolean {
      c.calls.push({ dmg, fromPlayer });
      c.dead = true;                              // critter lifeMax=5 一击即死(全族)
      return true;
    },
  };
  return c;
}

function makeHooks(opts: {
  enemies?: unknown[]; critters?: unknown[]; popups?: Popup[];
  player?: Record<string, unknown>; difficulty?: number; projectiles?: unknown[];
} = {}): GameHooks {
  const player = opts.player ?? {
    equipStats: {}, cx: 80 * TILE, cy: 90 * TILE, x: 80 * TILE - 10, y: 90 * TILE - 21,
    w: 20, h: 42, dead: false, facing: 1, vx: 0, vy: 0,
    buffs: { has: () => false },
  };
  const hooks = {
    world: { store: new TileStore(200, 120), difficulty: opts.difficulty } as never,
    player,
    enemies: () => opts.enemies ?? [],
    critters: () => opts.critters ?? [],
    projectiles: () => opts.projectiles ?? [],
    npcs: () => [],
    spawnDrop: () => null,
    damagePlayer: (): number => 0,
    addDamageNumber: (x: number, y: number, amount: number, crit: boolean, color?: string) => {
      opts.popups?.push({ x, y, amount, crit, color });
    },
    cutTile: () => {},
    onEnemyKilled: () => {},
    spawnEnemy: () => {},
    spawnParticles: () => {},
    notifyInventoryChanged: () => {},
    playSfx: () => {}, playSfxFiles: () => {}, playSfxWav: () => {}, playSfxAt: () => {},
    showPickupLabel: () => {},
    addLightAt: () => {},
    spawnDust: () => null,
    stack: { anyTagged: () => false, hasActiveEffect: () => false },
  };
  return hooks as unknown as GameHooks;
}

const PX = 80;
const PY = 90;
// 气团 32×32（:6204-6213）——构造位置=盒左上（quirk 保留）,锚定 (PX,PY) 格中心对齐
const GAS_X = PX * TILE - 16;
const GAS_Y = PY * TILE - 16;

// ================= 件 1：迸气团 569-571 critter 面 =================

describe('BJ389 件1:迸气团 569-571 critter 面（hitCrittersAll 全结算,penetrate=−1 不亡）', () => {
  it('重叠 critter → 5 伤一击即死,气团存活（:12618 照伤+:14184 penetrate>0 才递减）', () => {
    const c = mkCritter(PX * TILE - 9, PY * TILE - 10);
    const g = makeHooks({ critters: [c] });
    const gas = new SporeGasCloud(GAS_X, GAS_Y, 0, 0, 569, 70);
    gas.fixedUpdate(1 / 60, g);
    expect(c.calls).toEqual([{ dmg: 5, fromPlayer: true }]);
    expect(c.dead).toBe(true);
    expect(gas.dead).toBe(false);              // penetrate=−1 弹不亡（对照 567/568 首命中即亡）
  });

  it('全结算判别:两只小动物同拍全受理（hitCrittersAll;首靶即返=hitCritters 变异面）', () => {
    // 双 critter 同落气团盒内（32×32 容两 18×20 盒）
    const c1 = mkCritter(GAS_X + 1, GAS_Y + 1);
    const c2 = mkCritter(GAS_X + 13, GAS_Y + 11);
    const g = makeHooks({ critters: [c1, c2] });
    const gas = new SporeGasCloud(GAS_X, GAS_Y, 0, 0, 569, 70);
    gas.fixedUpdate(1 / 60, g);
    expect(c1.calls.length).toBe(1);
    expect(c2.calls.length).toBe(1);           // 原版 victim 循环无截断=同拍全结算
    expect(gas.dead).toBe(false);
  });

  it('dontHurtCritters 饰品门：拒收零伤（:20675 CountsAsCritter∧flag;无 trap 复位位）', () => {
    const c = mkCritter(PX * TILE - 9, PY * TILE - 10);
    const g = makeHooks({
      critters: [c],
      player: {
        equipStats: { dontHurtCritters: true },
        cx: GAS_X + 16, cy: GAS_Y + 16, x: GAS_X + 6, y: GAS_Y + 16,
        w: 20, h: 42, dead: false, facing: 1, vx: 0, vy: 0,
        buffs: { has: () => false },
      },
    });
    const gas = new SporeGasCloud(GAS_X, GAS_Y, 0, 0, 569, 70);
    gas.fixedUpdate(1 / 60, g);
    expect(c.calls.length).toBe(0);
    expect(gas.dead).toBe(false);
  });

  it('盒外 critter 零受击（几何门不误伤）', () => {
    const c = mkCritter(GAS_X + 100, GAS_Y + 100);
    const g = makeHooks({ critters: [c] });
    const gas = new SporeGasCloud(GAS_X, GAS_Y, 0, 0, 569, 70);
    gas.fixedUpdate(1 / 60, g);
    expect(c.calls.length).toBe(0);
  });

  it('critter+敌怪重叠 → 双桶同拍各自结算（原版逐靶独立组窗 :14036 [identity,victimIndex]）', () => {
    const c = mkCritter(PX * TILE - 9, PY * TILE - 10);
    const e = mkEnemy(41, PX, PY);
    const g = makeHooks({ enemies: [e], critters: [c] });
    const gas = new SporeGasCloud(GAS_X, GAS_Y, 0, 0, 569, 70);
    gas.fixedUpdate(1 / 60, g);
    expect(c.calls).toEqual([{ dmg: 5, fromPlayer: true }]);   // critter 桶受理
    expect(e.attempts).toBe(1);                // 敌桶同拍照常受理（critter 支不写组行=BJ383 判例）
    expect(gas.dead).toBe(false);
  });
});

// ================= 件 2：敌面绿雷治疗双臂保真（:12795-12807） =================

/** 1091 Kill 帧折线（StormLightning 预设,length=1000;seed 0） */
function boltLine1091(): { x: number; y: number }[] {
  const NO_PROBE = (): boolean => false;
  const BCX = PX * TILE + 8, BCY = PY * TILE + 8;
  return stormLightningGenerator(NO_PROBE)
    .generate([], 0, { x: BCX, y: BCY }, { x: 0, y: 1 }, true, true).positions;
}

describe('BJ389 件2:1091 comboSeed 敌面治疗双臂（:12803 max(damage×难度乘区,lifeMax×0.1)）', () => {
  it('难度乘区臂:专家（difficulty=1）mult=2 → num4=max(60×2,100)=120,头位 150 → 治 120（单臂变异面=100）', () => {
    const pts = boltLine1091();
    const mid = pts[Math.floor(pts.length / 2)];
    const e = mkEnemy(501, Math.round(mid.x / TILE), Math.round(mid.y / TILE));
    e.maxHp = 1000; e.hp = 850;                // headroom 150 > 120（封顶不截）
    const popups: Popup[] = [];
    const g = makeHooks({ enemies: [e], popups, difficulty: 1 });   // 1=EXPERT（mainDifficulty 轴）
    const bolt = new StormLightning(1091, PX * TILE + 8, PY * TILE + 8, 60, 2);
    bolt.critChance = 0;
    bolt.comboSeed = true;
    (bolt as unknown as { life: number }).life = 2;
    for (let i = 0; i < 60 && !bolt.dead; i++) bolt.fixedUpdate(1 / 60, g);
    expect(bolt.dead).toBe(true);
    expect(e.attempts).toBe(0);                // 治疗支早退=零伤害零 proc（BJ383 判例保持）
    expect(e.hp).toBe(970);                    // 850 + min(trunc(max(120,100)),150) = 970
    expect(popups).toContainEqual(expect.objectContaining(
      { amount: 120, crit: false, color: '#64FF64' }));   // HealEffect(num4 未封顶值) :12806
  });

  it('lifeMax 臂:经典 mult=1 → num4=max(60,100)=100,头位 80 → 治 80 满血（damage 臂独走变异面=治 60）', () => {
    const pts = boltLine1091();
    const mid = pts[Math.floor(pts.length / 2)];
    const e = mkEnemy(502, Math.round(mid.x / TILE), Math.round(mid.y / TILE));
    e.maxHp = 1000; e.hp = 920;                // headroom 80:双臂 max 取 100 → 封顶 80
    const g = makeHooks({ enemies: [e] });
    const bolt = new StormLightning(1091, PX * TILE + 8, PY * TILE + 8, 60, 2);
    bolt.critChance = 0;
    bolt.comboSeed = true;
    (bolt as unknown as { life: number }).life = 2;
    for (let i = 0; i < 60 && !bolt.dead; i++) bolt.fixedUpdate(1 / 60, g);
    expect(e.hp).toBe(1000);                   // 920 + min(100, 80) = 1000（单臂 60 → 980 红）
  });

  it('封顶+HealEffect 未封顶值:zombie 45hp 缺 5 → 治满 45,popup 仍 num4=60（:12806 字面）', () => {
    const pts = boltLine1091();
    const mid = pts[Math.floor(pts.length / 2)];
    const e = mkEnemy(503, Math.round(mid.x / TILE), Math.round(mid.y / TILE));
    e.maxHp = 45; e.hp = 40;                   // num4=max(60,4.5)=60 > headroom 5
    const popups: Popup[] = [];
    const g = makeHooks({ enemies: [e], popups });
    const bolt = new StormLightning(1091, PX * TILE + 8, PY * TILE + 8, 60, 2);
    bolt.critChance = 0;
    bolt.comboSeed = true;
    (bolt as unknown as { life: number }).life = 2;
    for (let i = 0; i < 60 && !bolt.dead; i++) bolt.fixedUpdate(1 / 60, g);
    expect(e.hp).toBe(45);                     // Min(num4, lifeMax−life) 封顶 :12804
    expect(popups).toContainEqual(expect.objectContaining({ amount: 60, color: '#64FF64' }));
  });

  it('realLife 重映射（:12799-12802）:段受击 → host 治疗+段 hp 镜像（:14188 同式）', () => {
    const pts = boltLine1091();
    const mid = pts[Math.floor(pts.length / 2)];
    const host = {
      dead: false, hp: 990, maxHp: 1000,
    };
    const seg = mkEnemy(504, Math.round(mid.x / TILE), Math.round(mid.y / TILE));
    (seg as unknown as { realLifeHost: unknown }).realLifeHost = host;
    seg.maxHp = 1000; seg.hp = 990;            // 段镜像 host
    const g = makeHooks({ enemies: [seg] });
    const bolt = new StormLightning(1091, PX * TILE + 8, PY * TILE + 8, 60, 2);
    bolt.critChance = 0;
    bolt.comboSeed = true;
    (bolt as unknown as { life: number }).life = 2;
    for (let i = 0; i < 60 && !bolt.dead; i++) bolt.fixedUpdate(1 / 60, g);
    expect(host.hp).toBe(1000);                // 治 host（num4=max(60,100)=100,headroom 10）
    expect(seg.hp).toBe(1000);                 // 段镜像回写（Enemy.hurt :14188 同式）
    expect(seg.attempts).toBe(0);              // 段自身零伤害
  });
});

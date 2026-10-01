// ★BJ424-T3（2026-10-01）魔法命中漏斗面收编——自持命中环类双引擎（ghostHurt :13881 /
//  nebula :13885 与 ghostHeal :13877 同块同 face）判别测试。
// 反编译真值（Terarria1457/Terraria/Projectile.cs Damage_PVE_Inner）：
//   :13712 flag10 = num41>0 ∧ lifeMax>5 ∧ friendly ∧ !hostile ∧ aiStyle≠59
//   :13875 if (flag10) → :13876 if (canGhostHeal|flag9) →
//   :13877 ghostHeal → :13881 ghostHurt → :13885 nebula（三引擎同 if 块,序为锚）
// 普查矩阵（magic ∧ 自有 hurt 环 ∧ 非通用载体,数据面 vanilla-projectiles.json +
// 文件面 .hurt( 环双向扫）：
//   双缺→本刀接线（11 面/7 文件）：255/260 BeamBoltProj / 632 PrismProng / 461
//     BlasterBeam / 634·635 飞行盒+Kill AoE / 645 爆相 / 251 RainbowSegment /
//     536 凝视束 / 656 沙暴柱 / 856 直击+爆裂轮
//   双接勿动：proj1457×7（1115/1116/1117·1122/731/440/704/950）+ 通用载体
//     （Arrow/MagicProj/MissileProj/Dart/WeaponProj/ClingerStaffWallProj/meleeOnHitProjs）
//   不接线定谳（原版触发面不可达）：443 电圈电球（数据面 ranged,SetDefaults :5139-5149
//     无 magic 行——ghostHurt 方法体 :12023 `!magic` 早退/nebula :13885 magic 合取）/
//     636 DaybreakFlare（melee）/ 356 浮魂（aiStyle 59,flag10 排除）/ 723·908·1128·
//     229·964 等非 magic 面。
// 判别面：①结构锁=7 文件逐 ghostHealProc 锚定面内 ghostHurt→nebula 依序在位
//  （全表 11 面）;②行为抽样=BeamBoltProj 255/NebulaBlazeBolt 634/RainbowSegment 251
//  三面（ghostHeal→ghostHurt→nebula 三事件序+CD+出生点+基伤口径）;③负判别=受害者门/
//  单套装缺一引擎照跑。
import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { TileStore } from '../src/world/TileStore';
import { TILE } from '../src/core/constants';
import type { GameHooks } from '../src/entities/types';
import { BeamBoltProj, MAGNET_SPHERE_BOLT } from '../src/entities/MagnetSphereProj';
import { NebulaBlazeBolt } from '../src/entities/LunarNebula';
import { RainbowSegment } from '../src/entities/RainbowProj';
import { playerHasGhostHurt, _resetGhostBudgetForTest } from '../src/entities/SpectreSoulProj';
import { NEBULA_BOOSTER_VIDS } from '../src/entities/NebulaBooster';
import { VANILLA_ITEM_KEY_BY_ID } from '../src/data/items';

afterEach(() => vi.restoreAllMocks());

// ============================================================
// ① 全表结构锁（11 面 × ghostHealProc 锚定区域内 ghostHurt→nebula 依序）
// ============================================================
const ENT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'entities');

const FUNNEL_FACES: Array<[string, number]> = [
  ['MagnetSphereProj.ts', 1],   // 255/260 共用一命中面
  ['PrismProj.ts', 2],          // 632 PrismProng / 461 BlasterBeam
  ['LunarNebula.ts', 3],        // 634/635 飞行盒 + Kill AoE / 645 爆相
  ['RainbowProj.ts', 1],        // 251 RainbowSegment（250 头本体无伤害面）
  ['MedusaHeadProj.ts', 1],     // 536 凝视束（ volley 结算载体）
  ['ForbiddenSignProj.ts', 1],  // 656
  ['SparkleGuitarProj.ts', 2],  // 856 直击 + Kill 爆裂轮
];

describe('BJ424-T3-① 全表结构锁（原版 :13877→:13881→:13885 同块序）', () => {
  for (const [file, faces] of FUNNEL_FACES) {
    it(`${file}：${faces} 面逐锚 ghostHurt/nebula 依序在位`, () => {
      const src = readFileSync(join(ENT_DIR, file), 'utf8');
      const heals: number[] = [];
      let idx = src.indexOf('ghostHealProc(');
      while (idx >= 0) { heals.push(idx); idx = src.indexOf('ghostHealProc(', idx + 1); }
      expect(heals.length, `${file} 命中面数（ghostHealProc 站位）`).toBe(faces);
      for (let i = 0; i < heals.length; i++) {
        const region = src.slice(heals[i], heals[i + 1] ?? src.length);
        const hurtIdx = region.indexOf('ghostHurtOnHit(');
        const nebIdx = region.indexOf('nebulaBoosterOnHit(');
        expect(hurtIdx, `${file} 面#${i + 1} ghostHurtOnHit 缺位`).toBeGreaterThan(0);
        expect(nebIdx, `${file} 面#${i + 1} nebulaBoosterOnHit 缺位`).toBeGreaterThan(0);
        expect(nebIdx > hurtIdx, `${file} 面#${i + 1} 序违原版（nebula 须在 ghostHurt 后）`).toBe(true);
      }
    });
  }

  it('proj1457×7 已接面零回归（BJ420/BJ424 既有站位仍在）', () => {
    const src = readFileSync(join(ENT_DIR, 'proj1457.ts'), 'utf8');
    const count = (s: string): number => src.split(s).length - 1;
    expect(count('ghostHurtOnHit(')).toBe(7);
    expect(count('nebulaBoosterOnHit(')).toBe(7);
  });

  it('不接线定谳锁：ElectroSphereProj（443 数据面 ranged）零引擎接线', () => {
    const src = readFileSync(join(ENT_DIR, 'ElectroSphereProj.ts'), 'utf8');
    expect(src.includes('ghostHealProc(')).toBe(false);
    expect(src.includes('ghostHurtOnHit(')).toBe(false);
    expect(src.includes('nebulaBoosterOnHit(')).toBe(false);
  });
});

// ============================================================
// ② 数据面普查锁（magic 位——两引擎的不可达面即非 magic 面）
// ============================================================
describe('BJ424-T3-② 数据面 magic 位普查锁（vanilla-projectiles.json）', () => {
  const data = JSON.parse(
    readFileSync(join(ENT_DIR, '..', 'data', 'vanilla-projectiles.json'), 'utf8')) as
    Record<string, { magic?: boolean; friendly?: boolean; hostile?: boolean; aiStyle?: number }>;

  it('接线面 10 弹型数据面 magic=true（251/255/260/461/536/632/634/645/656/856）', () => {
    for (const id of [251, 255, 260, 461, 536, 632, 634, 645, 656, 856]) {
      expect(data[String(id)]?.magic, `弹 ${id} magic 位`).toBe(true);
      expect(data[String(id)]?.hostile, `弹 ${id} hostile 位（flag10 !hostile 段）`).toBeFalsy();
    }
  });

  it('不接线定谳：443 电圈电球 ranged / 636 Daybreak melee——magic 位缺（原版引擎不可达）', () => {
    expect(data['443']?.magic).toBeFalsy();
    expect(data['636']?.magic).toBeFalsy();
    expect(data['443']?.aiStyle).not.toBe(59);
    expect(data['636']?.aiStyle).not.toBe(59);
  });
});

// ============================================================
// ③ 行为抽样（三面）：ghostHeal→ghostHurt→nebula 事件序 + 引擎门
// ============================================================
type Ev = ['heal', number] | ['orb', number] | ['drop', string];

interface Fixture {
  hooks: GameHooks;
  events: Ev[];
  orbs: Array<{ damage: number; x: number; y: number; w: number; h: number }>;
  drops: Array<{ key: string; x: number; y: number }>;
  enemy: ReturnType<typeof mkEnemy>;
}

/** 敌桩——hurt 语义镜像 Enemy.hurt 门面（同 bj420 桩式）。 */
function mkEnemy(id: number, tx: number, ty: number, w = 24, h = 24,
  vanillaId: number | null = 15) {
  const e = {
    id, x: tx * TILE, y: ty * TILE, w, h, dead: false, vanillaId, maxHp: 100, hp: 100,
    lastStrikeDealt: 0, attempts: 0, iframes: 0, dontTakeDamage: false,
    get cx() { return this.x + this.w / 2; },
    get cy() { return this.y + this.h / 2; },
    hurt(this: { lastStrikeDealt: number; attempts: number; iframes: number;
      dontTakeDamage: boolean }, dmg: number): boolean {
      this.lastStrikeDealt = 0;                   // 入口清零（Enemy.ts:14119 同式）
      if (this.iframes > 0 || this.dontTakeDamage) return false;   // 免疫/禁伤门早退
      this.attempts++;
      this.lastStrikeDealt = dmg;                 // 无防御桩:num41=dmg
      return true;
    },
  };
  return e;
}

/** 双套装玩家（ghostHurt setBonus + nebulaSet;可单侧关闭做负判别）。 */
function duoPlayer(opts: { ghost?: boolean; nebula?: boolean } = {}): Record<string, unknown> {
  return {
    dead: false, cx: 60 * TILE, cy: 90 * TILE, x: 60 * TILE - 10, y: 90 * TILE - 21,
    w: 20, h: 42,
    equipStats: {
      setBonus: opts.ghost === false ? {} : { ghostHurt: true },
      nebulaSet: opts.nebula !== false,
    },
    nebulaCD: 0,
  };
}

function mkFixture(enemies: unknown[], player: Record<string, unknown>): Fixture {
  const events: Ev[] = [];
  const orbs: Fixture['orbs'] = [];
  const drops: Fixture['drops'] = [];
  const enemy = enemies[0] as ReturnType<typeof mkEnemy>;
  const hooks = {
    world: { store: new TileStore(200, 120) } as never,
    player,
    enemies: () => enemies,
    critters: () => [],
    projectiles: () => [],
    npcs: () => [],
    spawnDrop: (x: number, y: number, key: string) => {
      events.push(['drop', key]);
      drops.push({ key, x, y });
      return null;
    },
    spawnFriendlyProj: () => {},
    damagePlayer: (): number => 0,
    addDamageNumber: () => {},
    cutTile: () => {},
    onEnemyKilled: () => {},
    spawnEnemy: () => {},
    spawnParticles: () => {},
    notifyInventoryChanged: () => {},
    playSfx: () => {}, playSfxFiles: () => {}, playSfxWav: () => {}, playSfxAt: () => {},
    showPickupLabel: () => {},
    addLightAt: () => {},
    punchCamera: () => {},
    spawnDust: () => null,
    onProjectileDeath: () => {},
    applyLifeSteal: (kind: string, dmg: number) => {
      events.push(['heal', dmg]);
      void kind;
      return 0;
    },
    stack: { anyTagged: () => false, hasActiveEffect: () => false },
  };
  (hooks as unknown as Record<string, unknown>).entities = {
    add: (e: unknown) => {
      const o = e as { projId?: number; damage: number; x: number; y: number; w: number; h: number };
      if (o.projId === 356) { events.push(['orb', o.damage]); orbs.push(o); }
    },
  };
  return { hooks: hooks as unknown as GameHooks, events, orbs, drops, enemy };
}

const PX = 100;
const PY = 60;

describe('BJ424-T3-③ BeamBoltProj 255（磁球激光,自持子步命中环代表面）', () => {
  it('双套装 → 受理命中三引擎同拍依序：heal→orb→drop;orb 伤=弹基伤;CD=30;drop=booster 三键', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.0);   // 全掷 0:crit 真/候选 0 号/booster 门+fam 过
    _resetGhostBudgetForTest(0);
    const e = mkEnemy(1, PX, PY, 64, 64);
    const { hooks, events, orbs, drops } = mkFixture([e], duoPlayer());
    const bolt = new BeamBoltProj(e.cx, e.cy, 1, 0, 50, 2, MAGNET_SPHERE_BOLT);
    bolt.fixedUpdate(1 / 60, hooks);                 // 子步 1 即受理命中→单发亡
    expect(e.attempts).toBe(1);
    expect(events.map((v) => v[0])).toEqual(['heal', 'orb', 'drop']);   // :13877→:13881→:13885
    expect(orbs.length).toBe(1);
    expect(orbs[0].damage).toBe(50);                 // ghostHurt num=弹基伤（非 crit×2 实扣）
    expect(orbs[0].x + orbs[0].w / 2).toBeCloseTo(e.cx, 5);   // 出生=受害者 Center
    expect(orbs[0].y + orbs[0].h / 2).toBeCloseTo(e.cy, 5);
    expect(drops.length).toBe(1);
    expect(NEBULA_BOOSTER_VIDS.has(Number(drops[0].key.match(/^vi_(\d+)_/)?.[1] ?? -1))).toBe(true);
    expect((hooks.player as { nebulaCD?: number }).nebulaCD).toBe(30);      // :13886
    expect(drops[0].x).toBeCloseTo(e.cx, 5);         // 出生=目标中心（:13888 center 实参）
  });

  it('负判别：无 ghostHurt 套装 → orb 缺,drop 照达（两引擎独立门）;反之亦然', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.0);
    _resetGhostBudgetForTest(0);
    const onlyNeb = mkFixture([mkEnemy(2, PX, PY, 64, 64)], duoPlayer({ ghost: false }));
    new BeamBoltProj(onlyNeb.enemy.cx, onlyNeb.enemy.cy, 1, 0, 50, 2,
      MAGNET_SPHERE_BOLT).fixedUpdate(1 / 60, onlyNeb.hooks);
    expect(onlyNeb.events.map((v) => v[0])).toEqual(['heal', 'drop']);
    expect(playerHasGhostHurt(onlyNeb.hooks.player)).toBe(false);

    _resetGhostBudgetForTest(0);
    const onlyGhost = mkFixture([mkEnemy(3, PX, PY, 64, 64)], duoPlayer({ nebula: false }));
    new BeamBoltProj(onlyGhost.enemy.cx, onlyGhost.enemy.cy, 1, 0, 50, 2,
      MAGNET_SPHERE_BOLT).fixedUpdate(1 / 60, onlyGhost.hooks);
    expect(onlyGhost.events.map((v) => v[0])).toEqual(['heal', 'orb']);
    expect(onlyGhost.drops.length).toBe(0);
  });

  it('受害者门（canGhostHeal=false 族 vanillaId=384）→ 命中照常,三引擎全静默', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.0);
    _resetGhostBudgetForTest(0);
    const f = mkFixture([mkEnemy(4, PX, PY, 64, 64, 384)], duoPlayer());
    new BeamBoltProj(f.enemy.cx, f.enemy.cy, 1, 0, 50, 2,
      MAGNET_SPHERE_BOLT).fixedUpdate(1 / 60, f.hooks);
    expect(f.enemy.attempts).toBe(1);                // :13875 门只拦 proc 不拦伤害
    expect(f.events.length).toBe(0);
    expect((f.hooks.player as { nebulaCD?: number }).nebulaCD).toBe(0);
  });
});

describe('BJ424-T3-③ NebulaBlazeBolt 634（飞行盒+Kill AoE 双面代表）', () => {
  it('双套装 → 飞行盒受理面三引擎同拍（AoE skipId 护刚命中敌=单事件序）', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.0);
    _resetGhostBudgetForTest(0);
    const e = mkEnemy(5, PX, PY);
    const { hooks, events, orbs, drops } = mkFixture([e], duoPlayer());
    const bolt = new NebulaBlazeBolt(e.x + 4, e.y + 4, 2, 0, 45, 2, 634);
    for (let i = 0; i < 20 && e.attempts === 0; i++) bolt.fixedUpdate(1 / 60, hooks);
    expect(e.attempts).toBe(1);                      // 飞行盒受理（AoE 被 skipId 跳过）
    expect(events.map((v) => v[0])).toEqual(['heal', 'orb', 'drop']);
    expect(orbs[0].damage).toBe(45);
    expect(drops[0].x).toBeCloseTo(e.cx, 5);
  });
});

describe('BJ424-T3-③ RainbowSegment 251（彩虹段 IDStatic 面代表）', () => {
  it('双套装 → 受理面三引擎同拍依序（251 magic/friendly/aiStyle46）', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.0);
    _resetGhostBudgetForTest(0);
    const e = mkEnemy(6, PX, PY);
    const { hooks, events, orbs, drops } = mkFixture([e], duoPlayer());
    const seg = new RainbowSegment(e.cx, e.cy, 1, 0, 30, 2);
    seg.fixedUpdate(1 / 60, hooks);
    expect(e.attempts).toBe(1);
    expect(events.map((v) => v[0])).toEqual(['heal', 'orb', 'drop']);
    expect(orbs[0].damage).toBe(30);                 // 基伤口径（非 crit×2 dealt）
    expect(VANILLA_ITEM_KEY_BY_ID[3453]).toBeTruthy();
    expect((hooks.player as { nebulaCD?: number }).nebulaCD).toBe(30);
  });
});

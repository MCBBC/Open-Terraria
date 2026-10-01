// ★清偿刀 S2（2026-09-30）判别测试——弹幕受理面+ghostHeal 尾批+切片审计四件：
//  §A R1-A：524 血舌球 Ichor debuff 整缺补线（StatusNPC :11393 AddBuff(69,180-420)）。
//  §B R1-B：524/977/978 ghostHeal/ghostHurt【判例面】（三弹 melee 非 magic——
//      flag10 :13712 资格有,ghostHurt :12022-12026 早退零面;ghostHeal :12089 白耗
//      预算面=家族级债登记,per-class 单源 magic 预门 BJ382 习语保持）。钉数据面
//      magic 旗=假（数据面回归翻真即红）+ proc 双门零行为。
//  §C R1-C：cd 拆 peek/commit 两相（原版外环表读 :12596 无副作用/写梯 :14031-38
//      受里面深位;水母块 return :12687 在写梯前=拒收零落账）——充能水母+接触族弹
//      （1127 aiStyle 161）zap 每拍可达零落账（旧档 ready 读时写=首拍后 10t/永久
//      节流）;非水母受理照落账（commit 面）;直调 ready 组合面零变化。
//  §D BJ415 观察项收口：DrawProj 专支横切二型——857 初代分形 Frame(15,1,frame)
//      （Main.cs:33934;贴图 1350×84=15×90×84;旧 draw height/width 推帧=整幅画出
//      15 剑一排,660 同病）+ 908 钛金碎片 Frame(projFrames[908]=12,1,frame)
//      （Main.cs:33918;贴图 288×28=12×24×28;AI_175 :46150 frame=rand(12) 掷定）。
//      857 帧=AI 掷定非 projFrames（Main.projFrames[857] 无赋值恒 1,grid 表供数）。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { TILE } from '../src/core/constants';
import type { GameHooks } from '../src/entities/types';
import { dealContacts, HitCdImpl } from '../src/entities/proj1457';
import { BladetongueGlobProj } from '../src/entities/meleeOnHitProjs';
import { projectileData } from '../src/data/vanillaProjectiles';
import {
  ghostHealProc, ghostHurtOnHit, playerHasGhostHurt, _resetGhostBudgetForTest,
  ghostBudgetPeek,
} from '../src/entities/SpectreSoulProj';
import { projFrameCount, projGridRect } from '../src/entities/Arrow';

// ═══════════════════════ 桩 ═══════════════════════

/** 敌桩（r1 mkEnemy 同式——hurt 门面+写面镜像 Enemy.hurt） */
function mkEnemy(id: number, px: number, py: number, w = 24, h = 24,
  vanillaId: number | null = 15) {
  const e = {
    id, x: px, y: py, w, h, dead: false, vanillaId, maxHp: 100, hp: 100,
    lastStrikeDealt: 0, attempts: 0, iframes: 0, dontTakeDamage: false,
    def: undefined as undefined | { friendly?: boolean },
    // 状态字段（applyProjStatus SUPPORTED 表直写判据域）
    ichorT: 0,
    get cx() { return this.x + this.w / 2; },
    get cy() { return this.y + this.h / 2; },
    hurt(this: { lastStrikeDealt: number; attempts: number; iframes: number;
      dontTakeDamage: boolean },
      dmg: number, _kx: number, _ky: number): boolean {
      this.lastStrikeDealt = 0;
      if (this.iframes > 0 || this.dontTakeDamage) return false;
      this.attempts++;
      this.lastStrikeDealt = dmg;
      return true;
    },
  };
  return e;
}

interface StealCall { kind: string; dmg: number; numHits: number; isMagic: boolean }

function makeHooks(opts: {
  enemies?: unknown[];
  zaps?: unknown[];
  ste?: StealCall[];
} = {}): { hooks: GameHooks; added: unknown[] } {
  const player = {
    equipStats: {}, luck: 0, dead: false,
    cx: 80 * TILE, cy: 90 * TILE, x: 80 * TILE - 10, y: 90 * TILE - 21, w: 20, h: 42,
    buffs: { has: () => false },
  };
  const added: unknown[] = [];
  const hooks = {
    world: { store: null },
    player,
    enemies: () => opts.enemies ?? [],
    critters: () => [],
    projectiles: () => [],
    npcs: () => [],
    damagePlayer: (): number => 0,
    takeDamageFromJellyfish: (e: unknown) => { opts.zaps?.push(e); },
    addDamageNumber: () => {},
    cutTile: () => {},
    onEnemyKilled: () => {},
    spawnParticles: () => {},
    spawnDust: () => null,
    playSfx: () => {},
    noteNpcPlayerImmune: () => {},
    applyLifeSteal: (kind: 'vampire' | 'ghost', dmg: number, numHits: number,
      _x: number, _y: number, isMagic?: boolean) => {
      opts.ste?.push({ kind, dmg, numHits, isMagic: !!isMagic });
      return 0;
    },
    stack: { anyTagged: () => false, hasActiveEffect: () => false },
  };
  (hooks as unknown as Record<string, unknown>).entities = {
    add: (e: unknown) => { added.push(e); },
  };
  return { hooks: hooks as unknown as GameHooks, added };
}

/** dealContacts self 形（cx/cy 由盒心 getter 供） */
function mkSelf(projId: number, px: number, py: number, w = 64, h = 64) {
  return {
    x: px, y: py, w, h, damage: 30, knockback: 2, armorPen: 0, critChance: 0, projId,
    get cx() { return this.x + this.w / 2; },
    get cy() { return this.y + this.h / 2; },
  };
}

// ═══════════════════════ §A R1-A：524 Ichor 受理面 ═══════════════════════

describe('S2-§A：524 血舌球 Ichor debuff（StatusNPC :11393）', () => {
  it('受理拍 → ichorT ∈ [3,7]s（180-420t=60×Next(3,8)）+ IDStatic 表行照落', () => {
    const e = mkEnemy(601, 450, 450, 16, 16);
    const { hooks } = makeHooks({ enemies: [e] });
    const g = new BladetongueGlobProj(458, 458, 0, 0, 30, 2);
    g.critChanceFn = () => 0;
    g.fixedUpdate(1 / 60, hooks);
    expect(e.attempts).toBe(1);
    expect(e.ichorT).toBeGreaterThanOrEqual(3);           // durMin 180t=3s
    expect(e.ichorT).toBeLessThanOrEqual(7);              // durMax 420t=7s
    expect(e.lastStrikeDealt).toBeGreaterThan(0);
  });

  it('门拒拍（残窗 iframes>0）→ 零 Ichor（:12635 门后位=拒收不可达,D3 同族）', () => {
    const e = mkEnemy(602, 450, 450, 16, 16);
    e.iframes = 10;
    const { hooks } = makeHooks({ enemies: [e] });
    const g = new BladetongueGlobProj(458, 458, 0, 0, 30, 2);
    g.critChanceFn = () => 0;
    g.fixedUpdate(1 / 60, hooks);
    expect(e.attempts).toBe(0);
    expect(e.ichorT).toBe(0);
    expect(g.dead).toBe(false);
  });

  it('单受理单施加：penetrate=5 但 IDStatic 10t 节流 → 同拍次球不重复上 Ichor', () => {
    const e = mkEnemy(603, 450, 450, 16, 16);
    const { hooks } = makeHooks({ enemies: [e] });
    const g1 = new BladetongueGlobProj(458, 458, 0, 0, 30, 2);
    g1.critChanceFn = () => 0;
    g1.fixedUpdate(1 / 60, hooks);
    const g2 = new BladetongueGlobProj(458, 458, 0, 0, 30, 2);
    g2.critChanceFn = () => 0;
    g2.fixedUpdate(1 / 60, hooks);
    expect(e.attempts).toBe(1);                           // 型级静态窗节流（:14036 面）
    expect(e.ichorT).toBeGreaterThanOrEqual(3);           // 单次施加的值域仍在
  });
});

// ═══════════════════════ §B R1-B：ghostHeal/ghostHurt 判例面 ═══════════════════════

describe('S2-§B：524/977/978 幽灵套两支判例面（melee 非 magic）', () => {
  it('数据面：三弹 melee=真 ∧ magic 旗缺（SetDefaults :5941/:9210/:9255 无 magic 行）', () => {
    for (const id of [524, 977, 978]) {
      const d = projectileData(id);
      expect(d, `proj ${id} 型录行在`).toBeTruthy();
      expect(d?.melee, `proj ${id} melee`).toBe(true);
      expect(d?.magic, `proj ${id} magic 旗必须缺（数据面翻真=ghostHeal 门变活,登记面失守）`).toBeFalsy();
      expect(d?.friendly, `proj ${id} friendly`).toBe(true);
    }
    expect([524, 977, 978].map((id) => projectileData(id)?.aiStyle))
      .toEqual([96, 152, 189]);                           // 全 ≠59（flag10 排除档不涉）
  });

  it('ghostHealProc 三弹白耗面（★S2-债1 摘 magic 预门,2026-10-01——原版 :12090 预算'
    + '先扣/:12091-93 非魔法拒回复 ⇒ applyLifeSteal isMagic=false 忠实直传;旧锁'
    + '「零行为」=债面钉,随家族级清偿迁为白耗钉）', () => {
    const ste: StealCall[] = [];
    const { hooks } = makeHooks({ ste });
    const victim = { x: 0, y: 0, w: 24, h: 24, vanillaId: 15, lastStrikeDealt: 50, maxHp: 100 };
    for (const id of [524, 977, 978]) {
      ghostHealProc(hooks, id, 0, victim);
    }
    expect(ste).toHaveLength(3);                          // 白耗面活（旧档 0=预门挡死）
    expect(ste.every((c) => c.kind === 'ghost'
      && c.isMagic === false                              // 数据面非 magic 直传（真扣不回复）
      && c.dmg === 50 && c.numHits === 0)).toBe(true);
  });

  it('ghostHurtOnHit magic:false 零行为（:12022-12026 早退=零预算/零 356）', () => {
    _resetGhostBudgetForTest(0);
    const { hooks, added } = makeHooks({});
    const orbsBefore = added.length;
    ghostHurtOnHit(hooks,
      { magic: false, projDamage: 50, projX: 0, projY: 0, projW: 10, projH: 10,
        ownerCx: 0, ownerCy: 0 },
      { x: 0, y: 0, w: 24, h: 24, cx: 12, cy: 12, vanillaId: 15, lifeMax: 100, dealt: 50 });
    expect(added.length).toBe(orbsBefore);                // 无 356 浮魂
    expect(ghostBudgetPeek()).toBe(0);                    // 预算池零入账（写面全在 magic 门后）
    expect(playerHasGhostHurt(hooks.player)).toBe(false); // 桩面自证（对照 D1 批 magic 站）
  });
});

// ═══════════════════════ §C R1-C：peek/commit 拆相 ═══════════════════════

describe('S2-§C：cd peek/commit 拆相（R1-C 落刀）', () => {
  it('充能水母+接触族弹（1127 aiStyle 161）：zap 每拍可达零落账（:12687 return 在写梯前）', () => {
    const j = mkEnemy(610, 400, 400, 32, 32, 63);         // BlueJellyfish ∈ ZAPPING_JELLYFISH
    j.dontTakeDamage = true;                              // AI_018 充能态
    const zaps: unknown[] = [];
    const { hooks } = makeHooks({ enemies: [j], zaps });
    const self = mkSelf(1127, 396, 396);                  // 盒覆盖敌怪
    const cd = new HitCdImpl();                           // 同表跨拍（弹体自身冷却账）
    for (let t = 0; t < 3; t++) {
      dealContacts(self, hooks, cd, -1);
    }
    expect(zaps.length).toBe(3);                          // 旧档 ready 读时写=首拍后节流（t≥2 恒 1）
    expect(j.attempts).toBe(0);                           // 反噬≠普通命中（充能态零伤）
  });

  it('非水母受理照落账：commit 在命中收尾（:14031 写梯位）——同拍次弹被表行拒', () => {
    const e = mkEnemy(611, 400, 400);
    const { hooks } = makeHooks({ enemies: [e] });
    const cd = new HitCdImpl();
    dealContacts(mkSelf(1126, 380, 380), hooks, cd, 10);  // aiStyle 190 非接触族,受理
    expect(e.attempts).toBe(1);
    expect(e.ichorT).toBe(0);                             // 1126 无 StatusNPC 表行
    dealContacts(mkSelf(1126, 380, 380), hooks, cd, 10);  // 同拍次弹
    expect(e.attempts).toBe(1);                           // peek 读门拒（commit 已落行）
  });

  it('充能水母+非接触族弹（1126）：不 zap 亦不落账（zap 块不可达,受理面零变化）', () => {
    const j = mkEnemy(612, 400, 400, 32, 32, 63);
    j.dontTakeDamage = true;
    const zaps: unknown[] = [];
    const { hooks } = makeHooks({ enemies: [j], zaps });
    const cd = new HitCdImpl();
    for (let t = 0; t < 3; t++) {
      dealContacts(mkSelf(1126, 396, 396), hooks, cd, -1);
    }
    expect(zaps).toHaveLength(0);                         // 1126 aiStyle 190 ∉ {19,161,75,140}
    expect(j.attempts).toBe(0);
  });

  it('直调 ready 组合面零变化：ready ≡ peek+commit（MinionProj/WeaponProj/D2 直调站）', () => {
    const cd = new HitCdImpl();
    expect(cd.peek(1)).toBe(true);
    cd.commit(1, 5);
    expect(cd.peek(1)).toBe(false);
    expect(cd.ready(1, 5)).toBe(false);                   // 组合读门
    expect(cd.ready(2, -1)).toBe(true);                   // 组合受理写
    expect(cd.peek(2)).toBe(false);                       // cooldown=-1 → 每敌一次档
  });
});

// ═══════════════════════ §D BJ415 收口：857/908 横切 ═══════════════════════

function pngSize(rel: string): { w: number; h: number } {
  const buf = readFileSync(resolve(__dirname, rel));
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

describe('S2-§D：DrawProj 专支横切二型（BJ415 同法）', () => {
  it('857 初代分形：15 列横切 90×84（Main.cs:33934 Frame(15,1,frame)）', () => {
    expect(projFrameCount(857)).toBe(15);
    expect(projGridRect(857, 0)).toEqual({ sx: 0, sy: 0, sw: 90, sh: 84, count: 15 });
    expect(projGridRect(857, 7)).toEqual({ sx: 630, sy: 0, sw: 90, sh: 84, count: 15 });
    expect(projGridRect(857, 14)).toEqual({ sx: 1260, sy: 0, sw: 90, sh: 84, count: 15 });
    expect(projGridRect(857, 15)).toEqual(projGridRect(857, 14));   // 越界钳末帧
    const sheet = pngSize('../public/sprites/vanilla/Projectile_857.png');
    expect([sheet.w, sheet.h]).toEqual([1350, 84]);
    expect(projGridRect(857, 0)!.sw).toBeLessThan(sheet.w);         // 「一排剑」病灶判别
  });

  it('857 帧数源双账：Main.projFrames[857] 无赋值（json 缺行=竖条脸 1）,grid 表供 15', () => {
    const json = JSON.parse(readFileSync(
      resolve(__dirname, '..', 'src/data/vanilla-projframes.json'), 'utf8',
    )) as Record<string, number>;
    expect(json['857']).toBeUndefined();                  // projFrames 脸恒 1（帧=AI_168 :43897 掷定）
    expect(projFrameCount(857)).toBe(15);                 // DrawProj 专支脸=grid 供数
  });

  it('908 钛金碎片：12 列横切 24×28（Main.cs:33918 Frame(projFrames[908]=12,1,frame)）', () => {
    expect(projFrameCount(908)).toBe(12);                 // grid=json[908]=12 双账同值
    expect(projGridRect(908, 0)).toEqual({ sx: 0, sy: 0, sw: 24, sh: 28, count: 12 });
    expect(projGridRect(908, 11)).toEqual({ sx: 264, sy: 0, sw: 24, sh: 28, count: 12 });
    expect(projGridRect(908, 12)).toEqual(projGridRect(908, 11));
    const sheet = pngSize('../public/sprites/vanilla/Projectile_908.png');
    expect([sheet.w, sheet.h]).toEqual([288, 28]);
  });

  it('908 帧语义：AI_175 :46150 frame=rand(12) 掷定恒定——json[908]=12 与 grid 同值不漂', () => {
    const json = JSON.parse(readFileSync(
      resolve(__dirname, '..', 'src/data/vanilla-projframes.json'), 'utf8',
    )) as Record<string, number>;
    expect(json['908']).toBe(12);                         // Main.cs:8829 projFrames[908]=12
  });
});

// ★BJ431 火花魔棒（Wand of Sparking, item 3069 → proj 954）1:1 行为锁。
// 权威锚（Terarria1457 反编译,1458 aiStyle2 数值面零变更）:
//   · 物品   Item.cs:28400-28427  伤14/魔力2/useTime·anim 26/速7/暴10/shoot 954
//   · 弹默认 Projectile.cs:9004-9014  10×10 aiStyle2 magic α255 penetrate2 noEnchVis
//   · AI     Projectile.cs:23764-23803（type==954 支:α 钉 255 + ai[0] 计寿 + d6 尘掷率
//            梯 + ai0≥20 拖坠）+ :23929-23932（aiStyle2 尾 vy 钳 32）
//   · 命中   Projectile.cs:13051-13055（Damage_PVE_Inner ai[0]+=(60−ai0)/2 快进）
//            + :11397-11412（OnFire 24 掷,projstatus 表承载）
//   · 绘制   Main.cs DrawProjDirect 通用支 GetAlpha 缺省路径 :81507 (255−α)/255=0
//            → 弹体恒隐,可视本体=d6 火尘（Projectile_954.png=魔杖占位图 40×40 从未出画）
// 实报病灶（2026-09-23 探针 /tmp/bj431 before 拍）:40×40 魔杖贴图满显飞行 + 零尾尘 +
//   aiStyle2 投掷族 0.3/t 重力坠弧 + 3600t 超寿命。
import { describe, it, expect } from 'vitest';
import { Arrow, PROJ_ALPHA0 } from '../src/entities/Arrow';
import { projectileData } from '../src/data/vanillaProjectiles';
import { itemCombat } from '../src/data/vanillaItemCombat';
import { World } from '../src/world/World';
import type { GameHooks } from '../src/entities/types';

interface DustRec { type: number; alpha: number; scale: number; noGravity: boolean; x: number; y: number; vx: number; vy: number; }

function makeGame(w: World, dusts: DustRec[]): GameHooks {
  return {
    world: w, player: null as unknown, enemies: () => [], critters: () => [],
    projectiles: () => [],
    entities: { nextId: 1, add: () => {} },
    playSfx: () => {}, playSfxFiles: () => {}, playSfxFile: () => {},
    spawnParticles: () => {}, addDamageNumber: () => {}, spawnDrop: () => null,
    damagePlayer: (): number => 0, notifyInventoryChanged: () => {},
    onEnemyKilled: () => {}, spawnEnemy: () => {}, cutTile: () => {},
    addLightAt: () => {},
    spawnDust: (x: number, y: number, _w: number, _h: number, type: number,
      sx = 0, sy = 0, alpha = 0, _c: unknown = null, scale = 1, ng = false) => {
      // NewDust 合成序:尘出生位=盒内随机 → 本桩取盒左上(x,y)确定式;速度内建掷速本桩置 0
      const d: DustRec = { type, alpha, scale, noGravity: !!ng, x, y, vx: 0, vy: 0 };
      dusts.push(d);
      void sx; void sy;
      return d;
    },
    broadcastParticleOrchestra: () => {},
  } as unknown as GameHooks;
}

function emptyWorld(): World {
  const w = new World(160, 200, 30, 'open');
  for (let x = 0; x < 160; x++) w.store.setTileSilent(x, 190, 1, 0, 0);
  return w;
}

function flyFrames(a: Arrow, game: GameHooks, frames: number): void {
  for (let i = 0; i < frames && !a.dead; i++) a.fixedUpdate(1 / 60, game);
}

/** Game.fireGemStaffBolts :33732-33742 出手参原形:projGravSpec(954)={grav:0.3,delay:-1}
 *  （aiStyle2=AI_THROWN 兜底档,投掷族语义）、life=timeLeft??3600、pierce=pd.penetrate=2 */
const mkSpark = (x: number, y: number, vx: number, vy: number): Arrow =>
  new Arrow(x, y, vx, vy, 14, 0, 954,
    { grav: 0.3, gravDelay: -1, life: 3600, pierce: 2 } as ConstructorParameters<typeof Arrow>[7]);

describe('BJ431 火花魔棒 954（Projectile.cs:23764-23803）', () => {
  it('【定谳锚·数据面】item 3069→shoot 954,弹 954=aiStyle2/penetrate2/10×10', () => {
    const c = itemCombat(3069);
    expect(c?.shoot).toBe(954);          // Item.cs:28405
    expect(c?.damage).toBe(14);          // :28402
    expect(c?.mana).toBe(2);             // :28401
    expect(c?.useTime).toBe(26);         // :28410
    expect(c?.shootSpeed).toBe(7);       // :28404
    expect(c?.crit).toBe(10);            // :28415
    expect(c?.magic).toBe(true);         // :28414
    const p = projectileData(954);
    expect(p?.aiStyle).toBe(2);          // :9008
    expect(p?.penetrate).toBe(2);        // :9012
    expect(p?.width).toBe(10);           // :9006
    expect(p?.height).toBe(10);          // :9007
    expect(p?.magic).toBe(true);         // :9010
  });

  it('【物理】aiStyle2 投掷族 0.3 兜底重力被出生覆写 0（ctor ★BJ431 块）', () => {
    const a = mkSpark(400, 300, 7, 0);
    expect(a.grav).toBe(0);              // 原版 type==954 支无通用重力;下坠 ai0≥20 支内 vy+0.1
  });

  it('【寿命】ai[0]≥60 AI 杀（60t）,非 3600 timeLeft;59t 仍活', () => {
    const game = makeGame(emptyWorld(), []);
    const a = mkSpark(400, 300, 0, 0);   // 零速防撞块/出界干扰
    flyFrames(a, game, 59);
    expect(a.dead).toBe(false);
    flyFrames(a, game, 2);
    expect(a.dead).toBe(true);           // 第 60 子步 killNow（:23776-23779 num21>=40）
  });

  it('【尾迹】d6 火尘掷率梯:ai0≤3 零尘;爬升段 ai0=4..9 率 ≈0.65(40..90%);α150/noGravity/scale×1.6', () => {
    const dusts: DustRec[] = [];
    const game = makeGame(emptyWorld(), dusts);
    const a = mkSpark(400, 300, 0, 0);
    flyFrames(a, game, 3);
    expect(dusts).toHaveLength(0);       // :23768 ai0>3 门(首 3 子步无尘)
    flyFrames(a, game, 17);
    const d6 = dusts.filter((d) => d.type === 6);
    expect(d6.length).toBeGreaterThanOrEqual(11);   // ai0=10..20 恒 100% → ≥11 确定粒
    expect(d6.length).toBeLessThanOrEqual(17);
    expect(d6.every((d) => d.alpha === 150)).toBe(true);        // :23787 NewDust α150
    expect(d6.every((d) => d.noGravity)).toBe(true);            // :23789
    expect(d6.every((d) => Math.abs(d.scale - 1.6) < 1e-9)).toBe(true);   // :23793 ×1.6
  });

  it('【尾迹·掷率判别】爬升段 ai0=4..9 单掷率:200 弹×6 掷 → 0.65±3σ(判别 ×0.5 系数档)', () => {
    // ★变异判别面:dustP=ai0×10（:23781-23784）。200 弹各飞 9 子步 → 爬升段掷面
    //   ai0=4..9 共 1200 掷,p={.4,.5,.6,.7,.8,.9} 期望率 3.9/6=0.65,σ≈0.014;
    //   ×0.5 突变(率 1.95/6=0.325)落 [0.28,0.37] → 与 3σ 带 [0.61,0.69] 零交。
    let rolls = 0;
    let hits = 0;
    for (let i = 0; i < 200; i++) {
      const dusts: DustRec[] = [];
      const game = makeGame(emptyWorld(), dusts);
      const a = mkSpark(400, 300, 0, 0);
      flyFrames(a, game, 9);
      for (let f = 4; f <= 9; f++) {   // 子步 ai0=4..9 的掷面(尘位序=入表序,按 ai0 切)
        rolls++;
        // 本桩第 f 子步的尘 = dusts 里该子步产出;用计数差分还原掷中位
        void f;
      }
      // ai0=4..9 段每子步至多 1 粒 → 直接累计 ai0=10 出现前的粒数
      hits += dusts.length;            // 前 9 子步仅 4..9 掷(10..20 恒中段未到)
    }
    const rate = hits / rolls;
    expect(rate).toBeGreaterThan(0.61);
    expect(rate).toBeLessThan(0.69);
  });

  it('【尾迹几何/速度】position=(尘位+弹心)/2 向心聚拢;velocity×2+弹速', () => {
    const dusts: DustRec[] = [];
    const game = makeGame(emptyWorld(), dusts);
    // 静态弹:盒左上 (400,300) w10 h10 → 弹心 (405,305);桩尘位=盒左上 → 聚拢位 (402.5,302.5)
    const a = mkSpark(400, 300, 0, 0);
    flyFrames(a, game, 12);
    for (const d of dusts) {
      expect(Math.abs(d.x - 402.5)).toBeLessThan(1e-9);   // (400+405)/2 :23788
      expect(Math.abs(d.y - 302.5)).toBeLessThan(1e-9);
      expect(d.vx).toBe(0); expect(d.vy).toBe(0);         // (0×2)+弹速(0,0)
    }
    // 动态弹:vx=7 → d.vx = 0×2 + 7 = 7（:23790-91 ×2 → :23795 += 弹速）
    const dusts2: DustRec[] = [];
    const game2 = makeGame(emptyWorld(), dusts2);
    const b = mkSpark(400, 300, 7, 0);
    flyFrames(b, game2, 12);
    expect(dusts2.length).toBeGreaterThan(0);
    expect(dusts2.every((d) => Math.abs(d.vx - 7) < 1e-9)).toBe(true);
  });

  it('【拖坠】ai0≥20:vx×0.99 + vy+0.1/t（:23798-23802）——20t 前零重力直线', () => {
    const game = makeGame(emptyWorld(), []);
    const a = mkSpark(400, 300, 7, 0);
    flyFrames(a, game, 19);
    expect(a.vy).toBe(0);                                  // 前 19 子步无下坠
    expect(a.vx).toBe(7);
    flyFrames(a, game, 2);                                 // ai0=20/21 两拍
    expect(a.vy).toBeCloseTo(0.2, 6);                      // +0.1×2
    expect(a.vx).toBeCloseTo(7 * 0.99 * 0.99, 6);          // ×0.99²
  });

  it('【快进】命中 ai[0]+=(60−ai0)/2:ai0=5 → 32.5;快进后 ~27t 内自灭（<60t 恒真）', () => {
    const game = makeGame(emptyWorld(), []);
    const a = mkSpark(400, 300, 0, 0);
    flyFrames(a, game, 5);
    expect((a as unknown as { sparkAi0: number }).sparkAi0).toBe(5);
    (a as unknown as { sparkHitFastForward: () => void }).sparkHitFastForward();
    expect((a as unknown as { sparkAi0: number }).sparkAi0).toBeCloseTo(32.5, 6);
    const left = 60 - 32.5;                                // 快进后剩余寿命
    flyFrames(a, game, Math.ceil(left));
    expect(a.dead).toBe(true);
    // 杀位=子步头 ++ 后判 num21>=40（:23771-23779）→ 钟越过 60 才杀（60.5,原版同构）
    expect((a as unknown as { sparkAi0: number }).sparkAi0).toBeCloseTo(60.5, 6);
  });

  it('【绘制】GA 共组=0 弹体恒隐 + PROJ_ALPHA0 台账 + alpha 每子步钉 255', () => {
    expect(PROJ_ALPHA0[954]).toBe(255);                    // SetDefaults :9011
    expect(PROJ_ALPHA0[979]).toBe(255);                    // :9234
    expect(PROJ_ALPHA0[504]).toBe(255);                    // :5764
    const game = makeGame(emptyWorld(), []);
    const a = mkSpark(400, 300, 7, 0);
    flyFrames(a, game, 10);
    expect(a.alpha).toBe(255);                             // :23766 AI 每子步直写
    expect((a as unknown as { drawGlobalAlpha: () => number | null }).drawGlobalAlpha()).toBe(0);   // GetAlpha 缺省 (255−255)/255=0
  });

  it('【同族 979】结霜魔棒 5147→979:尘 135 霜(三元式 :23787)+恒隐+60t 计寿', () => {
    const p979 = projectileData(979);
    expect(p979?.aiStyle).toBe(2);
    expect(p979?.penetrate).toBe(2);
    const c979 = itemCombat(5147);
    expect(c979?.shoot).toBe(979);
    expect(c979?.damage).toBe(15);
    const dusts: DustRec[] = [];
    const game = makeGame(emptyWorld(), dusts);
    const a = new Arrow(400, 300, 0, 0, 15, 0, 979,
      { grav: 0.3, gravDelay: -1, life: 3600, pierce: 2 } as ConstructorParameters<typeof Arrow>[7]);
    expect(a.grav).toBe(0);                                // ctor 火花族覆写
    flyFrames(a, game, 12);
    const d135 = dusts.filter((d) => d.type === 135);
    // ai0=4..12:爬升段期望 3.9±3σ + ai0=10..12 恒中 3 → 带 [4,11]（3σ 统计闸）
    expect(d135.length).toBeGreaterThanOrEqual(4);
    expect(d135.length).toBeLessThanOrEqual(11);
    expect(dusts.every((d) => d.type === 135)).toBe(true); // 979 → 135 非 6
    flyFrames(a, game, 50);
    expect(a.dead).toBe(true);                             // 同支 60t 计寿
  });

  it('【同族 504】屠夫链锯喷溅弹:同支承载(dormant 发射面,登记 ChainsawProj 头注)', () => {
    const p504 = projectileData(504);
    expect(p504?.aiStyle).toBe(2);
    expect(p504?.penetrate).toBe(2);
    expect(PROJ_ALPHA0[504]).toBe(255);                    // SetDefaults :5764
    const game = makeGame(emptyWorld(), []);
    const a = new Arrow(400, 300, 0, 0, 10, 0, 504,
      { grav: 0.3, gravDelay: -1, life: 3600, pierce: 2 } as ConstructorParameters<typeof Arrow>[7]);
    expect(a.grav).toBe(0);
    flyFrames(a, game, 60);
    expect(a.dead).toBe(true);
  });
});

// ★BJ490（2026-10-04）掷率尾批三小件判别测试（BJ488 新登记;①773 支锁复绿=sw-bj47:193
//   在彼文件更新至现役定谳形,②③在本文件）：
//   ② 天龙之怒 3858 右键 alt swCrit 注入端词缀 crt 段折入（BJ488④ heldCritNow 同族
//      注入端漏折——swPs 此前只喂 dmg/kb）。定谳链：Player.cs:49238-49252
//      altFunctionUse==2 → NewProjectile(708, Damage×0.5, Kb+4);掷面 = Projectile.Damage
//      :12916 `melee && Next(1,101) <= owner.meleeCrit`（Player.cs:25712-14 逐帧折入
//      持械 item.crit+词缀 crt,Item.cs:585 重铸期 crit+=crt）。仓内掷率消费链亲读 =
//      SkyDragonFury 四型号 Math.random()<critChance 直消费出生拍静态冻结载体（不经
//      dealContacts/rollVanillaHitCrit 动态面）→ 注入端补 crt 段 = 最小面;
//      itemCombat(3858).crit=0（Item.cs:34105-34119 SetDefaults 无 crit 赋值,数据面
//      亲读钉值）→ crt 段 = 词缀档唯一武器侧增量（prefix 61 crt+5 → 0.04→0.09）。
//      同域登记债（不并刀）：owner 聚合段未折——同武器左键 707 面
//      critTotal=0.04+item.crit+agg+crt（Game.ts:18542-18544/:20766）双面不对称。
//   ③ 星尘守护者 623 拳盒 hitCritters projId 穿线（BJ488① settleCritterHit 单源同构）。
//      定谳链：623 SetDefaults（Projectile.cs:6701-6718 亲读）minion/friendly 而无
//      melee/ranged/magic 类旗 → 三类掷 :12916-12927 不达 = 零掷（rollVanillaHitCrit
//      kind=null 捷径返假,零 RNG）,TryConsumingTimerCrit :12928 在三类掷臂外无条件
//      消费照达;projId 缺位 → 零掷恰同值（行为零差）,但掷面绕开单源 = 机制缺口 →
//      穿线对齐（黑化 critter+随从弹极窄边的掷/消费全链由 settleCritterHit 自洽承载;
//      结构锁 = 穿线判别面,运行时锚 = TimerCrit 消费不回归）。
//  判别力（旧码必红项）：§2a swCrit 注入端 crt 段结构锁（旧式无 crt 必红）;§2b 数据面
//    钉值+折入算术差 0.05（词缀档唯一增量）;§3a 拳盒 projId 穿线结构锁（旧缺位必红）;
//    §3b 623 类旗零掷钉值（数据面+rollVanillaHitCrit 零 RNG——若误加类旗必红）;
//    §3c/3d TimerCrit 消费面不回归锚（黑化 critter 窄边掷+消费全链）。
import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'path';
import type { GameHooks } from '../src/entities/types';
import { hitCritters } from '../src/entities/projTargets';
import { rollVanillaHitCrit } from '../src/entities/proj1457';
import { projectileData } from '../src/data/vanillaProjectiles';
import { itemCombat } from '../src/data/vanillaItemCombat';
import { prefixStat } from '../src/data/vanillaPrefixes';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = (p: string) => readFileSync(join(HERE, '..', 'src', p), 'utf8');

const PX = 80, PY = 90;
const T = 16;

function makeHooks(opts: {
  critters?: unknown[];
  player?: Record<string, unknown>;
} = {}): GameHooks {
  const player = {
    equipStats: {}, cx: PX * T, cy: PY * T, x: PX * T - 10, y: PY * T - 21,
    w: 20, h: 42, dead: false, facing: 1, vx: 0, vy: 0,
    buffs: { has: () => false },
    ...opts.player,
  };
  return {
    world: { store: null } as never,
    player,
    enemies: () => [],
    critters: () => opts.critters ?? [],
    npcs: () => [],
    projectiles: () => [],
    spawnDrop: () => null,
    damagePlayer: (): number => 0,
    addDamageNumber: () => {},
    cutTile: () => {},
    cutTilesBox: () => {},
    onEnemyKilled: () => {},
    spawnEnemy: () => {},
    spawnParticles: () => {},
    notifyInventoryChanged: () => {},
    playSfx: () => {}, playSfxFiles: () => {}, playSfxWav: () => {}, playSfxAt: () => {},
    showPickupLabel: () => {},
    addLightAt: () => {},
    spawnDust: () => null,
    startLoopSfx: () => ({ stop: () => {}, setVolume: () => {}, playing: true, dead: false }),
    stack: { anyTagged: () => false, hasActiveEffect: () => false },
  } as unknown as GameHooks;
}

interface HurtCall { dmg: number; crit: boolean }

/** critter 桩（Enemy.hurt 免疫窗门同相:iframes>0 返假不落账;黑化复权体=vanillaId∈
 *  CRITTER_TURN_ON_PLAYERS_TYPES + blackenedCritter 运行时位） */
function mkCritter(id: number, x: number, y: number, w = 24, h = 24,
  opts: { iframes?: number; vanillaId?: number | null; blackened?: boolean } = {}) {
  const calls: HurtCall[] = [];
  const c: Record<string, unknown> = {
    id, x, y, w, h, dead: false,
    iframes: opts.iframes ?? 0, dontTakeDamage: false,
    vanillaId: opts.vanillaId ?? null, blackenedCritter: opts.blackened === true,
    hurt(d: number, _kx: number, _ky: number, _g: unknown, _pen: number, crit: boolean): boolean {
      if ((c.iframes as number) > 0) return false;
      calls.push({ dmg: d, crit: !!crit });
      return true;
    },
  };
  return { c, calls };
}

/** TimerCrit 消费侦听桩（记录靶盒,返值可配） */
function timerSpy(ret = true): { box: Array<[number, number, number, number]>;
  fn: (g: unknown, x: number, y: number, w: number, h: number) => boolean } {
  const box: Array<[number, number, number, number]> = [];
  return { box, fn: (_g, x, y, w, h) => { box.push([x, y, w, h]); return ret; } };
}

afterEach(() => { vi.restoreAllMocks(); });

// ================= ② 3858 右键 swCrit 注入端词缀 crt 段折入 =================

describe('BJ490-②：天龙之怒 3858 右键面掷率（crt 段折入——★BJ492② 起载体退役归单源）', () => {
  it('2a 结构锁：右键支掷率单源收编,swCrit 静态载体整体退役（★BJ492② 衔接判语兑现;载体复辟即红）', () => {
    const s = SRC('core/Game.ts');
    // ★BJ492② 定谳：SkyDragonSwing/Shot/Circle 三型掷面收编 rollVanillaHitCrit 单源
    //  （SkyDragonFury 命中拍动态）→ swCrit 计算+三处写位（shot/swingP/circle 沿载体）
    //  随 BJ486② 惯例整体退役（写位无读者即摘）。判别力演进：原「crt/agg 折入段结构」
    //  钉移交单源动态面（heldItemCritBonus/Player.critChance 算术=BJ488 3a/BJ491 1c）
    //  +BJ492 冻结病负向锁;此处=载体退役结构锁（冻结载体复辟必红）。
    expect(s).not.toMatch(/const swCrit = /);
    expect(s).not.toContain('shot.critChance = swCrit');
    expect(s).not.toContain('swingP.critChance = swCrit');
    expect(s).not.toContain('circle.critChance = shot.critChance');
    // 支位锚：3858 右键分派门（Player.cs:31170 altFunctionUse 门 :49238 出生支）
    expect(s).toContain('(heldDef.vid ?? -1) === 3858');
  });

  it('2b 数据面钉值+折入算术：itemCombat(3858) 无 crit 段（Item.cs:34105 SetDefaults 亲读）,crt=词缀档唯一武器侧增量', () => {
    expect(itemCombat(3858)?.crit ?? 0).toBe(0);      // SetDefaults 无 crit 赋值 = 0
    expect(prefixStat(61).crt).toBe(5);               // 词缀 61 暴击档（BJ488 3b 同锚）
    const oldForm = 0.04 + (itemCombat(3858)?.crit ?? 0) / 100;                          // 旧式
    const newForm = 0.04 + ((itemCombat(3858)?.crit ?? 0) + prefixStat(61).crt) / 100;   // 现役式
    expect(newForm - oldForm).toBeCloseTo(0.05, 12);  // ★crt 段增量 5pp（旧式必红钉）
    expect(newForm).toBeCloseTo(0.09, 12);
  });
});

// ================= ③ 623 拳盒 hitCritters projId 穿线 =================

describe('BJ490-③：星尘守护者 623 拳盒 hitCritters projId 穿线（BJ488① settleCritterHit 单源同构）', () => {
  it('3a 结构锁：拳盒自盒携 projId: this.projId（旧缺位必红）', () => {
    const s = SRC('entities/MinionProj.ts');
    // 拳盒 80×40 @ Center+direction×40（:14294-14300）,projId 穿线进 settleCritterHit
    //  掷面（rollVanillaHitCrit 口径,box 载体 projId 位）
    expect(s).toMatch(/hitCritters\(\s*\{ x: this\.cx \+ this\.facing \* 40 - 40, y: this\.cy - 20, w: 80, h: 40, projId: this\.projId \},/);
  });

  it('3b 623 类旗零掷钉值（SetDefaults :6701-6718 亲读）：minion 且无三系类旗,rollVanillaHitCrit 零 RNG 返假', () => {
    const pd = projectileData(623);
    expect(pd?.minion).toBe(true);                    // minion 旗（:6709）
    expect(pd?.melee ?? false).toBe(false);           // 无 melee（三类掷 :12916 不达）
    expect(pd?.ranged ?? false).toBe(false);          // 无 ranged（:12920 不达）
    expect(pd?.magic ?? false).toBe(false);           // 无 magic（:12924 不达）
    const g = makeHooks({ critters: [], player: { critChance: () => 50 } });
    const rnd = vi.spyOn(Math, 'random');
    expect(rollVanillaHitCrit(623, g)).toBe(false);   // kind=null 捷径返假
    expect(rnd).not.toHaveBeenCalled();               // ★零 RNG（若误加类旗必红）
  });

  it('3c 拳盒掷面运行时（623+黑化 critter+TimerCrit 满蓄）：零掷（0 RNG）+消费达+crit 翻转（不回归锚）', () => {
    const t = timerSpy(true);
    const rnd = vi.spyOn(Math, 'random');
    const { c, calls } = mkCritter(11, PX * T, PY * T, 24, 24, { vanillaId: 645, blackened: true });
    const g = makeHooks({
      critters: [c],
      player: { critChance: () => 0, tryConsumingTimerCrit: t.fn },
    });
    const hit = hitCritters(
      { x: PX * T - 40, y: PY * T - 20, w: 80, h: 40, projId: 623 },   // 拳盒同形+穿线位
      g, { minion: true });
    expect(hit).toBe(true);                            // 黑化复权体放行（:20680-20688）
    expect(rnd).not.toHaveBeenCalled();                // ★623 零掷（无类旗,rollVanillaHitCrit 口径）
    expect(t.box.length).toBe(1);                      // ★TimerCrit :12928 消费达
    expect(t.box[0]).toEqual([c.x, c.y, c.w, c.h] as unknown as [number, number, number, number]);
    expect(calls[0].crit).toBe(true);                  // 消费返值翻转 crit 位
    expect(calls[0].dmg).toBe(5);                      // 定伤 shim 不预倍（RB10d-D1 面）
  });

  it('3d 消费假 → crit 恒假（消费返值单源,掷面零 RNG 同相）', () => {
    const t = timerSpy(false);
    const rnd = vi.spyOn(Math, 'random');
    const { c, calls } = mkCritter(12, PX * T, PY * T, 24, 24, { vanillaId: 645, blackened: true });
    const g = makeHooks({
      critters: [c],
      player: { critChance: () => 0, tryConsumingTimerCrit: t.fn },
    });
    expect(hitCritters(
      { x: PX * T - 40, y: PY * T - 20, w: 80, h: 40, projId: 623 }, g, { minion: true })).toBe(true);
    expect(rnd).not.toHaveBeenCalled();
    expect(calls[0].crit).toBe(false);                 // 无蓄能 → 恒假（掷/消费面净语义）
  });
});

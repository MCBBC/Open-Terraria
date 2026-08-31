// PvP 契约五点·缝合批回归（2026-08-31 清零批二波）：
//   GA1 近战 PvP 免疫门（原版 ItemCheck_MeleeHitPVP 循环门禁串含 player.immune 支，
//       1457 Player.cs:44429——victim-settles 等价位 = getProxyPvpImmuneRemaining 镜像）
//   GA2 PvP 弹幕免疫门（Damage_PVP 循环门禁串 Projectile.cs:14650，吸血反馈前置；
//       且门插位先于 pvpProjHitSet.add——免疫期接触不入账）
//   GA4 被击端四结算点 sendPlayerHurt(msg117)+notifyPlayerHurtSettled 收口
//   ——原型桩口径同 weapon-melee-leftover / melee-pvp-los-gate（Object.create(Game.prototype)）。
import { describe, it, expect, vi } from 'vitest';
import { World } from '../src/world/World';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { MagicProj } from '../src/entities/MagicProj';
import { SparkleGuitarProj } from '../src/entities/SparkleGuitarProj';
import { BuffType } from '../src/stats/Buffs';
import { PlayerHurtFlags } from '../src/net/protocol';
import { TILE_BY_KEY } from '../src/data/tiles';
import type { TileStore } from '../src/world/TileStore';
import { Game } from '../src/core/Game';
import { makeNetId } from '../src/net/entitySyncHooks';
import { ITEM_BY_KEY } from '../src/data/items';
import { vanillaItemKey } from '../src/data/vanillaRecipes';

const protGame = (): Record<string, any> => Object.create(Game.prototype) as Record<string, any>;
const iid = (vid: number): number => {
  const k = vanillaItemKey(vid);
  const found = k ? ITEM_BY_KEY[k] : undefined;
  if (found === undefined) throw new Error(`vid ${vid} 未注册`);
  return found;
};

// ---------------------------------------------------------------------------
// GA4：reportPlayerHurt 语义（hp 净减量=dmg 终值、闪避早退不发、crit 位路由）
// ---------------------------------------------------------------------------
describe('GA4 reportPlayerHurt（msg117 发送侧统一出口）', () => {
  /** Game 原型桩：只装配 reportPlayerHurt 触碰面 */
  function shell() {
    const g = protGame();
    const sent: Array<{ dmg: number; x: number; y: number; dir: number; flags: number }> = [];
    const notified = vi.fn();
    const p = new Player(1000, 1000, new Inventory());
    g.player = p;
    g.net = {
      active: true,
      mySlot: 3,
      notifyPlayerHurtSettled: notified,
      sendPlayerHurt: (dmg: number, x: number, y: number, dir: number, flags: number) => {
        sent.push({ dmg, x, y, dir, flags });
      },
    };
    return { g, p, sent, notified };
  }

  it('有净减量才发：dmg=hpBefore−hp；dir=sign(cx−srcX)||1；Pvp 位恒置', () => {
    const { g, p, sent } = shell();
    p.hp = 100;
    p.hp = 70;                                       // 结算后实扣 30
    g.reportPlayerHurt(100, 900, false);             // srcX 在玩家左侧 → dir=+1
    expect(sent.length).toBe(1);
    expect(sent[0]).toMatchObject({ dmg: 30 });
    expect(sent[0].dir).toBe(1);
    expect(sent[0].flags & PlayerHurtFlags.Pvp).not.toBe(0);
  });

  it('无净减量（闪避/免伤早退）→ 不发不通知（≡ vanilla num2<=0 无 SendPlayerHurt）', () => {
    const { g, p, sent, notified } = shell();
    p.hp = 100;
    g.reportPlayerHurt(100, 900, false);             // hp 未动
    expect(sent.length).toBe(0);
    expect(notified).not.toHaveBeenCalled();
  });

  it('crit 位随包转发；死亡结算(hp≤0)仍发；net 失活不出包', () => {
    const { g, p, sent } = shell();
    p.hp = 50; p.hp = -5;                            // 致死一击：delta≥hpBefore，钳到 hpBefore
    g.reportPlayerHurt(50, 1100, true);              // crit → bit0 携带；srcX 右侧 → dir=-1
    expect(sent.length).toBe(1);
    expect(sent[0].dmg).toBe(50);
    expect(sent[0].dir).toBe(-1);
    expect(sent[0].flags & PlayerHurtFlags.Crit).not.toBe(0);

    const h2 = shell();
    h2.g.net.active = false;
    h2.p.hp = 40; h2.p.hp = 10;
    h2.g.reportPlayerHurt(40, 900, false);
    expect(h2.sent.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// GA1/GA2：攻端门禁读镜像（近战循环 + netPvpProjFeedback 弹幕反馈两处 continue 位）
// ---------------------------------------------------------------------------

/** 近战 PvP 桶桩（同 melee-pvp-los-gate.pvpShell 缩形）：一个远端代理摆在判定盒内 */
function pvpShell(immuneMirror: number) {
  const world = new World(160, 160, 42, 'ga1');
  const g = protGame();
  const player = new Player(800, 1440, new Inventory());
  player.inv.add(iid(3013), 1);              // 臭臭爪：melee 无 noMelee、无特判分支
  player.hostile = true;
  g.swing = { t: 15, dur: 30, dmg: 10, kb: 3, item: iid(3013), useStyle: 1 };
  g.swingHitSet = new Set<number>();
  g.swingTileCutSet = new Set<number>();
  g.entities = { critters: [], npcs: [], enemies: [] };
  g.world = world;
  g.player = player;
  g.sfx = { playWavFile: () => true, playFiles: () => true, play: () => {} };
  g.addDamageNumber = () => {};
  g.spawnParticles = () => {};
  g.spawnDrop = () => null;
  g.bannerNpcActive = () => false;
  const rp = new Player(player.cx + 6, player.y, new Inventory());
  rp.hostile = true;
  (rp as unknown as { __netSlot?: number }).__netSlot = 1;
  g.remotePlayerProxies = [rp];
  const strikeSent: unknown[][] = [];
  g.net = {
    active: true,
    policy: { pvpAllowed: true },
    players: new Map([[1, { pvpImmuneT: immuneMirror }]]),
    getProxyPvpImmuneRemaining: (s: number) =>
      (g.net as { players: Map<number, { pvpImmuneT: number }> }).players.get(s)?.pvpImmuneT ?? 0,
    sendStrikePlayer: (...a: unknown[]) => { strikeSent.push(a); },
  };
  return { g, player, rp, strikeSent };
}

describe('GA1 近战 PvP 免疫门（mirror=getProxyPvpImmuneRemaining，1457 :44429 同构支）', () => {
  it('免疫窗内命中体整条被 continue：无 msg44 意向、不入 swingHitSet（不预占去重键）', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.9);
    const { g, strikeSent } = pvpShell(8);
    (g as unknown as { updateSwingHits: () => void }).updateSwingHits();
    expect(strikeSent.length).toBe(0);
    expect([...(g.swingHitSet as Set<number>)]).toEqual([]);
  });

  it('镜像归零：同一门串放行，msg44 意向照常广播（对照上一例的反面）', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.9);
    const { g, strikeSent } = pvpShell(0);
    (g as unknown as { updateSwingHits: () => void }).updateSwingHits();
    expect(strikeSent.length).toBe(1);
    expect(strikeSent[0][0]).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// GA2：netPvpProjFeedback 免疫门（Projectile.cs:14650 门禁串同构支）
// ---------------------------------------------------------------------------

describe('GA2 netPvpProjFeedback 免疫门（门插位先于 pvpProjHitSet.add）', () => {
  function feedbackShell(immuneMirror: number) {
    const world = new World(160, 160, 42, 'ga2');
    const g = protGame();
    const player = new Player(800, 1440, new Inventory());
    player.hostile = true;
    g.world = world;
    g.player = player;
    g.tickCount = 7;
    g.remotePlayerProxies = [];
    g.pvpProjHitSet = new Set<string>();
    const rp = new Player(802, 1440, new Inventory());
    rp.hostile = true;
    (rp as unknown as { __netSlot?: number }).__netSlot = 1;
    g.remotePlayerProxies = [rp];
    const steals: Array<[string, number]> = [];
    g.applyLifeSteal = (kind: string, dmg: number) => steals.push([kind, dmg]);
    g.net = {
      active: true,
      policy: { pvpAllowed: true },
      players: new Map(),
      getProxyPvpImmuneRemaining: () =>
        immuneMirror,
    };
    // 法弹（magic → ghost 吸血支）：与代理盒重叠、damage>0、非傀儡非敌对
    const proj = new MagicProj(800, 1440, 1, 0, 40, 600, '#8090FF');
    g.entities = { projectiles: [proj] };
    return { g, proj, steals };
  }

  it('免疫窗内：吸血反馈与记账双双跳过（门在 add 之前 ⇒ 出窗后同弹重入仍可结算）', () => {
    const { g, steals } = feedbackShell(12);
    (g as unknown as { netPvpProjFeedback: () => void }).netPvpProjFeedback();
    expect(steals.length).toBe(0);
    expect((g.pvpProjHitSet as Set<string>).size).toBe(0);
  });

  it('镜像归零：ghost 吸血恰一发入账一次（每弹×每目标键；重复扫幂等）', () => {
    const { g, steals } = feedbackShell(0);
    (g as unknown as { netPvpProjFeedback: () => void }).netPvpProjFeedback();
    (g as unknown as { netPvpProjFeedback: () => void }).netPvpProjFeedback();
    expect(steals.length).toBe(1);
    expect(steals[0][0]).toBe('ghost');
  });
});

// ---------------------------------------------------------------------------
// 二轮蓝队批（2026-08-31）
//   FR1：bit6 狱火支补实扣广播（SendPlayerHurt 第五生产者，UpdateBuffs==116 支
//        Player.cs:10346-48）——此前 damagePlayer 后直接 return，其他端零飘字。
//   FR3-F：弹 856 收端结算面归一——分派 kind9 真类重建 + 结算按 projId===856 真值
//        裁决（视线门豁免/crit 不掷/浸剂 neither/×0.75 收端折算），legacy kind1 发
//        送方同样被归一（跨版本兼容面）。
// ---------------------------------------------------------------------------

/** 狱火支驱动壳：netApplyStrikePlayer(flags=bit6) 最小触碰面 */
function hellfireShell() {
  const g = protGame();
  const p = new Player(1000, 1000, new Inventory());
  p.hp = 100;
  p.hostile = true;                              // InOpposingTeam 门（双方 hostile）
  g.player = p;
  g.pvpAuraCd = new Map<number, number>();
  const dmgTaken: number[] = [];
  g.damagePlayer = (dmg: number) => {                     // 实扣桩：20 → 全额扣
    dmgTaken.push(dmg);
    p.hp = Math.max(0, p.hp - dmg);
    return true;
  };
  const sent: Array<{ dmg: number; dir: number; flags: number }> = [];
  g.net = {
    active: true,
    mySlot: 2,
    policy: { pvpAllowed: true },
    players: new Map([[1, { active: true, name: 'R', hostile: true, team: 0, x: 1100, y: 1000 }]]),
    notifyPlayerHurtSettled: vi.fn(),
    sendPlayerHurt: (dmg: number, _x: number, _y: number, dir: number, flags: number) =>
      sent.push({ dmg, dir, flags }),
  };
  return { g, p, sent, dmgTaken };
}

describe('FR1 bit6 狱火支实扣权威广播（Player.cs:10348 SendPlayerHurt 生产者补线）', () => {
  it('实扣成功 → msg117 携净减量 + Pvp 位（crit 恒 false，形制同近战支）', () => {
    const { g, sent } = hellfireShell();
    (g as unknown as { netApplyStrikePlayer: (s: number, d: number, w: number, f: number) => void })
      .netApplyStrikePlayer(1, 20, 0, 0x40);
    expect(sent.length).toBe(1);
    expect(sent[0].dmg).toBe(20);                          // hpBefore−hp 净减量
    expect(sent[0].flags & PlayerHurtFlags.Pvp).not.toBe(0);
    expect(sent[0].flags & PlayerHurtFlags.Crit).toBe(0);
    // ★FR3-F（三轮蓝队）：原版 :10344-48 `player.Hurt(ByOther(16),20,0,pvp:true)`
    // hitDirection=0 零击退形制 → dir 恒 0（旧钉「攻击者右侧→-1」系位置符号近似，
    // 已随三站统一废除）
    expect(sent[0].dir).toBe(0);
  });

  it('per-owner 冷却窗内重复意向不再结算/再报（原版 infernoCounter%60 节拍等价）', () => {
    const { g, sent } = hellfireShell();
    const fn = () => (g as unknown as { netApplyStrikePlayer: (s: number, d: number, w: number, f: number) => void });
    fn().netApplyStrikePlayer(1, 20, 0, 0x40);
    fn().netApplyStrikePlayer(1, 20, 0, 0x40);
    expect(sent.length).toBe(1);
  });

  it('地狱火浸剂先于伤害授予（原版 AddBuff 先行 :10344-45）', () => {
    const { g, p } = hellfireShell();
    (g as unknown as { netApplyStrikePlayer: (s: number, d: number, w: number, f: number) => void })
      .netApplyStrikePlayer(1, 20, 0, 0x40);
    expect(p.buffs.has(BuffType.OnFire3)).toBe(true);
  });
});

// ---- FR3-F：kind9 分派序前置 / case9 真类重建 / 收端结算归一 ----

const STONE = TILE_BY_KEY['stone'];

describe('FR3-F broadcast：SparkleGuitarProj 分派序前置出 kind9（曾落 kind1 被 melee 化）', () => {
  function broadcastShell(pvpOn: boolean) {
    const g = protGame();
    g.tickCount = 100;
    g.netProjLast = new Map<number, { x: number; y: number; t: number }>();
    g.netProjCursor = 0;
    g.netProjForce = new Set<number>();   // ★Z-F4 强制上线通道（2026-08-31 增量）桩
    const orb = new SparkleGuitarProj(2000, 2400, -14, -40, 85, 2600, 2200);
    orb.id = 7;
    // 预置差分基准：上一拍位远离当前位置（首次可见即入批——新鲜建项恒跳过）
    g.netProjLast.set(orb.id, { x: orb.x - 600, y: orb.y, t: g.tickCount - 70 });
    const host = new Player(1900, 2400, new Inventory());
    host.hostile = pvpOn;
    g.player = host;
    g.entities = { projectiles: [orb] };
    const batches: Array<Array<{ kind: number; tag: string; aux: number; dmg: number }>> = [];
    g.net = {
      active: true,
      mySlot: 0,
      policy: { pvpAllowed: true },
      sendProjectileBatch: (snaps: Array<{ kind: number; tag: string; aux: number; dmg: number }>) =>
        batches.push(snaps),
      sendProjDespawn: () => {},
      sendNpcSnapshot: () => {},
    };
    return { g, batches };
  }

  it('hostile 房：kind=9|0x40、tag=弹型、aux=旋转相位 t01 千分位（FR5-F；不携浸剂/crit 位——值域 0..1000）', () => {
    const { g, batches } = broadcastShell(true);
    (g as unknown as { netProjBroadcast: () => void }).netProjBroadcast();
    expect(batches.length).toBe(1);
    // 新建相位 t=0 → aux=0；★FR5-F 后该字段承载相位而非恒 0 占位
    // （收端 netPhaseApply 消费——Game.netApplyProjSnaps 重锚 + 傀儡 +3/tick 自推进）
    expect(batches[0][0]).toMatchObject({ kind: 9 | 0x40, tag: '856', dmg: 85 });
    expect(batches[0][0].aux).toBeGreaterThanOrEqual(0);
    expect(batches[0][0].aux).toBeLessThanOrEqual(1000);
  });

  it('非 hostile：不带 PvP 位', () => {
    const { g, batches } = broadcastShell(false);
    (g as unknown as { netProjBroadcast: () => void }).netProjBroadcast();
    expect(batches[0][0].kind).toBe(9);
  });

  it('case9 真类重建：快照左上角转中心入参 → 盒 32×32 与 projId 真值就位', () => {
    const g = protGame();
    const built = (g as unknown as { netMakeProj: (s: Record<string, unknown>) => SparkleGuitarProj | null })
      .netMakeProj({ kind: 9, tag: '856', dmg: 85, aux: 0, x: 800, y: 900, vx: -12, vy: 40 });
    expect(built).toBeInstanceOf(SparkleGuitarProj);
    expect(built!.w).toBe(32);
    expect(built!.h).toBe(32);
    expect(built!.damage).toBe(85);
    expect(built!.x).toBeCloseTo(800, 5);          // 快照左上角恒等（构造中心参内扣 w/2 回写）
  });
});

/** 全高石墙列（LOS 拦截用——参照 melee-pvp-los-gate 同式整列覆盖） */
function wallCol(st: TileStore, col: number) {
  for (let ty = 0; ty < st.h; ty++) st.setTile(col, ty, STONE);
}
/** 近战族对照弹（kind7===1 形态的最小 Entity 面；真 Boomerang 依赖 projectileData 大表，
 *  此处只喂 netPuppetProjContact/hitPlayer 触碰的几何与 projId 面） */
class MeleeKind1Stub {
  x: number; y: number; w = 22; h = 22;
  damage = 80;
  projId: number;
  dead = false;
  constructor(projId: number, cxPx: number, cyPx: number) {
    this.projId = projId;
    this.x = cxPx - this.w / 2;
    this.y = cyPx - this.h / 2;
  }
}

describe('FR3-F settle：856 弹型真值裁决四点（视线门豁免/crit 不掷/浸剂 neither/×0.75 折算）', () => {
  /** 傀儡接触结算壳：victim 本地、ownerSlot=1 远端代理。
   *  wallBetweenOwner = 弹↔发射者代理之间立整列墙（ModifyStellarTune 判定域）。
   *  ※不设「跨玩家墙」对照臂：两盒重叠 ⇒ 中心线必同列/邻列，canHitLine 起终点同格
   *  短路返真(:229 d5=d6=0)，隔列则必非重叠——gate-拦截与 no-overlap 无法纯几何区分；
   *  非 856 族的 gate 位以开阔地臂（crit/浸剂生效）作护栏。 */
  function tuneShell(opts: { projId?: number; kind7?: number;
    wallBetweenOwner?: boolean }) {
    vi.spyOn(Math, 'random').mockReturnValue(0.9);
    const world = new World(220, 160, 42, 'fr3f');
    const st = world.store;
    if (opts.wallBetweenOwner) wallCol(st, 110);
    const g = protGame();
    g.world = world;
    const victim = new Player(1990, 2380, new Inventory());       // cx≈2000（col125）
    victim.hostile = true;
    victim.iframes = 0;
    g.player = victim;
    const ownerProxy = new Player(1400, 2380, new Inventory());   // 发射者远端代理（col88）
    (ownerProxy as unknown as { __netSlot?: number }).__netSlot = 1;
    g.remotePlayerProxies = [ownerProxy];
    const puppetEnt = opts.projId === 856
      ? new SparkleGuitarProj(victim.cx + 4, victim.cy, 0, 0, 80, victim.cx, victim.cy)
      : new MeleeKind1Stub(opts.projId ?? 156, victim.cx + 4, victim.cy);
    const netId = makeNetId(1, 5);
    g.netProjPuppets = new Map([[netId, {
      p: puppetEnt, seen: 0, pvp: true, ownerSlot: 1,
      kind7: opts.kind7 ?? 1,                 // legacy 分类（修复前 856 即此形态）
      enchant: 3,                             // OnFire 浸剂通道（melee||whip 门内才生效）
      ownerMeleeCrit: 255,                    // crit 掷阈值高位段（若被错误套上必触发）
      pvpImmuneT: 0,
    }]]);
    const hurtCalls: number[] = [];
    g.damagePlayer = (dmg: number) => { hurtCalls.push(dmg); victim.iframes += 8; };
    const reports: Array<{ hpBefore: number; srcX: number; crit: boolean }> = [];
    g.reportPlayerHurt = (hpBefore: number, srcX: number, critFlag: boolean) =>
      reports.push({ hpBefore, srcX, crit: critFlag });
    g.net = {
      active: true,
      mySlot: 2,
      policy: { pvpAllowed: true },
      players: new Map([[1, { active: true, name: 'R', hostile: true, team: 0, x: ownerProxy.x, y: ownerProxy.y }]]),
    };
    return { g, victim, hurtCalls, reports };
  }

  it('856（legacy kind7=1 形态）：无视线 → 满伤路径照走；crit 位禁掷；OnFire 浸剂不得授予', () => {
    const { g, hurtCalls, reports } = tuneShell({ projId: 856, kind7: 1 });
    (g as unknown as { netPuppetProjContact: () => void }).netPuppetProjContact();
    // ★附带⑤ 单掷定案（Projectile.cs:14718 唯一 DamageVar，掷点=被击端收口；
    // hitPlayer 的 pvp 支已删再掷）：预掷 round(80×1.125)=90 直接落账（旧双掷
    // 复合语义曾再乘同因子得 101——与原文 :14714 族单掷不符）
    expect(hurtCalls.length).toBe(1);
    expect(hurtCalls[0]).toBe(90);
    expect(reports.length).toBe(1);
    expect(reports[0].crit).toBe(false);                  // magic 弹不掷 crit（:14714 melee 门）
    const v = (g as unknown as { player: Player }).player;
    expect(v.buffs.has(BuffType.OnFire)).toBe(false);     // enchant=3 但 melee 位已按弹真值剔除
  });

  it('856：发射者视线断 → ×0.75 于收端折算（ModifyStellarTuneDamage 掷后消费 :14720；单掷终值 67）', () => {
    const { g, hurtCalls } = tuneShell({ projId: 856, kind7: 1, wallBetweenOwner: true });
    (g as unknown as { netPuppetProjContact: () => void }).netPuppetProjContact();
    // 预掷 90 → trunc(90×0.75)=67；★附带⑤ 后不再有第二掷
    expect(hurtCalls[0]).toBe(67);
  });

  it('对照臂·真近战弹开阔地：浸剂 OnFire 授予 + crit 掷点生效（回归护栏防误伤族语义）', () => {
    const { g, hurtCalls, reports } = tuneShell({ projId: 156, kind7: 1 });
    (g as unknown as { netPuppetProjContact: () => void }).netPuppetProjContact();
    expect(hurtCalls.length).toBe(1);
    expect(reports[0].crit).toBe(true);                   // 90 < ownerMeleeCrit=255
    const v = (g as unknown as { player: Player }).player;
    expect(v.buffs.has(BuffType.OnFire)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// ★联机③ ghostHeal 通域补全（Damage_PVP :14731-34）：吸血受理面不再限定
//   Arrow/MagicProj 实例——friendly/minion 数据位即受理（SparkleGuitarProj 856、
//   WeaponProj 回旋镖族等纳入）；304 吸血刀任意类触发 vampire 支。
// ---------------------------------------------------------------------------
describe('联机③ netPvpProjFeedback 族面补全', () => {
  function shellWithProj(proj: Record<string, unknown>) {
    const world = new World(160, 160, 42, 'fb3');
    const g = protGame();
    const player = new Player(800, 1440, new Inventory());
    player.hostile = true;
    g.world = world;
    g.player = player;
    g.tickCount = 7;
    g.remotePlayerProxies = [];
    g.pvpProjHitSet = new Set<string>();
    const rp = new Player(802, 1440, new Inventory());
    rp.hostile = true;
    (rp as unknown as { __netSlot?: number }).__netSlot = 1;
    g.remotePlayerProxies = [rp];
    const steals: Array<[string, number]> = [];
    g.applyLifeSteal = (kind: string, dmg: number) => steals.push([kind, dmg]);
    g.net = { active: true, policy: { pvpAllowed: true }, players: new Map(),
      getProxyPvpImmuneRemaining: () => 0 };
    g.entities = { projectiles: [proj] };
    return { g, steals };
  }

  it('856（SparkleGuitarProj，非 Arrow/MagicProj 类）：数据 friendly=true → ghost 入账', () => {
    const proj = { id: 3, projId: 856, damage: 40, dead: false, hostile: false,
      x: 800, y: 1440, w: 32, h: 32 };
    const { g, steals } = shellWithProj(proj);
    (g as unknown as { netPvpProjFeedback: () => void }).netPvpProjFeedback();
    expect(steals.length).toBe(1);
    expect(steals[0][0]).toBe('ghost');
  });

  it('敌对弹（hostile=true）与未登记数据且非直射类：不进吸血面', () => {
    const hostile = { id: 4, projId: 80, damage: 30, dead: false, hostile: true,
      x: 800, y: 1440, w: 16, h: 16 };
    const h = shellWithProj(hostile);
    (h.g as unknown as { netPvpProjFeedback: () => void }).netPvpProjFeedback();
    expect(h.steals.length).toBe(0);
    const unknown = { id: 5, projId: 99999, damage: 30, dead: false, hostile: false,
      x: 800, y: 1440, w: 16, h: 16 };
    const u = shellWithProj(unknown);
    (u.g as unknown as { netPvpProjFeedback: () => void }).netPvpProjFeedback();
    expect(u.steals.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// ★三轮蓝队批回归钉子（2026-08-31）
//   FR2-F：damagePlayer 尾通用通道——非 PvP 全路径 msg117 自动生产 + PvP 支去重
//   FR6-F：ghost isMagic 按弹型真值（ghostHeal 内部 !magic 拒，Projectile.cs:12090-12093）
//   FR5-F：kind9 aux 相位通道（收端重锚 + 傀儡等速自推进）
// ---------------------------------------------------------------------------
describe('FR2-F 非 PvP 通用 msg117 通道（Player.Hurt :38656-38664 三要素对位）', () => {
  function envShell() {
    const g = protGame();
    const sent: Array<{ dmg: number; x: number; y: number; dir: number; flags: number }> = [];
    const notified = vi.fn();
    const p = new Player(1000, 1000, new Inventory());
    p.hostile = false;
    g.player = p;
    g.sfx = { playWavFile: () => true, playFiles: () => true, play: () => {} };  // voice 链桩
    g.addDamageNumber = () => {};
    g.spawnParticles = () => {};
    g.net = {
      active: true,
      mySlot: 3,
      notifyPlayerHurtSettled: notified,
      sendPlayerHurt: (dmg: number, x: number, y: number, dir: number, flags: number) =>
        sent.push({ dmg, x, y, dir, flags }),
    };
    return { g, p, sent, notified };
  }

  it('NPC 接触族（pvp=false）落地即广播一次：flags=0、dmg=实扣、src 左侧 → dir=+1', () => {
    const { g, p, sent } = envShell();
    p.iframes = 0;
    const hp0 = p.hp;
    (g as unknown as { damagePlayer: (...a: unknown[]) => number }).damagePlayer(30, 900, 1000);
    expect(sent.length).toBe(1);
    expect(sent[0].flags).toBe(0);                      // 非 PvP 非 crit 位
    expect(sent[0].dmg).toBeGreaterThan(0);
    expect(sent[0].dmg).toBe(Math.max(0, hp0 - p.hp));  // 实扣口径（与五 PvP 支同语义）
    expect(sent[0].dir).toBe(1);                        // 攻击源在左侧
  });

  it('pvp=true 面不自动发（五个结算支显式 reportPlayerHurt 所有权保留）', () => {
    const { g, p, sent } = envShell();
    p.iframes = 0;
    (g as unknown as { damagePlayer: (...a: unknown[]) => number })
      .damagePlayer(20, 960, 1000, undefined, false, true);
    expect(sent.length).toBe(0);
  });
});

describe('FR6-F ghost isMagic 弹型真值投影（A3 类别通道单源）', () => {
  function fbShell(proj: Record<string, unknown>) {
    const world = new World(160, 160, 42, 'fr6');
    const g = protGame();
    const player = new Player(800, 1440, new Inventory());
    player.hostile = true;
    g.world = world;
    g.player = player;
    g.tickCount = 7;
    g.pvpProjHitSet = new Set<string>();
    const rp = new Player(802, 1440, new Inventory());
    rp.hostile = true;
    (rp as unknown as { __netSlot?: number }).__netSlot = 1;
    g.remotePlayerProxies = [rp];
    const steals: Array<{ kind: string; isMagic: boolean }> = [];
    g.applyLifeSteal = (kind: string, _dmg: number, _hits: number, _x: number, _y: number,
      isMagic: boolean) => { steals.push({ kind, isMagic }); return 0; };
    g.net = { active: true, policy: { pvpAllowed: true }, players: new Map(),
      getProxyPvpImmuneRemaining: () => 0 };
    g.entities = { projectiles: [proj] };
    return { g, steals };
  }

  it('856 magic 类 → isMagic=true（预算扣后照治疗）', () => {
    const proj = { id: 3, projId: 856, damage: 40, dead: false, hostile: false,
      x: 800, y: 1440, w: 32, h: 32 };
    const { g, steals } = fbShell(proj);
    (g as unknown as { netPvpProjFeedback: () => void }).netPvpProjFeedback();
    expect(steals.length).toBe(1);
    expect(steals[0]).toEqual({ kind: 'ghost', isMagic: true });
  });

  it('木箭 ranged 类 → isMagic=false（旧恒 true 虚入账面已废）', () => {
    const proj = { id: 4, projId: 1, damage: 40, dead: false, hostile: false,
      x: 800, y: 1440, w: 16, h: 16 };
    const { g, steals } = fbShell(proj);
    (g as unknown as { netPvpProjFeedback: () => void }).netPvpProjFeedback();
    expect(steals.length).toBe(1);
    expect(steals[0]).toEqual({ kind: 'ghost', isMagic: false });
  });
});

describe('FR5-F kind9 旋转相位通道（aux 千分位 t01）', () => {
  it('收端到包重锚：phase01 收敛于携值（t=round(t01×90)）；快照间隔内傀儡自推进 +3/tick', () => {
    const spark = new SparkleGuitarProj(1000, 1000, -12, 40, 80, 1000, 1000);
    spark.netPhaseApply(1 / 3);
    expect(spark.phase01).toBeCloseTo(30 / 90, 6);      // round(90/3)=30 整除无舍入
    (spark as unknown as { netPuppet: boolean }).netPuppet = true;   // 傀儡支自推进
    (spark as SparkleGuitarProj).fixedUpdate(1 / 60, {} as never);
    expect(spark.phase01).toBeCloseTo(33 / 90, 6);
  });

  it('越界/脏值钳制：NaN/负值不污染相位；超 1 钳到 t=90 → mod-90 wrap 为 0（rotation 周期等价）', () => {
    const spark = new SparkleGuitarProj(1000, 1000, 12, 40, 80, 1000, 1000);
    spark.netPhaseApply(Number.NaN);
    expect(spark.phase01).toBeCloseTo(0, 5);
    spark.netPhaseApply(-2);
    expect(spark.phase01).toBeCloseTo(0, 5);
    spark.netPhaseApply(7);                              // clamp→1 → t=90 → wrap 0
    expect(spark.phase01).toBe(0);                       // 2π×90/90 ≡ 2π×0 视觉恒等
  });
});

// BJ554 定谳锁：地牢尖刺(48)接触→流血 buff 全链（用户问询定谳：「尖刺碰到后是否
// 正常流血扣血——流血 buff 是否正常工作」）。
//
// 原版 1.4.5.7 亲读钉值（../Terarria1457/Terraria/）：
//   · TileID.cs:391   Sets.TouchDamageBleeding = {48, 232, 750}
//   · TileID.cs:393   Sets.TouchDamageImmediate = {…, 48:60, 232:80, 750:70}
//   · Collision.cs:3128 HurtTiles（盒扩 1 扫描+半砖/坡面几何）/ :3219 CanTileHurt
//     （Bleeding 族无条件 true）
//   · Player.cs:27819-27826  !shimmering → GetHurtTile(:29181 HurtTiles +
//     TouchedTiles 兜底) → ApplyTouchDamage(:29205)
//   · Player.cs:29211  num = Main.DamageVar(60, −luck) → Hurt(ByOther(3), num, 0,
//     pvp:false, quiet:false, Crit:false, ImmunityCooldownID.TileContactDamage(=0,
//     ImmunityCooldownID.cs:50))
//   · Player.cs:29214  Hurt==0.0（无敌帧/闪避/免伤早退族）→ flag=true → 不授 buff；
//     伤害落地 → AddBuff(30, Main.rand.Next(600, 1200)) —— 10~20s，【无概率门，
//     命中即授】（仅受「伤害须实际落地」门控）
//   · Player.cs:10117  buffType[j]==30 → bleed=true
//   · Player.cs:19296  UpdateLifeRegen：if (bleed) lifeRegenTime = 0f —— 玩家侧
//     流血 =【禁自然回血】（回血蓄力计时逐拍清零 → eRT 爬坡档恒 0 → 无正回复），
//     【非 DoT】（玩家 lifeRegen 无负项）。对照：NPC 侧 bleeding 才是 DoT
//     （NPC.cs:92725 AddBloodLoss(24,4)——玩家不适用）。
//
// 判谳（结论 C 销案）：「流血 buff 主动扣血」≠原版相——扣血来自尖刺接触伤害本身
//   （60 base 经 DamageVar ±15% 掷骰→护甲），流血 buff 本体只禁自然回血。本仓
//   施加门/时长/禁回血三面 1:1 已就位（TouchDamage.ts TOUCH_BLEEDING/
//   TOUCH_IMMEDIATE、Player.ts applyTouchDamage :11200、Player.ts :4453-4457
//   regen 门、Buffs.ts Bleeding=9 无 ENV_DOTS 项），本测试锁死防回归。
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { BuffState, BuffType, BUFF_DEFS } from '../src/stats/Buffs';
import { TOUCH_IMMEDIATE, TOUCH_BLEEDING } from '../src/stats/TouchDamage';
import { TOUCH_BLEEDING_SHEETS } from '../src/data/tiles';
import { TILE_DEFS } from '../src/data/tiles';
import { ImmunityCooldownID } from '../src/player/HurtCooldownBuckets';
import { sheetId } from './env-hazards-util';

const DT = 1 / 60;

// ---- 夹具（同 redblue-r5/bj451 形制）----
const fakeHooks = (w: World, p: Player, damagePlayer: (dmg: number) => number) => ({
  world: w,
  player: p,
  enemies: () => [],
  critters: () => [],
  spawnDrop: () => null,
  damagePlayer,
  addDamageNumber: () => {},
  cutTile: () => {},
  onEnemyKilled: () => {},
  spawnEnemy: () => {},
  spawnParticles: () => {},
  notifyInventoryChanged: () => {},
  playSfx: () => {},
  playSfxFiles: () => {},
  showPickupLabel: () => {},
  scene: {},
});

// 尖刺平台（列 19-21,行 20;世界高 64——HurtTiles 扫描 j1 裁 maxTilesY−40=24,行 20 在窗内）
const spikeWorld = (): { w: World; spike: number } => {
  const w = new World(64, 64, 1, 'bj554');
  const spike = sheetId(48)!;
  for (let x = 19; x <= 21; x++) w.store.setTileSilent(x, 20, spike);
  return { w, spike };
};
// 双脚踩在尖刺顶面（底边==块顶：原版盒重叠判定 `< ty − 0.5` 不裁,站立位即吃触伤）
const spikePlayer = (): Player => new Player(20 * 16, 20 * 16 - 42, new Inventory());

// 泥土地面世界（回血对照）
const dirtWorld = (): World => {
  const w = new World(60, 60, 42, 'bj554-regen');
  for (let x = 12; x <= 40; x++) w.store.setTileSilent(x, 30, 1);
  return w;
};

describe('BJ554 原版钉值对账（1457 亲读锚）', () => {
  it('TouchDamageBleeding = {48,232,750}（TileID.cs:391）且本仓内部 id 全映射到位', () => {
    expect([...TOUCH_BLEEDING_SHEETS].sort((a, b) => a - b)).toEqual([48, 232, 750]);
    for (const s of [48, 232, 750]) {
      const id = sheetId(s)!;
      expect(id, `sheet ${s} 须有 v_ 定义`).toBeGreaterThan(0);
      expect(TOUCH_BLEEDING.has(id), `sheet ${s} 内部 id ${id} 入流血族`).toBe(true);
    }
  });

  it('TouchDamageImmediate：尖刺 60 / 木尖刺 80 / 锋利尖刺块 70（TileID.cs:393）', () => {
    expect(TOUCH_IMMEDIATE.get(sheetId(48)!)).toBe(60);
    expect(TOUCH_IMMEDIATE.get(sheetId(232)!)).toBe(80);
    expect(TOUCH_IMMEDIATE.get(sheetId(750)!)).toBe(70);
  });

  it('尖刺 tile 实心（Main.cs:8073 tileSolid[48]=true）+ Bleeding≡vanilla 30（BuffID.cs:213）', () => {
    expect(TILE_DEFS[sheetId(48)!]?.solid).toBe(true);
    expect(BUFF_DEFS[BuffType.Bleeding]?.vanillaBuff).toBe(30);
  });

  it('接触伤独立桶 TileContactDamage = 0（ImmunityCooldownID.cs:50）', () => {
    expect(ImmunityCooldownID.TileContactDamage).toBe(0);
  });
});

describe('BJ554 尖刺接触→流血施加面（Player.cs:29205 ApplyTouchDamage 链）', () => {
  it('踩尖刺：接触伤害落地 + Bleeding(30) 施加,时长 10~20s（AddBuff(30, Next(600,1200))）', () => {
    const { w } = spikeWorld();
    const p = spikePlayer();
    // 落定（blocked 形夹具：Hurt 返回 0 → 不授 buff,隔离接触面之前的物理 settle）
    for (let i = 0; i < 24; i++) p.fixedUpdate(DT, fakeHooks(w, p, () => 0) as never);
    expect(p.buffs.active.has(BuffType.Bleeding)).toBe(false);
    // 实测拍：伤害落地（夹具代行实扣,返回实扣>0 ≡ 原版 Hurt 返回>0）
    let dealt = 0;
    p.fixedUpdate(DT, fakeHooks(w, p, (dmg) => { dealt = dmg; return dmg; }) as never);
    expect(dealt).toBeGreaterThan(0);                      // 尖刺伤害本身扣血（60 base 掷骰）
    expect(dealt).toBeGreaterThanOrEqual(45);              // DamageVar ±15% 离散带下限邻域
    expect(p.buffs.active.has(BuffType.Bleeding)).toBe(true);
    const left = p.buffs.active.get(BuffType.Bleeding)!;
    expect(left).toBeGreaterThanOrEqual(10 - 2 * DT);      // 首拍衰减容差;下限=600t=10s
    expect(left).toBeLessThan(20);                         // 上限=1200t=20s（Next 上界排他）
    // 死因包（Player.cs:29212 ByOther(3) 尖刺族——本仓 defaultWrap 包）
    expect(p.lastDamageCause?.kind).toBe('defaultWrap');
  });

  it('无概率门：伤害持续落地的窗口内 Bleeding 每拍在栏（命中即授,仅受「伤害落地」门控）', () => {
    const { w } = spikeWorld();
    const p = spikePlayer();
    for (let i = 0; i < 24; i++) p.fixedUpdate(DT, fakeHooks(w, p, () => 0) as never);
    let ticks = 0;
    for (let i = 0; i < 30; i++) {
      p.fixedUpdate(DT, fakeHooks(w, p, (dmg) => dmg) as never);
      if (p.buffs.active.has(BuffType.Bleeding)) ticks++;
    }
    expect(ticks).toBe(30);
  });

  it('伤害被完全抵消（Hurt 返回 0.0）→ 不授流血（:29214 flag 门——无敌帧/闪避/免伤早退族）', () => {
    const { w } = spikeWorld();
    const p = spikePlayer();
    // 夹具恒返回 0 ≡ 原版 Hurt==0.0 早退族（无敌帧内/闪避触发/creativeGodMode 等）
    for (let i = 0; i < 60; i++) p.fixedUpdate(DT, fakeHooks(w, p, () => 0) as never);
    expect(p.buffs.active.has(BuffType.Bleeding)).toBe(false);
  });
});

describe('BJ554 流血效果面（Player.cs:19296 —— 禁自然回血,非 DoT）', () => {
  it('流血在栏：自然回血整段阻断（lifeRegenTime 恒 0,hp 不动）;无 buff 对照组照常回血', () => {
    const run = (bleed: boolean): { hp0: number; hp1: number; p: Player } => {
      const w = dirtWorld();
      const p = new Player(20 * 16, 27 * 16, new Inventory());
      p.baseMaxHp = 400;
      for (let i = 0; i < 320; i++) p.fixedUpdate(DT, fakeHooks(w, p, () => 0) as never);
      p.hp = 390;
      if (bleed) p.buffs.apply(BuffType.Bleeding, 60); // 60s ≫ 8s 窗口
      for (let i = 0; i < 480; i++) p.fixedUpdate(DT, fakeHooks(w, p, () => 0) as never);
      return { hp0: 390, hp1: p.hp, p };
    };
    const ctrl = run(false);
    expect(ctrl.hp1).toBeGreaterThan(ctrl.hp0);          // 对照组：自然回血照常
    const bl = run(true);
    expect(bl.hp1).toBe(bl.hp0);                         // 流血：零回复（禁回血,不掉血）
    expect(bl.p.lifeRegenTime).toBe(0);                  // :19296 lifeRegenTime=0f 逐拍清零
    expect(bl.p.buffs.consumeDotChunk()).toBe(0);        // 无 DoT 分块账
  });

  it('Bleeding 不入玩家 DoT 表（ENV_DOTS 无 30 项→tick 无负流量,dotActiveTick 恒 false）', () => {
    const b = new BuffState();
    b.apply(BuffType.Bleeding, 10);
    let sum = 0;
    for (let k = 0; k < 120; k++) sum += b.tick(DT);
    expect(sum).toBe(0);
    expect(b.dotActiveTick).toBe(false);
    expect(b.active.has(BuffType.Bleeding)).toBe(true);  // 10s buff 2s 窗口内不衰亡
  });
});

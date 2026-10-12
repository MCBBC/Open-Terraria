// ★BJ651（2026-10-12）攻速链尾批三件（BJ640 登记债 R1-R3 清偿判别锁）。
// 权威锚（Terarria1457 亲读）：
//  ·【件1 R1】远端挥击词缀烘定：Item.cs:566-569 Item.Prefix 把 spd 烘进
//    useTime/useAnimation/reuseDelay（(int)Math.Round((float)base×spd) f32 银行家）。
//    序列化面=msg5（writePlayerItems u8 尾段 prefix,R16-13+R17 已落,applyRemoteItems
//    落袋 :1853）→ 代理 inv 槽 {id,stack,prefix} → remoteSwingDur 消费面（本批补）。
//    折算序同本地 :15675：先 roundCSf32Mul 词缀 → truncCSf32Mul 攻速 M（Player.cs:4438-4446）。
//  ·【件2 R2】前缀 dmg 组合面六站（BJ640 台账 :15751/:17561/:19369/:19736/:19813/:21309
//    亲读定谳→现行号 15798/17616/19423/19796/19873/21404）：
//    烘定面（只有词缀步）=站①挥击 dmg/站④鞭 dmg/站⑤召唤 dmg（玩家乘区在下游）：
//    Item.cs:577 `(int)Math.Round((float)damage * dmg)`=roundCSf32Mul;
//    两步面（词缀+玩家乘区）=站②庆典枪口/站③cw 出口/站⑥棱镜每拍：
//    roundCSf32Mul → GetWeaponDamage（Player.cs:54066
//    `(int)((float)damage × mult + 5E-06f)`=truncCSf32MulBias）;
//    站⑥棱镜每拍伤 Projectile.cs:67596 【无】5E-06 偏置=truncCSf32Mul。
//    站④附：BJ640 鞭 anim 双重烘定回归（cw.useTime 已烘定,ctor/scaledAnim 再烘）
//    ——烘定基回 Raw cwIn.useTime。
//  ·【件3 R3】reuseDelay 词缀缩放：Item.cs:569 `reuseDelay = (int)Math.Round(
//    (float)reuseDelay * spd)`——REUSE_DELAY_TICKS 表件此前裸表值。受影响件=
//    表成员×词缀池交集：434(GunsBows)+3787/3269/3870/3541(Magic) 可掷 spd 词缀;
//    27 召唤杖=PrefixesForSummons 池无 spd 词缀（PrefixLegacy.cs:39-42 亲读）。
//    ★攻速配饰 M 不折（ApplyItemAnimation Player.cs:4482 原值拷贝）。
// 判别面：六站取「f32 中点档」判别值（f64 half-up 与 f32 银行家异号：15×1.1→16/17、
//  55×1.1→60/61、50×1.05→52/53）+变异自证（withMutation 恰红+sha256 还原对拍）。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';

import { Game, REUSE_DELAY_TICKS, reuseDelayBakedOf, reuseDelayOf } from '../src/core/Game';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { World } from '../src/world/World';
import { ITEM_BY_KEY, VANILLA_ITEM_KEY_BY_ID, ITEM_DEFS } from '../src/data/items';
import { itemCombat, combatWeapon } from '../src/data/vanillaItemCombat';
import { prefixStat, rollablePrefixes } from '../src/data/vanillaPrefixes';
import { WhipProj } from '../src/entities/WhipProj';
import { FlailProj } from '../src/entities/WeaponProj';
import { MinionProj } from '../src/entities/MinionProj';
import { Celeb2Muzzle } from '../src/entities/Celeb2';
import { writePlayerItems, readPlayerItems, ItemContainer, NetReader } from '../src/net/protocol';
import { TILE } from '../src/core/constants';
import { newWiresRadialState } from '../src/stats/wiresRadial';
import { withMutation } from './mutation-guard';

const GAME_ROOT = join(__dirname, '..');
const srcGame = () => readFileSync(join(GAME_ROOT, 'src/core/Game.ts'), 'utf8');
const srcWhip = () => readFileSync(join(GAME_ROOT, 'src/entities/WhipProj.ts'), 'utf8');

const iid = (vid: number): number => {
  const k = VANILLA_ITEM_KEY_BY_ID[vid];
  const found = k ? ITEM_BY_KEY[k] : undefined;
  if (found === undefined) throw new Error(`vid ${vid} 未注册`);
  return found;
};

/** updateUse 可驱动的最小 Game 桩（bj640 swordGame × bj568 stubGame 合并）+实体捕获 */
function stubGame(heldVid: number, opts: { prefix?: number; ammoVid?: number; minionDmg?: number } = {}) {
  const g = Object.create(Game.prototype) as unknown as Record<string, unknown>;
  const player = new Player(50 * TILE, 90 * TILE, new Inventory());
  player.inv.add(iid(heldVid), 1);
  if (opts.ammoVid) player.inv.add(iid(opts.ammoVid), 30);
  const sel = player.inv.slots.findIndex((s) => s && s.id === iid(heldVid));
  player.inv.selected = Math.max(0, sel);
  if (opts.prefix) {
    const slot = player.inv.slots[Math.max(0, sel)];
    if (slot) slot.prefix = opts.prefix;
  }
  if (opts.minionDmg !== undefined) {
    const base = { ...(player as unknown as { equipStats: Record<string, number> }).equipStats };
    base.minionDmg = opts.minionDmg;
    Object.defineProperty(player, 'equipStats', { value: base, configurable: true });
  }
  g.player = player;
  g.world = new World(120, 120, 30, 'bj651');
  const added: Array<{ kind: string; e: unknown }> = [];
  g.entities = {
    critters: [], npcs: [], enemies: [], projectiles: [],
    add: (e: unknown, kind: string) => { added.push({ kind, e }); },
  };
  g.input = {
    mouseDown: true, mouseHeld: true, mouseX: 700, mouseY: 300,
    rightDown: false, uiBlocking: false, downAction: () => false,
  };
  g.camera = { tileUnder: () => [60, 60], screenToWorld: () => [800, 0], x: 800, y: 0 };
  g.renderer = { canvas: { width: 800, height: 600 }, fullMap: { open: false }, timeUiHover: false, weatherUiHover: false };
  g.smartCursor = { showing: false };
  g.annotateMode = false;
  g.prevSwingMouse = false;
  g.mining = null;
  g.swingHitSet = new Set<number>();
  g.swingTileCutSet = new Set<number>();
  g.wiresRadial = newWiresRadialState();
  g.uiHeldItemRef = () => null;
  g.inpOverDomUi = () => false;
  g.achievements = { handleSpecialEvent: () => {} };
  g.cb = { onInventoryChanged: () => {}, onToast: () => {} };
  g.sfx = {
    play: () => true, playWav: () => true, playWavFile: () => true, playFiles: () => true,
  };
  g.playSfxFile = () => {};
  g.playUseSound = () => {};
  return { g: g as unknown as Game & Record<string, unknown>, player, added };
}

// ============================ 件1（R1）：remoteSwingDur 词缀烘定同步 ============================

describe('BJ651件1 远端挥击词缀烘定（msg5 prefix 序列化面→remoteSwingDur 消费面）', () => {
  it('序列化面：writePlayerItems→readPlayerItems 往返保 prefix（背包段=swingNet 词缀源槽）', () => {
    const frame = writePlayerItems([
      { playerSlot: 2, container: ItemContainer.Slots, itemSlot: 0, itemId: iid(3508), stack: 1, prefix: 53 },
      { playerSlot: 2, container: ItemContainer.Slots, itemSlot: 1, itemId: 0, stack: 0, prefix: 0 },
    ]);
    const back = readPlayerItems(new NetReader(frame.subarray(3)));   // 剥 [u16 len][u8 id] 头
    expect(back[0]).toMatchObject({ itemId: iid(3508), stack: 1, prefix: 53 });
    expect(back[1]).toMatchObject({ itemId: 0, stack: 0, prefix: 0 });
  });

  it('消费面（近战剑支）：铜阔剑 3508 useTime=20——词缀 17(Quick spd .85)→17、48(spd 1.2)→24', () => {
    expect(prefixStat(17).spd).toBeCloseTo(0.85, 6);
    const mk = (prefix?: number) => {
      const { g, player } = stubGame(3508, { prefix });
      // 远端代理 bag 直拷形态：{id,stack,prefix}（applyRemoteItems :1853 同构）
      player.inv.slots[Math.max(0, player.inv.selected)] = { id: iid(3508), stack: 1, prefix };
      return (g as unknown as { remoteSwingDur: (id: number, p?: Player) => number })
        .remoteSwingDur(iid(3508), player);
    };
    expect(mk(undefined)).toBe(20);   // 无词缀零漂移
    expect(mk(17)).toBe(17);          // roundCSf32Mul(20,.85)=17 → trunc(17×1)=17
    expect(mk(48)).toBe(24);          // roundCSf32Mul(20,1.2)=24
  });

  it('消费面（攻速复合）：词缀 17 + M=1/1.12 → trunc(17×0.892)=15（烘定序:先词缀后攻速）', () => {
    const { g, player } = stubGame(3508, { prefix: 17 });
    player.inv.slots[Math.max(0, player.inv.selected)] = { id: iid(3508), stack: 1, prefix: 17 };
    Object.defineProperty(player, 'attackSpeedMult', { get: () => 1 / 1.12, configurable: true });
    expect((g as unknown as { remoteSwingDur: (id: number, p?: Player) => number })
      .remoteSwingDur(iid(3508), player)).toBe(15);   // trunc(f32(17×(1/1.12)))=15
  });

  it('消费面（工具支）：ITEM_DEFS[579] pick speed=25（combatWeapon=shot → 落工具支）——词缀 17 → 21', () => {
    const { g, player } = stubGame(3508);
    player.inv.slots[0] = { id: 579, stack: 1, prefix: 17 };
    player.inv.selected = 0;
    const rd = (g as unknown as { remoteSwingDur: (id: number, p?: Player) => number });
    expect(rd.remoteSwingDur(579, player)).toBe(21);   // round(25×.85)=round(21.25)=21
    player.inv.slots[0] = { id: 579, stack: 1, prefix: undefined };
    expect(rd.remoteSwingDur(579, player)).toBe(25);
  });

  it('链面结构锁：msg5 落袋带 prefix（ClientNet）+ remoteSwingDur 读代理 heldItem().prefix', () => {
    const cn = readFileSync(join(GAME_ROOT, 'src/net/ClientNet.ts'), 'utf8');
    expect(cn).toContain("arr[e.itemSlot] = e.itemId ? { id: e.itemId, stack: e.stack, prefix: e.prefix } : null;");
    const gs = srcGame();
    expect(gs).toContain('const pfx = proxy?.inv.heldItem()?.prefix;');
    expect(gs).toContain('const dur = this.remoteSwingDur(heldId, proxy);');
  });
});

// ============================ 件2（R2）：前缀 dmg 组合面六站 ============================

describe('BJ651件2 站① 挥击 dmg 烘定（掌掴手 1304 dmg=15——f32 中点档判别:原版 16/旧 f64 half-up 17）', () => {
  it('词缀 53(Sharp dmg 1.1)：swing.dmg=roundCSf32Mul(15,1.1)=16;无词缀=15', () => {
    expect(prefixStat(53).dmg).toBeCloseTo(1.1, 6);
    const { g } = stubGame(1304, { prefix: 53 });
    (g as unknown as { updateUse: (dt: number) => void }).updateUse(1 / 60);
    const sw = (g as unknown as { swing: { dmg?: number; dur: number } | null }).swing;
    expect(sw?.dmg).toBe(16);   // f32(16.500000000000001)=16.5 → 银行家 16;旧 Math.round=17
    // 对照：无词缀
    const { g: g2 } = stubGame(1304);
    (g2 as unknown as { updateUse: (dt: number) => void }).updateUse(1 / 60);
    expect((g2 as unknown as { swing: { dmg?: number } | null }).swing?.dmg).toBe(15);
  });
});

describe('BJ651件2 站② 庆典 MK2 枪口两步+弹药乘区（3930 mzBase=50+火箭 771 dmg=40）', () => {
  const fireOnce = (prefix?: number) => {
    const { g, added } = stubGame(3930, { prefix, ammoVid: 771 });
    (g as unknown as { updateUse: (dt: number) => void }).updateUse(1 / 60);
    const mz = added.map((a) => a.e).find((e) => e instanceof Celeb2Muzzle) as Celeb2Muzzle | undefined;
    expect(mz, 'Celeb2Muzzle 未出生').toBeTruthy();
    added.length = 0;
    const ok = (mz as unknown as { fireCb: (v: number, x: number, y: number, vx: number, vy: number,
      o: { bonusAi1: boolean; spreadRot: (a: number) => { x: number; y: number } }) => boolean })
      .fireCb(0, 100, 100, 1, 0, { bonusAi1: false, spreadRot: () => ({ x: 1, y: 0 }) });
    expect(ok).toBe(true);
    const rk = added.map((a) => a.e).find((e) => (e as { damage?: number }).damage !== undefined
      && (e as { projId?: number }).projId !== undefined && !(e instanceof Celeb2Muzzle)) as { damage: number } | undefined;
    expect(rk, '火箭弹未出生').toBeTruthy();
    return rk!.damage;
  };
  it('词缀 55(dmg 1.05)：武器段 truncBias(1,roundCSf32Mul(50,1.05)=52)=52+弹药 40=92（旧单 round=93）', () => {
    expect(prefixStat(55).dmg).toBeCloseTo(1.05, 6);
    expect(fireOnce(55)).toBe(92);   // f32(52.500000000000002)=52.5 → 银行家 52
  });
  it('无词缀对照：50+40=90（弹药段乘区中性 ×1）', () => {
    expect(fireOnce(undefined)).toBe(90);
  });
});

describe('BJ651件2 站③ cw 出口两步（链锤 162 dmg=15,dmgKind=melee——原版 16/旧 17）', () => {
  it('词缀 53：FlailProj.damage=truncBias(1,roundCSf32Mul(15,1.1))=16', () => {
    const { g, added } = stubGame(162, { prefix: 53 });
    (g as unknown as { updateUse: (dt: number) => void }).updateUse(1 / 60);
    const fl = added.map((a) => a.e).find((e) => e instanceof FlailProj) as FlailProj | undefined;
    expect(fl, 'FlailProj 未出生').toBeTruthy();
    expect(fl!.damage).toBe(16);   // 旧 Math.round(15×1.1×1)=17
    // 对照：无词缀 15
    const { g: g2, added: added2 } = stubGame(162);
    (g2 as unknown as { updateUse: (dt: number) => void }).updateUse(1 / 60);
    const fl2 = added2.map((a) => a.e).find((e) => e instanceof FlailProj) as FlailProj;
    expect(fl2.damage).toBe(15);
  });
});

describe('BJ651件2 站④ 鞭（4678 dmg=55——原版 60/旧 61）+anim 单点烘定（BJ640 双烘回归）', () => {
  it('词缀 53：WhipProj.damage=roundCSf32Mul(55,1.1)=60', () => {
    const { g, added } = stubGame(4678, { prefix: 53 });
    (g as unknown as { updateUse: (dt: number) => void }).updateUse(1 / 60);
    const wp = added.map((a) => a.e).find((e) => e instanceof WhipProj) as WhipProj | undefined;
    expect(wp, 'WhipProj 未出生').toBeTruthy();
    expect(wp!.damage).toBe(60);   // f32(60.500000000000007)=60.5 → 银行家 60
  });
  it('无词缀 + summonDamageMult 1.1：dmgNow=truncBias(1.1,55)=60（旧 f64 round(60.5)=61）', () => {
    const { g, added } = stubGame(4678, { minionDmg: 0.1 });
    (g as unknown as { updateUse: (dt: number) => void }).updateUse(1 / 60);
    const wp = added.map((a) => a.e).find((e) => e instanceof WhipProj) as WhipProj;
    expect((wp as unknown as { dmgNow: number }).dmgNow).toBe(60);   // GetWeaponDamage 第二步 :54066（f32(60.5)+5e-6 截断）
  });
  it('anim 单点烘定：词缀 42(spd .9) anim=roundCSf32Mul(28,.9)=25（旧双烘=22 快 3t）', () => {
    expect(prefixStat(42).spd).toBeCloseTo(0.9, 6);
    const { g, added, player } = stubGame(4678, { prefix: 42 });
    (g as unknown as { updateUse: (dt: number) => void }).updateUse(1 / 60);
    const wp = added.map((a) => a.e).find((e) => e instanceof WhipProj) as WhipProj;
    expect(wp.anim).toBe(25);      // ctor 单点烘定（Item.Prefix :567 一次）
    expect(player.useTime).toBe(25);   // scaledAnim 与 ctor 同基同式
    // 无词缀对照零漂移（BJ638 基线）
    const { g: g2, added: added2, player: p2 } = stubGame(4678);
    (g2 as unknown as { updateUse: (dt: number) => void }).updateUse(1 / 60);
    const wp2 = added2.map((a) => a.e).find((e) => e instanceof WhipProj) as WhipProj;
    expect(wp2.anim).toBe(28);
    expect(p2.useTime).toBe(28);
  });
});

describe('BJ651件2 站⑤ 召唤杖 dmg 烘定（3249 dmg=55——原版 60/旧 61）', () => {
  it('词缀 53：MinionProj.damage=roundCSf32Mul(55,1.1)=60;无词缀=55', () => {
    const { g, added } = stubGame(3249, { prefix: 53 });
    (g as unknown as { updateUse: (dt: number) => void }).updateUse(1 / 60);
    const mp = added.map((a) => a.e).find((e) => e instanceof MinionProj) as MinionProj | undefined;
    expect(mp, 'MinionProj 未出生').toBeTruthy();
    expect(mp!.damage).toBe(60);
    const { g: g2, added: added2 } = stubGame(3249);
    (g2 as unknown as { updateUse: (dt: number) => void }).updateUse(1 / 60);
    const mp2 = added2.map((a) => a.e).find((e) => e instanceof MinionProj) as MinionProj;
    expect(mp2.damage).toBe(55);
  });
});

describe('BJ651件2 站⑥ 棱镜每拍伤（3541 dmg=100——truncCSf32Mul 无偏置,Projectile.cs:67596）', () => {
  it('词缀 53：dmgCb()=trunc(1×roundCSf32Mul(100,1.1))=110（behavioral 钉值）', () => {
    const { g, added } = stubGame(3541, { prefix: 53 });
    (g as unknown as { updateUse: (dt: number) => void }).updateUse(1 / 60);
    const prism = added.map((a) => a.e).find((e) => (e as { dmgCb?: () => number }).dmgCb) as { dmgCb: () => number } | undefined;
    expect(prism, 'PrismProj(dmgCb) 未出生').toBeTruthy();
    expect(prism!.dmgCb()).toBe(110);
  });
  it('结构锁：站⑥行=truncCSf32Mul(magicMult, roundCSf32Mul(...))——无 Bias 偏置（:67596 异 :54066）', () => {
    const gs = srcGame();
    expect(gs).toContain("() => truncCSf32Mul(this.player.damageMult('magic'), roundCSf32Mul(cwIn.damage, ps?.dmg ?? 1)));");
  });
});

// ============================ 件3（R3）：reuseDelay 词缀缩放 ============================

describe('BJ651件3 reuseDelayBakedOf（Item.cs:569 round f32 银行家;M 不折）', () => {
  it('单位锁：434 rd14——spd .85→12/1.15→16/1→14;非表件 0;召唤杖 rd2 边界', () => {
    expect(reuseDelayOf(434)).toBe(14);
    expect(reuseDelayBakedOf(434, 1)).toBe(14);
    expect(reuseDelayBakedOf(434, 0.85)).toBe(12);   // f32(11.8999996)→round 12
    expect(reuseDelayBakedOf(434, 1.15)).toBe(16);   // f32(16.0999994)→round 16
    expect(reuseDelayBakedOf(3787, 0.9)).toBe(16);   // rd18×0.9=f32(16.2)=16.19999→16
    expect(reuseDelayBakedOf(1157, 1.2)).toBe(2);    // round(2.4)=2
    expect(reuseDelayBakedOf(1157, 0.85)).toBe(2);   // round(1.7)=2
    expect(reuseDelayBakedOf(1, 1.2)).toBe(0);       // 非表件
    expect(reuseDelayBakedOf(777, 0.85)).toBe(0);
  });

  it('受影响件清单=表成员×词缀池交集：434+3787/3269/3870/3541 有 spd 池;27 召唤杖空（PrefixLegacy.cs:39-42）', () => {
    const rd = Object.keys(REUSE_DELAY_TICKS).map(Number);
    const withSpd = rd.filter((vid) => (rollablePrefixes(vid, false) ?? [])
      .some((p) => prefixStat(p).spd !== 1)).sort((a, b) => a - b);
    expect(withSpd).toEqual([434, 3269, 3541, 3787, 3870]);
    // 召唤杖全族池内零 spd 词缀 → roundCSf32Mul(rd,1)=rd 恒等
    for (const vid of rd.filter((v) => !withSpd.includes(v))) {
      expect(rollablePrefixes(vid, false)!.some((p) => prefixStat(p).spd !== 1)).toBe(false);
      expect(reuseDelayBakedOf(vid, 1)).toBe(REUSE_DELAY_TICKS[vid]);
    }
  });

  it('useSwing 行为锁（天界碎裂 3787 rd=18/useAnimation=12）：词缀 42 → 12+16=28（旧 12+18=30）', () => {
    const { g } = stubGame(3787, { prefix: 42 });
    (g as unknown as { useSwing: (def: unknown, aim?: number, mult?: number) => void })
      .useSwing(ITEM_DEFS[iid(3787)]);
    // 直调 useSwing（默认 mult=1=魔法支调用形态）;heldPrefixStat 读桩槽 prefix
    const sw = (g as unknown as { swing: { dur: number } | null }).swing;
    expect(sw?.dur).toBe(28);
    // 无词缀对照 30
    const { g: g2 } = stubGame(3787);
    (g2 as unknown as { useSwing: (def: unknown) => void }).useSwing(ITEM_DEFS[iid(3787)]);
    expect((g2 as unknown as { swing: { dur: number } | null }).swing?.dur).toBe(30);
  });

  it('结构锁：useSwing/434 复合/五处 slowMagicSprayPlan 全部走 reuseDelayBakedOf', () => {
    const gs = srcGame();
    expect(gs).toContain('dur += reuseDelayBakedOf(vid, this.heldPrefixStat()?.spd ?? 1);');
    expect(gs).toContain('this.player.useTime = animDur434 + reuseDelayBakedOf(bowVid2, ps?.spd ?? 1);');
    expect(gs.match(/reuseDelayBakedOf\(critVid, this\.heldPrefixStat\(\)\?\.spd \?\? 1\)/g)?.length).toBe(5);
  });
});

// ============================ 变异自证（恰红 + 逐字节还原 + sha256 对拍） ============================

describe.skipIf(process.env.SW_BJ651_MUT)('BJ651 变异自证（每件≥1 发,恰红）', () => {
  const GAME = join(GAME_ROOT, 'src/core/Game.ts');
  const WHIP = join(GAME_ROOT, 'src/entities/WhipProj.ts');
  const sha = (f: string) => createHash('sha256').update(readFileSync(f)).digest('hex');

  const mutate = (file: string, trigger: string, replacement: string, filter: string, target: string) => {
    const pristineSha = sha(file);
    withMutation(file, trigger, replacement, () => {
      const r = spawnSync('npx',
        ['vitest', 'run', 'tests/bj651-attackspeed-tail.test.ts', '--no-file-parallelism', '-t', filter],
        { cwd: process.cwd(), encoding: 'utf8', timeout: 600_000, env: { ...process.env, SW_BJ651_MUT: '1' } });
      expect(r.status, `变异须证红（${target}）: ${replacement}\n${r.stdout.slice(-3000)}`).not.toBe(0);
      expect(r.stdout).toContain(filter);
    }, { label: `BJ651 ${filter}` });
    expect(sha(file), `还原后 sha256 对拍不一致: ${file}`).toBe(pristineSha);
  };

  it('M1 件1：remoteSwingDur 词缀烘定摘除 → 件1 消费面红', () => {
    mutate(GAME,
      'roundCSf32Mul(cw?.useTime ?? def.tool?.speed ?? 42, pSpd), spd)',
      'cw?.useTime ?? def.tool?.speed ?? 42, spd) /* ★BJ651 M1 变异:词缀烘定摘除 */',
      'M=1/1.12',
      'remoteSwingDur 烘定');
  });

  it('M2 件2站③：cw 出口两步回退单次 f64 round → 站③红', () => {
    mutate(GAME,
      'truncCSf32MulBias(this.player.damageMult(dmgKind), roundCSf32Mul(cwIn.damage, ps?.dmg ?? 1))',
      'Math.round(cwIn.damage * (ps?.dmg ?? 1) * this.player.damageMult(dmgKind)) /* ★BJ651 M2 变异:两步回退 */',
      '链锤 162',
      '站③ cw.damage');
  });

  it('M3 件3：useSwing rd 烘定回退裸表值 → 件3 行为锁红', () => {
    mutate(GAME,
      'dur += reuseDelayBakedOf(vid, this.heldPrefixStat()?.spd ?? 1);',
      'dur += reuseDelayOf(vid); // ★BJ651 M3 变异:rd 烘定回退',
      '天界碎裂 3787',
      'useSwing rd');
  });

  it('M4 件2站④附：鞭 anim 烘定基回潮已烘 cw.useTime（双烘回归）→ anim 锁红', () => {
    mutate(GAME,
      'Math.floor(roundCSf32Mul(cwIn.useTime, ps?.spd ?? 1) * fold)',
      'Math.floor(roundCSf32Mul(whip.useTime, ps?.spd ?? 1) * fold) /* ★BJ651 M4 变异:双烘回潮 */',
      'anim 单点烘定',
      '鞭 anim 烘定基');
  });

  it('M5 件2站④②：WhipProj dmgNow 截断+偏置回退 f64 round → dmgNow 锁红', () => {
    mutate(WHIP,
      'truncCSf32MulBias(o ? o.summonDamageMult : 1, damage)',
      'Math.round(damage * (o ? o.summonDamageMult : 1)) /* ★BJ651 M5 变异:截断回退 */',
      'summonDamageMult 1.1',
      'WhipProj dmgNow');
  });
});

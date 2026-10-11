// BJ640 攻速/加成声明→应用链全域普查（2026-10-11）：主轴 = useTime/useAnimation 折算链。
// 权威锚（Terarria1457 亲读）：
//  · Player.cs:29253-29266 CapAttackSpeeds + TurnAttackSpeedToUseTimeMultiplier：
//    meleeSpeed 字段每拍被翻转为倒数档 M=1/min(3,A)（:26176 Update 内,ItemCheck :28495 在后
//    → ApplyItemAnimation/ItemCheck_Shoot 读到的恒为 M）。
//  · Player.cs:4438-4446 SetItemAnimation(base,mult)：val=(int)(base×mult)【截断】+max(,1)。
//  · Player.cs:26110-26112 per-item BonusMeleeSpeedMultiplier（ItemID.cs:1168 四件）缩放。
//  · Player.cs:4456 melee 支门 NoMeleeSpeedBonus（ItemID.cs:62 {3821}）。
//  · Item.cs:565-570 Item.Prefix 把 spd 烘进 useTime/useAnimation/reuseDelay
//    （(int)Math.Round((float)base×spd) f32+银行家=roundCSf32Mul）。
//  · Player.cs:47466-47468 ItemCheck_Shoot：speed /= meleeSpeed（÷M=×攻速和）。
//  · Projectile.cs:47066 矛延伸盒 num4 ×= 1/master.meleeSpeed（×A）。
//  · Projectile.cs:40172-40186 回旋镖回程 toMax=1/meleeSpeed（=A）。
//  · Projectile.cs:68803/:68941 悠悠球寿命/射程 ÷(1+meleeSpeed)/2 与 ÷(1+meleeSpeed×3)/4（M）。
//  · Player.cs:47752 叶绿军刃 1127 Remap(meleeSpeed,1,1/3,1,0.25)（M∈[1/3,1]）。
// 旧式病（本批判别面）：
//  ①近战挥击时长 ÷attackSpeedMult = ×攻速和 = 方向反（+12% 挥击 21→24,原版 21→18）；
//  ②近战/工具/鞭词缀速度整缺（Item.Prefix spd 不消费）；
//  ③meleeThrowSpeed/SpearProj ×M 方向反；悠悠球 vms/叶绿 ms/回程 asm 语义反；
//  ④聚合面乘法 vs 原版加法堆叠。
import { describe, it, expect } from 'vitest';
import { Game } from '../src/core/Game';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { World } from '../src/world/World';
import { BuffType } from '../src/stats/Buffs';
import { itemCombat, BONUS_MELEE_SPEED_MULTIPLIER, NO_MELEE_SPEED_BONUS } from '../src/data/vanillaItemCombat';
import { prefixStat } from '../src/data/vanillaPrefixes';
import { ITEM_BY_KEY } from '../src/data/items';
import { vanillaItemKey } from '../src/data/vanillaRecipes';
import { meleeThrowSpeed, SpearProj, spearExtensionHitbox } from '../src/entities/WeaponProj';
import { WhipProj } from '../src/entities/WhipProj';
import { TILE } from '../src/core/constants';
import { newWiresRadialState } from '../src/stats/wiresRadial';
import type { GameHooks } from '../src/entities/types';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');
const srcGame = () => readFileSync(join(ROOT, 'src/core/Game.ts'), 'utf8');
const srcWeapon = () => readFileSync(join(ROOT, 'src/entities/WeaponProj.ts'), 'utf8');

const iid = (vid: number): number => {
  const k = vanillaItemKey(vid);
  const found = k ? ITEM_BY_KEY[k] : undefined;
  if (found === undefined) throw new Error(`vid ${vid} 未注册`);
  return found;
};

/** 真实 Game 桩（blue-r2 casterGame 同构）：手持指定 vid,可注词缀,attackSpeedMult
 *  用实例属性覆盖（getter 影子,批1 面不测聚合、批3 另测真 getter） */
function swordGame(heldVid: number, asMult: number, prefix = 0) {
  const g = Object.create(Game.prototype) as unknown as Record<string, unknown>;
  const player = new Player(50 * TILE, 90 * TILE, new Inventory());
  Object.defineProperty(player, 'attackSpeedMult', { get: () => asMult });
  player.inv.add(iid(heldVid), 1);
  const sel = player.inv.slots.findIndex((s) => s && s.id === iid(heldVid));
  player.inv.selected = Math.max(0, sel);
  if (prefix) {
    const slot = player.inv.slots[Math.max(0, sel)];
    if (slot) slot.prefix = prefix;
  }
  g.player = player;
  g.world = new World(120, 120, 30, 'open');
  g.entities = { critters: [], npcs: [], enemies: [], projectiles: [], add: () => {} };
  g.input = { mouseDown: true, mouseHeld: true, mouseX: 700, mouseY: 300, rightDown: false, uiBlocking: false, downAction: () => false };
  g.camera = { tileUnder: () => [60, 60], screenToWorld: () => [800, 0] };
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
  g.sfx = { playWavFile: () => true, playFiles: () => true, play: () => {} };
  g.playSfxFile = () => {};
  return { g: g as unknown as Game & Record<string, unknown>, player };
}

const swingOf = (g: Game & Record<string, unknown>) =>
  (g as unknown as { swing: { t: number; dur: number } | null }).swing;

// ============ 批1：近战挥击时长面（方向+词缀+截断） ============
describe('批1 剑支挥击时长（铜阔剑 3508 useAnimation=21/useTime=20）', () => {
  it('裸攻速中性：dur=21、useTime=20（回归零漂移）', () => {
    const { g, player } = swordGame(3508, 1);
    (g as unknown as { updateUse: (dt: number) => void }).updateUse(1 / 60);
    expect(swingOf(g)?.dur).toBe(21);
    expect(player.useTime).toBe(20);
  });

  it('+12% 攻速（M=1/1.12）：dur=trunc(21×0.893)=18【原版】,旧式 ÷=24 方向反', () => {
    const { g, player } = swordGame(3508, 1 / 1.12);
    (g as unknown as { updateUse: (dt: number) => void }).updateUse(1 / 60);
    expect(swingOf(g)?.dur).toBe(18);   // (int)(21×(1/1.12))=(int)18.75=18;round 会给 19
    expect(player.useTime).toBe(20);    // itemTime 裸烘定值不乘 meleeSpeed（:4401-4404）
  });

  it('Weak（M=1/0.949）：dur=trunc(21×1.0537)=22 变慢,旧式 20 反向变快', () => {
    const { g } = swordGame(3508, 1 / 0.949);
    (g as unknown as { updateUse: (dt: number) => void }).updateUse(1 / 60);
    expect(swingOf(g)?.dur).toBe(22);
  });

  it('词缀 Quick 17（spd=0.85）：anim=trunc(18×1)=18、reuse=roundCSf32(20×0.85)=17——词缀速度消费', () => {
    expect(prefixStat(17).spd).toBeCloseTo(0.85, 6);
    const { g, player } = swordGame(3508, 1, 17);
    (g as unknown as { updateUse: (dt: number) => void }).updateUse(1 / 60);
    expect(swingOf(g)?.dur).toBe(18);   // 烘定 round(21×0.85)=18
    expect(player.useTime).toBe(17);    // roundCSf32Mul(20,0.85) f32 银行家=17
  });

  it('词缀+攻速复合（Quick,M=1/1.12）：anim=trunc(18×0.893)=16（烘定序：先词缀后攻速）', () => {
    const { g } = swordGame(3508, 1 / 1.12, 17);
    (g as unknown as { updateUse: (dt: number) => void }).updateUse(1 / 60);
    expect(swingOf(g)?.dur).toBe(16);   // trunc(18×0.8929)=trunc(16.07)=16
  });
});

// ============ 批2：近战弹速/参数面（÷M ×A 修正） ============
describe('批2 meleeThrowSpeed（:47466 speed /= meleeSpeed,M=倒数档）', () => {
  it('+70% 攻速（M=1/1.7）：10 → 10/(1/1.7)=17 变快,旧式 ×M=5.88 方向反', () => {
    expect(meleeThrowSpeed(10, 1 / 1.7)).toBeCloseTo(17, 6);
  });
  it('无攻速中性：10 → 10', () => {
    expect(meleeThrowSpeed(10, 1)).toBe(10);
  });
  it('减速档（M=1/0.8）：10 → 8 变慢（双向）', () => {
    expect(meleeThrowSpeed(10, 1 / 0.8)).toBeCloseTo(8, 6);
  });
  it('桩面 M=0 → 1 兜底', () => {
    expect(meleeThrowSpeed(10, 0)).toBe(10);
  });

  it('SpearProj 出生帧弹速 ÷M：spd 40 × M=1/1.25 → 50;spdMul=1/am=1.25（延伸盒 ×A）', () => {
    const world = new World(200, 120, 30, 'open');
    const player = new Player(50 * TILE, 90 * TILE, new Inventory());
    Object.defineProperty(player, 'attackSpeedMult', { get: () => 1 / 1.25 });
    const hooks = { world, player, cutTile: () => {}, enemies: () => [], critters: () => [], npcs: () => [] } as unknown as GameHooks;
    const sp = new SpearProj(1, 0, 5, 22, 61, 6.4, 105);
    (sp as unknown as { spd: number }).spd = 40;
    sp.fixedUpdate(1, hooks);
    expect((sp as unknown as { spd: number }).spd).toBeCloseTo(50, 4);
    expect((sp as unknown as { spdMul: number }).spdMul).toBeCloseTo(1.25, 6);
  });

  it('矛延伸盒：spdMul=1.25（=攻速和 A）→ len ×1.25（:47066 num4 ×= 1/meleeSpeed）', () => {
    const box = spearExtensionHitbox(105, 16, 24, 0, 0, 1, 0, 1.25)!;
    expect(box.x + box.w / 2).toBeCloseTo(10 + 50 * 1.25, 6);
  });

  it('结构锚：悠悠球 vms 直取 attackSpeedMult（M）;回程 asm=1/attackSpeedMult（=A）', () => {
    const ws = srcWeapon();
    expect(ws).toContain('const vms = p.attackSpeedMult || 1;');
    expect(ws).toContain('const asm = 1 / (game.player.attackSpeedMult || 1);');
    const gs = srcGame();
    expect(gs).toContain('const ms = this.player.attackSpeedMult > 0 ? this.player.attackSpeedMult : 1;');
  });
});

// ============ 批3：聚合面（加法堆叠 + per-item 缩放 + 排除表） ============
describe('批3 attackSpeedMult getter（真 Player）', () => {
  const withEquip = (p: Player, meleeSpeed: number) => {
    const base = { ...(p as unknown as { equipStats: Record<string, number> }).equipStats };
    base.meleeSpeed = meleeSpeed;
    Object.defineProperty(p, 'equipStats', { value: base, configurable: true });
  };

  it('加法堆叠：装备 +0.12 + Tipsy +0.1 → A=1.22,M=1/1.22（旧式乘法 1/1.232）', () => {
    const p = new Player(30 * TILE, 40 * TILE, new Inventory());
    withEquip(p, 0.12);
    p.buffs.active.set(BuffType.Tipsy, 60);
    expect(p.attackSpeedMult).toBeCloseTo(1 / 1.22, 10);
  });

  it('per-item 缩放：Terra Blade 757 ×0.75——装备 +0.12 → A=1.09（:26110-26112）', () => {
    const p = new Player(30 * TILE, 40 * TILE, new Inventory());
    withEquip(p, 0.12);
    p.inv.add(iid(757), 1);
    p.inv.selected = p.inv.slots.findIndex((s) => s && s.id === iid(757));
    expect(p.attackSpeedMult).toBeCloseTo(1 / 1.09, 10);
  });

  it('排除表：3821 恒 1（NoMeleeSpeedBonus,ItemID.cs:62）', () => {
    const p = new Player(30 * TILE, 40 * TILE, new Inventory());
    withEquip(p, 0.4);
    p.inv.add(iid(3821), 1);
    p.inv.selected = p.inv.slots.findIndex((s) => s && s.id === iid(3821));
    expect(p.attackSpeedMult).toBe(1);
  });

  it('封顶 3：装备 +5 → M=1/3', () => {
    const p = new Player(30 * TILE, 40 * TILE, new Inventory());
    withEquip(p, 5);
    expect(p.attackSpeedMult).toBeCloseTo(1 / 3, 10);
  });

  it('表值钉面：BONUS_MELEE_SPEED_MULTIPLIER 与 ItemID.cs:1168 逐值全等', () => {
    expect(BONUS_MELEE_SPEED_MULTIPLIER).toEqual({ 1827: 0.5, 3013: 0.25, 3106: 0.33, 757: 0.75 });
    expect(NO_MELEE_SPEED_BONUS.has(3821)).toBe(true);
    expect(itemCombat(3013)?.useTime).toBe(8);   // Fetid Baghnakhs 快武器族存在性
  });
});

// ============ 批4：鞭链（BJ638 已落 + BJ640 词缀烘定并入） ============
describe('批4 鞭词缀速度烘定（Item.Prefix :567 先烘定后攻速）', () => {
  const OW = (o: Record<string, unknown> | null) => (() => o) as unknown as () => Player | null;

  it('prefixSpd=1 桩面零漂移：30 → 30（BJ638 基线）', () => {
    const w = new WhipProj(0, 0, 0, 914, 4913, 10, 1.5, 30, 4,
      OW({ attackSpeedMult: 1, whipBuffs: {}, equipStats: {} }));
    expect(w.anim).toBe(30);
  });

  it('词缀 42（spd=0.9,Item.cs:1022 case 42 单 spd 面）：floor(roundCSf32(30×0.9)×1)=27——旧式恒 30', () => {
    expect(prefixStat(42).spd).toBeCloseTo(0.9, 6);
    const w = new WhipProj(0, 0, 0, 914, 4913, 10, 1.5, 30, 4,
      OW({ attackSpeedMult: 1, whipBuffs: {}, equipStats: {} }), undefined, 0.9);
    expect(w.anim).toBe(27);   // 30×0.9=27.0 f32 银行家=27
  });

  it('词缀+攻速复合（42,M=1/1.7）：floor(27×(1/1.7))=15（烘定序）', () => {
    const w = new WhipProj(0, 0, 0, 914, 4913, 10, 1.5, 30, 4,
      OW({ attackSpeedMult: 1 / 1.7, whipBuffs: {}, equipStats: {} }), undefined, 0.9);
    expect(w.anim).toBe(15);   // trunc(26.999...)=26? → f32(27×0.588)=15.88 → 15
  });
});

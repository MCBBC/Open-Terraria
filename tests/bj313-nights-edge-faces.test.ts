// BJ313 永夜刃 273 四层判别面（用户实报「没发光、没粒子、没弹幕」复核定谳）。
// 反编译金标（Terarria1457,1458 数值面零变更）：
//   · Item.cs:4579-4595 SetDefaults(273)：shoot=972/shootSpeed=5/noMelee/autoReuse/
//     melee/damage40/ua25/kb4.5/UseSound=Item1——**SetDefaults 无 light 字段**
//   · Player.cs:49378-49385 ItemCheck_Shoot 273 特支：两发 972——锚弧
//     (direction,0)×ai0=dir×gravDir×ai1=itemAnimationMax + 飞斩(aim)×
//     ai0=dir×gravDir×0.1×ai1=30
//   · Projectile.cs:9300-9313 SetDefaults(972)：aiStyle190/penetrate2/localNPCHitCooldown=-1
//   · Projectile.cs:42734-42999 AI_190_NightsEdge：**972 支无 AddLight**（光感知面
//     =尘27 默认发光+弧体染色;尘14 noLight+noLightEmittance 显式灭光 :42789-42790）
//   · Player.cs:43984-43989 EmitUseVisuals 调用门 `!sItem.noMelee`——273/675 noMelee=true
//     ⇒ :45158-45168 持械挥砍尘块在 1457 = **死码**（仓内不实现 = 1:1,零修刀判据）
//   · Item.cs:9300-9317 SetDefaults(675 真永夜刃)：shoot=973/shootSpeed=14/damage70/ua32
//   · Player.cs:49452-49460 675 特支：972 锚弧(全额伤) + 973 伸长斩(半伤,ai1=32)
//   · ★勘误面：ItemID.cs:2888 Keybrand=671（非真永夜刃——任务书"真夜刃 671"前提
//     不成立）；TrueNightsEdge=675（:2896）。671=锁匙刃：shoot=1074/crit16/noMelee 无
//     （Item.cs:9234-9250）,1074 aiStyle3 回旋刃族（Player.cs:44690 + NPC.KeyBrandStrike
//     :81998-82012 斩杀加成面,仓内 Game.ts R2-07(e) 已接）
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { itemCombat, combatWeapon } from '../src/data/vanillaItemCombat';
import { itemUseSoundWav } from '../src/data/itemUseSound';
import { SwingArc, arcLayerList } from '../src/entities/SwingArc';
import { World } from '../src/world/World';
import type { GameHooks } from '../src/entities/types';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const srcGame = () => readFileSync(join(ROOT, 'src/core/Game.ts'), 'utf8');

const owner = { x: 50 * 16, y: 90 * 16, w: 20, h: 42, cx: 50 * 16 + 10, cy: 90 * 16 + 21, facing: 1, dead: false };
const mkGame = (list: unknown[]) => ({
  world: new World(200, 200, 30, 'open'), player: null as unknown,
  enemies: () => list,
  entities: { nextId: 1, add: () => {} },
  playSfx: () => {}, playSfxFiles: () => {}, playSfxFile: () => {},
  spawnParticles: () => {}, spawnDust: () => null, addDamageNumber: () => {}, spawnDrop: () => null,
  damagePlayer: (): number => 0, critters: () => [], notifyInventoryChanged: () => {},
  onEnemyKilled: () => {}, spawnEnemy: () => {}, cutTile: () => {},
} as unknown as GameHooks);

// ================= 层 c：弹幕（数据面 + 出生链） =================
describe('BJ313 层c 弹幕面：273/675/671 数据 + Game 出生链', () => {
  it('itemCombat(273)：shoot 972 / shootSpeed 5 / noMelee / autoReuse / melee（Item.cs:4579-4595）', () => {
    const c = itemCombat(273);
    expect(c).toBeTruthy();
    expect(c!.shoot).toBe(972);
    expect(c!.shootSpeed).toBe(5);
    expect(c!.noMelee).toBe(true);
    expect(c!.autoReuse).toBe(true);
    expect(c!.melee).toBe(true);
    expect(c!.damage).toBe(40);
    expect(c!.useAnimation).toBe(25);
    expect(c!.useTime).toBe(25);
    expect(c!.knockBack).toBe(4.5);
  });

  it('combatWeapon(273) → kind melee + shoot 972（aiStyle190 挥弧门,曾落 shot 兜底的根因面）', () => {
    const cw = combatWeapon({ key: 'vi_273_NightsEdge', vid: 273 });
    expect(cw).toBeTruthy();
    expect(cw!.kind).toBe('melee');
    expect(cw!.shoot).toBe(972);
  });

  it('itemCombat(675 真永夜刃)：shoot 973 / shootSpeed 14 / damage 70 / ua 32（Item.cs:9300-9317）', () => {
    const c = itemCombat(675);
    expect(c).toBeTruthy();
    expect(c!.shoot).toBe(973);
    expect(c!.shootSpeed).toBe(14);
    expect(c!.damage).toBe(70);
    expect(c!.useAnimation).toBe(32);
    expect(c!.knockBack).toBe(4.75);
    expect(c!.noMelee).toBe(true);
    expect(c!.melee).toBe(true);
  });

  it('★勘误面 671=Keybrand（ItemID.cs:2888）非真永夜刃：shoot 1074/crit 16/无 noMelee', () => {
    expect(itemCombat(671)).toMatchObject({ shoot: 1074, shootSpeed: 15.9, crit: 16, damage: 105, useAnimation: 20, melee: true });
    expect(itemCombat(671)?.noMelee).toBeUndefined();
    // 1074 = aiStyle3 回旋刃族 → kind boomerang（Keybrand 掷刃分流）
    const cw = combatWeapon({ key: 'vi_671_Keybrand', vid: 671 });
    expect(cw?.kind).toBe('boomerang');
    expect(cw?.shoot).toBe(1074);
  });

  it('Game.ts 273 出生链结构锚：972 锚弧 + 972 飞斩（aim 向、ai0=arcAi0×0.1、ai1=30）', () => {
    const src = srcGame();
    expect(src).toContain('case 972: {   // 永夜刃 273');
    expect(src).toContain('mkArc(972, this.swing.dmg ?? cwMelee.damage);');
    // 飞斩：ai0=dir×gravDir×0.1（:49382）、ai1=30（:49383）——变异敏感,勿放宽
    expect(src).toContain('this.swing.dmg ?? cwMelee.damage, arcAi0, 30, scaleT);');
    expect(src).toContain('// ai0=dir×gravDir×0.1（:49382）');
  });

  it('Game.ts 675 出生链结构锚：972 锚弧(全额伤) + 973 伸长斩(半伤, ai1=32)', () => {
    const src = srcGame();
    expect(src).toContain('case 973: {   // 真永夜刃 675');
    expect(src).toContain('(this.swing.dmg ?? cwMelee.damage) / 2, arcAi0, 32, scaleT);');
  });
});

// ================= 层 a：发光（无弹体光=原文本相 + 暗处白芯） =================
describe('BJ313 层a 发光面：972 无 AddLight（:42734-42999 原文无）+ 尘光不对称', () => {
  it('SwingArc 972 运行期 lightRGB=null（曾自造紫光=全家发光偏离,2026-09-19 清偿后锁定）', () => {
    const game = mkGame([]);
    const arc = new SwingArc(owner, 972, 25, 40, 1, 1);
    for (let t = 0; t < 6; t++) arc.fixedUpdate(1, game);
    expect(arc.lightRGB).toBeNull();
  });

  it('对照 984 泰拉刃：AddLight((15,84,125))（:42974 唯一光支）', () => {
    const game = mkGame([]);
    const arc = new SwingArc(owner, 984, 20, 90, 1, 1);
    arc.fixedUpdate(1, game);
    expect(arc.lightRGB).toEqual([15 / 255, 84 / 255, 125 / 255]);
  });

  it('暗处白芯（fv=0）：帧3 白芯 α=0.3×n3×(1−0)——暗中仍可见的原版发光感来源', () => {
    // n3=0.5（半程）×fv=0（全黑）——主染色层全灭,白芯独亮
    const layers = arcLayerList(972, 0.5, 0, 0.5);
    const frame3 = layers.filter((l) => l.frame === 3);
    expect(frame3).toHaveLength(1);
    expect(frame3[0].alpha).toBeCloseTo(0.3 * 0.5 * 1, 6);
    // 主层随 fv 熄灭
    const lit = layers.filter((l) => l.frame === 0);
    for (const l of lit) expect(l.alpha).toBe(0);
  });
});

// ================= 层 b：挥砍尘（弧体 AI 尘 1:1 + 光不对称） =================
describe('BJ313 层b 挥砍尘面：尘14 灭光 / 尘27 发光（:42789-42797 noLight 不对称）', () => {
  it('尘14 noLight+noLightEmittance 双置位；尘27 不置位（默认发光）', () => {
    const game = mkGame([]) as GameHooks & { spawnDust?: (...a: unknown[]) => unknown };
    const made: Array<{ type: number; noLight?: boolean; noLightEmittance?: boolean }> = [];
    (game as { spawnDust?: unknown }).spawnDust = (...a: unknown[]) => {
      const d = { type: a[4] as number } as { type: number; noLight?: boolean; noLightEmittance?: boolean };
      made.push(d);
      return d;
    };
    const arc = new SwingArc(owner, 972, 25, 40, 1, 1);
    for (let t = 0; t < 200 && arc.dead === false; t++) arc.fixedUpdate(1, game);
    const d14 = made.filter((d) => d.type === 14);
    const d27 = made.filter((d) => d.type === 27);
    expect(d14.length).toBeGreaterThan(0);
    expect(d27.length).toBeGreaterThan(0);
    for (const d of d14) { expect(d.noLight).toBe(true); expect(d.noLightEmittance).toBe(true); }
    for (const d of d27) { expect(d.noLight).toBeUndefined(); }   // 尘27=紫焰光感知面
  });

  it('★EmitUseVisuals 死码判据：:43984 调用门 !noMelee ⇒ 273/675 持械尘块本相不触发（仓内无实现=1:1）', () => {
    // 反证:若未来有人"补"该尘块,须同步在门上加 noMelee 例外——先有机制级证据再动刀
    expect(itemCombat(273)?.noMelee).toBe(true);
    expect(itemCombat(675)?.noMelee).toBe(true);
  });
});

// ================= 层 d：音效 =================
describe('BJ313 层d 音效面：273/675 UseSound=Item1（Item.cs:4589/:9312）', () => {
  it('itemUseSoundWav(273/675) = Item_1', () => {
    expect(itemUseSoundWav(273)).toBe('Item_1');
    expect(itemUseSoundWav(675)).toBe('Item_1');
  });
});

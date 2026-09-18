// BJ129 登记债③+④（2026-09-18）：提取器嵌套 if/else 裸 else 支漏入勘正 + 运行时 crit 缺口补面
//
// ③ 病根：tools/extract-projectiles.mjs collectLinesForId 只递归【命中】的 if 支,
//   `(?:else\s+)?if` 正则不吃裸 `else {` 块 → 链尾 else 经尾随 expandTypeSwitchLines
//   (block.slice(cursor)) 无条件并入,lastMatch 取末条 ⇒ else 支值覆盖真值
//   （76/77 宽高吃 else(78) 支 22×24;567/568 同族=SW-FX1 DATA_PATCH 先例）。
//   SetDefaults 裸 else 站点 6 处（提取器头注⑧）,链内 5 处波及 9 id。
//   修复后 json 重产（era guard 双旗通道）,此处钉数据面真值（源码=1457 P.cs 亲读）。
// ④ 运行时 crit：1784/1835/3291 `crit += N`（Item.cs:19787/:20322/:30169）复合赋值
//   extract-itemcombat 不解析 → EXTRACT_PATCH 三件补面（BJ121 14 件缺漏清偿,1782 先例）;
//   1093 帕鲁猫免疫冷却 1456=8→1457=9（P.cs:10207）——json 列（BJ129 重产落表）与
//   MinionProj CONTACT_CD_TABLE（实体行为面）双面同值锁。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { projectileData } from '../src/data/vanillaProjectiles';
import { itemCombat } from '../src/data/vanillaItemCombat';

const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');

describe('BJ129③ 嵌套 if/else 裸 else 支漏入勘正（数据面;1457 P.cs 亲读真值）', () => {
  it('九键勘正：76/77 音符、326/327 GreekFire、400/401 MolotovFire、567 SporeTrap、1107/1108 ObsidianFire', () => {
    // 76=10×22(:1561-1564) / 77=18×24(:1565-1568)——曾吃 else(78) 支 22×24
    expect(projectileData(76)).toMatchObject({ width: 10, height: 22 });
    expect(projectileData(77)).toMatchObject({ width: 18, height: 24 });
    // 326=14×16(:4196-4199) / 327=12×14(:4200-4203)——曾吃 else(328) 支 6×12
    expect(projectileData(326)).toMatchObject({ width: 14, height: 16 });
    expect(projectileData(327)).toMatchObject({ width: 12, height: 14 });
    // 400=14×16(:4815-4818) / 401=12×14(:4819-4822)——曾吃 else(402) 支 6×12
    expect(projectileData(400)).toMatchObject({ width: 14, height: 16 });
    expect(projectileData(401)).toMatchObject({ width: 12, height: 14 });
    // 567=14×14(:6190-6193)——曾吃 else(568) 支 16×16（SW-FX1 实体侧 :84 硬编码已对）
    expect(projectileData(567)).toMatchObject({ width: 14, height: 14 });
    // 1107=14×16(:10319-10322) / 1108=12×14(:10324-10327)——曾吃 else(1109) 支 6×12
    expect(projectileData(1107)).toMatchObject({ width: 14, height: 16 });
    expect(projectileData(1108)).toMatchObject({ width: 12, height: 14 });
  });

  it('else 支本尊五键不变（78/328/402/568/1109 本即真值;修复零波及面）', () => {
    expect(projectileData(78)).toMatchObject({ width: 22, height: 24 });
    expect(projectileData(328)).toMatchObject({ width: 6, height: 12 });
    expect(projectileData(402)).toMatchObject({ width: 6, height: 12 });
    expect(projectileData(568)).toMatchObject({ width: 16, height: 16 });
    expect(projectileData(1109)).toMatchObject({ width: 6, height: 12 });
  });

  it('宽高消费面接线锁：Arrow ctor 读数据面盒径 + MolotovFire 火云出生锚随盒径回正', () => {
    // Arrow.ts:2062-2064——76/77（魔法乐器径）与 400-402 火云实体盒=数据面 w/h
    const arrow = read('../src/entities/Arrow.ts');
    expect(arrow).toContain('if (pd0?.width) this.w = pd0.width;');
    expect(arrow).toContain('if (pd0?.height) this.h = pd0.height;');
    // Game.ts 燃烧瓶支（R9 批四注「接线读 e.w/h 勘正后自动跟随」的接线本体）：
    // 火云 400+rand(3) + placeAtShootSpawn 读实体盒径回正出生锚
    const game = read('../src/core/Game.ts');
    expect(game).toContain('400 + Math.floor(Math.random() * 3)');
    expect(game).toContain('placeAtShootSpawn(fire, fx, fy);');
    // SporeSacProj 实体侧 567/568 硬编码 14/16（:84）与数据面对齐（零行为差存照）
    expect(read('../src/entities/SporeSacProj.ts')).toContain('this.w = type === SPORE_CLOUD_A ? 14 : 16;');
  });
});

describe('BJ129④ 运行时 crit 补面+1093 勘误钉', () => {
  it('三件 crit 接通（crit += N → 字段值;1782 先例同族）', () => {
    expect(itemCombat(1784)?.crit).toBe(6);    // Jack 'O Lantern Launcher（Item.cs:19787）
    expect(itemCombat(1835)?.crit).toBe(10);   // Stake Launcher（Item.cs:20322）
    expect(itemCombat(3291)?.crit).toBe(10);   // Valkyrie Yoyo（Item.cs:30169,外层 3291/3292
                                               // 共享块内 switch(type) 内层 case——双层 case 面）
  });

  it('crit 消费链接线锁：useCombatWeapon critTotal 含 itemCombat().crit + 悠悠球支/远程主路径双消费位', () => {
    const game = read('../src/core/Game.ts');
    // useCombatWeapon（:17003 GetWeaponCrit 链）——3291 经 case 'yoyo' :17583 消费
    expect(game).toContain('const critTotal = 0.04 + (itemCombat(critVid)?.crit ?? 0) / 100');
    expect(game).toContain('yoyo.critChance = critTotal;');
    // 远程主路径（:15651）——1784/1835 弹 312/323 经 useAmmo 通用尾支消费
    expect(game).toContain('(itemCombat(bowVid2)?.crit ?? 0)');
  });

  it('1093 免疫冷却双面同值锁：json 数据面=9（1457 P.cs:10207）+ MinionProj 行为面=9', () => {
    const d = projectileData(1093);
    expect(d?.localNPCHitCooldown).toBe(9);          // 1456=8→1457=9（1458 同 9 已核）
    expect(d?.usesLocalNPCImmunity).toBe(true);
    // 实体行为面（MinionProj CONTACT_CD_TABLE）——随从接触冷却消费位（json 列为数据面存档）
    expect(read('../src/entities/MinionProj.ts')).toContain('1093: 9,');
  });
});

// PvP 系统 1:1 单测：InOpposingTeam 真值表 / damage() pvp 数值门禁 /
// StatusPvP 双表授予 / pvpBuff 白名单 / 死因 player 文案 / 新增 debuff 效果
import { describe, it, expect } from 'vitest';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { BuffState, BuffType } from '../src/stats/Buffs';
import {
  inOpposingTeam, meleeEnchantOf, statusPvPProjectile, statusPvPMelee,
  PVP_BUFF_WHITELIST, TEAM_COLORS,
} from '../src/stats/Pvp';

describe('InOpposingTeam（Player.cs:4287-4299）', () => {
  const P = (hostile: boolean, team: number) => ({ hostile, team });
  it('双方 hostile 且异队 → 敌对（team 0 互视为敌）', () => {
    expect(inOpposingTeam(P(true, 0), P(true, 0))).toBe(true);
    expect(inOpposingTeam(P(true, 1), P(true, 2))).toBe(true);
    expect(inOpposingTeam(P(true, 1), P(true, 0))).toBe(true);
    expect(inOpposingTeam(P(true, 0), P(true, 3))).toBe(true);
  });
  it('任一方非 hostile → 免疫', () => {
    expect(inOpposingTeam(P(false, 0), P(true, 0))).toBe(false);
    expect(inOpposingTeam(P(true, 1), P(false, 1))).toBe(false);
  });
  it('同队（≠0）→ 免疫', () => {
    for (const t of [1, 2, 3, 4, 5]) {
      expect(inOpposingTeam(P(true, t), P(true, t))).toBe(false);
    }
  });
});

describe('Player.damage pvp 语义（Hurt :37769/:38208）', () => {
  const mk = () => new Player(0, 0, new Inventory());
  it('pvp 无敌帧 = 8t（非 pvp 40t 基准的 1/5）', () => {
    const a = mk();
    expect(a.damage(10, -10, 0, true, true)).toBe(true);
    expect(a.iframes).toBe(8);
    const b = mk();
    b.damage(10, -10, 0);
    expect(b.iframes).toBe(40); // PLAYER_IFRAME_TICKS
  });
  it('减伤链与 PvE 相同（经典 def×0.5,下限 1）', () => {
    const p = mk();
    p.baseMaxHp = 100; p.hp = 100;
    // 无装备无 buff：def=0 → reduction = dmg 原值
    expect(p.damage(30, -10, 0, true, true)).toBe(true);
    expect(p.hp).toBe(70);
  });
  it('pvp 击杀置 lastPvpDeath（KillMe :38208-38210）', () => {
    const p = mk();
    p.damage(9999, -10, 0, true, true);
    expect(p.hp).toBeLessThanOrEqual(0);   // hp<=0 交 fixedUpdate 统一死亡结算
    expect(p.lastPvpDeath).toBe(true);
  });
  it('非 pvp 击杀不置标记', () => {
    const p = mk();
    p.damage(9999, -10, 0, true, false);
    expect(p.lastPvpDeath).toBe(false);
  });
});

describe('pvpBuff 白名单（Main.cs:8872-8887,16 成员）', () => {
  it('内容逐项对表', () => {
    expect([...PVP_BUFF_WHITELIST].sort((a, b) => a - b)).toEqual(
      [20, 24, 30, 31, 36, 39, 44, 69, 70, 103, 119, 120, 137, 320, 323, 324]);
  });
});

describe('meleeEnchantOf（浸剂 → 原版 enchant id）', () => {
  it('六种浸剂映射 + 无浸剂 0', () => {
    const b = new BuffState();
    expect(meleeEnchantOf(b)).toBe(0);
    b.apply(BuffType.ImbueVenom, 60); expect(meleeEnchantOf(b)).toBe(1);
    b.active.clear(); b.apply(BuffType.ImbueCursed, 60); expect(meleeEnchantOf(b)).toBe(2);
    b.active.clear(); b.apply(BuffType.ImbueFire, 60); expect(meleeEnchantOf(b)).toBe(3);
    b.active.clear(); b.apply(BuffType.ImbueIchor, 60); expect(meleeEnchantOf(b)).toBe(5);
    b.active.clear(); b.apply(BuffType.ImbueNano, 60); expect(meleeEnchantOf(b)).toBe(6);
    b.active.clear(); b.apply(BuffType.ImbuePoison, 60); expect(meleeEnchantOf(b)).toBe(8);
  });
});

describe('statusPvPProjectile（Projectile.cs:11092-11348）', () => {
  const ctx = { meleeEnchant: 0, frostBurn: false, magmaStone: false };
  it('285 手榴弹类 → Confused 1-3s', () => {
    const b = new BuffState();
    statusPvPProjectile(b, 285, ctx);
    const t = b.active.get(BuffType.Confused) ?? 0;
    expect(t === 1 || t === 3).toBe(true);
  });
  it('301 类弹 → BrokenArmor 10-20s', () => {
    const b = new BuffState();
    statusPvPProjectile(b, 301, ctx);
    expect(b.active.get(BuffType.BrokenArmor)).toBeGreaterThanOrEqual(10);
    expect(b.active.get(BuffType.BrokenArmor)!).toBeLessThanOrEqual(20);
  });
  it('浸剂 melee 通道:enchant 8 → Poisoned 5-9s;ranged 不吃', () => {
    const b = new BuffState();
    statusPvPProjectile(b, 1, { ...ctx, melee: true, meleeEnchant: 8 });
    expect(b.active.get(BuffType.Poisoned)).toBeGreaterThanOrEqual(5);
    const b2 = new BuffState();
    statusPvPProjectile(b2, 1, { ...ctx, ranged: true, meleeEnchant: 8 });
    expect(b2.active.has(BuffType.Poisoned)).toBe(false);
  });
  it('冰霜盔甲 melee||ranged → Frostburn2 1-7s', () => {
    const b = new BuffState();
    statusPvPProjectile(b, 0, { ...ctx, ranged: true, frostBurn: true });
    expect(b.active.get(BuffType.Frostburn2)).toBeGreaterThanOrEqual(1);
  });
  it('熔岩石仅 melee → OnFire 2/4/6s', () => {
    const b = new BuffState();
    statusPvPProjectile(b, 1, { ...ctx, melee: true, magmaStone: true });
    expect([2, 4, 6]).toContain(b.active.get(BuffType.OnFire));
    const b2 = new BuffState();
    statusPvPProjectile(b2, 0, { ...ctx, ranged: true, magmaStone: true });
    expect(b2.active.has(BuffType.OnFire)).toBe(false);
  });
  it('白名单外 buff 不授予（grant 门禁）', () => {
    const b = new BuffState();
    statusPvPProjectile(b, 999999, { ...ctx, melee: true, meleeEnchant: 4 });
    expect(b.active.size).toBe(0);   // enchant 4（金浸剂）原版无分支
  });
});

describe('statusPvPMelee（Player.cs:6251-6349）', () => {
  it('1123 妖刀村正 → Confused 恒 2s', () => {
    const b = new BuffState();
    statusPvPMelee(b, 1123, { meleeEnchant: 0, frostBurn: false, magmaStone: false });
    expect(b.active.get(BuffType.Confused)).toBe(2);
  });
  it('普通武器 + 浸剂 2 → CursedInferno 3-6s', () => {
    const b = new BuffState();
    statusPvPMelee(b, -1, { meleeEnchant: 2, frostBurn: false, magmaStone: false });
    expect(b.active.get(BuffType.CursedInferno)).toBeGreaterThanOrEqual(3);
  });
});

describe('新增 PvP debuff 数值', () => {
  it('DoT 表速率（lifeRegen/2 = HP/s）', () => {
    const b = new BuffState();
    b.apply(BuffType.Venom, 10);
    const heal = b.tick(1);
    expect(heal).toBe(-15);       // :18791 lifeRegen-30
    const b2 = new BuffState();
    b2.apply(BuffType.CursedInferno, 10);
    expect(b2.tick(1)).toBe(-12); // :18850 lifeRegen-24
    const b3 = new BuffState();
    b3.apply(BuffType.OnFire3, 10);
    expect(b3.tick(1)).toBe(-4);  // :18824 lifeRegen-8
  });
  it('Ichor 防御 -15 / BrokenArmor 终值减半', () => {
    const p = new Player(0, 0, new Inventory());
    const base = p.defense;
    p.buffs.apply(BuffType.Ichor, 10);
    expect(p.defense).toBe(base - 15);
    p.buffs.active.clear();
    p.buffs.apply(BuffType.BrokenArmor, 10);
    expect(p.defense).toBe(Math.floor(base / 2));
  });
  it('Confused 在 debuff 集（护士可清）', () => {
    expect(BuffState.DEBUFFS.has(BuffType.Confused)).toBe(true);
    expect(BuffState.DEBUFFS.has(BuffType.BrokenArmor)).toBe(true);
    expect(BuffState.DEBUFFS.has(BuffType.Venom)).toBe(true);
  });
});

describe('死因 player 文案（DeathSource.Player）', () => {
  it('格式 "{0}，凶手是{1}的{2}。"', async () => {
    const fs = await import('node:fs');
    const pack = JSON.parse(fs.readFileSync('public/l10n/zh-Hans.json', 'utf8'));
    const { languageManager } = await import('../src/i18n/LanguageManager');
    languageManager.loadPackJson(pack);
    const { createDeathText } = await import('../src/i18n/RandomText');
    const t = createDeathText('测试员', { kind: 'player', name: '凶手甲', weapon: '铜剑' }, '世界');
    expect(t).toContain('凶手甲');
    expect(t).toContain('铜剑');
    expect(t).not.toMatch(/\{\d\}/);
  });
});

describe('队伍色（Main.cs:6610-6615）', () => {
  it('六色对表', () => {
    expect(TEAM_COLORS[1]).toEqual([218, 59, 59]);
    expect(TEAM_COLORS[4]).toEqual([255, 199, 0]);
    expect(TEAM_COLORS.length).toBe(6);
  });
});

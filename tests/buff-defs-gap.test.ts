// BUFF_DEFS 58 缺口轻项批（2026-08-22 全道具审计 docs/audit/item-audit-2026-08-22.md）：
// 46 件宠物/光宠/召唤物伴生/星云增益/事件标记 buff 补条目。原版也仅在 Draw/标记层
// 消费（UpdateBuffs 无属性 case）→ 条目即终点。本测试锁定：
// ① vanillaBuff 映射正确（抽查 6 件 + 46 件全清单对审计）
// ② BUFF_BY_VANILLA 反查（Game.ts:135 vi_ 桥同构 = 导出的 buffTypeByVanilla）非 undefined
// ③ 枚举值 200+ 避让既有 0-123 段、全枚举无重复
// ④ descKey 走原版 BuffDescription.<Internal>（zh-Hans/en-US 语料在键非空）+ fallbackName 非空
// ⑤ Buff_N.png 图标在盘（UI.ts 直链即可显示，无 onerror 兜底）
// ⑥ apply/到期生命周期 + BUFF_NO_SAVE 存档过滤语义不受影响
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BuffState, BuffType, BUFF_DEFS, buffTypeByVanilla } from '../src/stats/Buffs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** 审计"58 缺口"轻项 46 件全清单（重 12 件另批：40/41/42/125/126/127/139/140/322/325/376/385/386） */
const GAP_LIGHT_IDS: ReadonlyArray<number> = [
  19, 27, 45, 49, 50, 51, 52, 53, 54, 55, 56, 57, 61, 64, 65, 66,
  81, 82, 83, 84, 85, 91, 92, 133, 134, 135, 136, 152, 154, 155, 161,
  173, 176, 179, 182, 188, 190, 200, 201, 213, 214, 216, 263, 271, 335, 355,
];

/** 反查得全批 BuffType（case 3 未过时此处即断言失败，后续 case 依赖） */
const GAP_TYPES = GAP_LIGHT_IDS.map((v) => {
  const t = buffTypeByVanilla(v);
  expect(t, `vanilla buff ${v} 应已映射 BuffType`).toBeDefined();
  return t!;
});

describe('BUFF_DEFS 58 缺口轻项批（46 件）', () => {
  it('抽查 6 件 vanillaBuff 映射正确（宠物/光宠/召唤物/星云/月总光宠/DeadCells 各族各一）', () => {
    expect(BUFF_DEFS[BuffType.ShadowOrb].vanillaBuff).toBe(19);          // ←115 暗影珠（光宠）
    expect(BUFF_DEFS[BuffType.Wisp].vanillaBuff).toBe(57);               // ←1183 僵尸手指（光宠）
    expect(BUFF_DEFS[BuffType.SpiderMinion].vanillaBuff).toBe(133);      // ←2551 蜘蛛法杖（召唤物）
    expect(BUFF_DEFS[BuffType.NebulaUpLife1].vanillaBuff).toBe(173);     // ←3454 星云塔（增益标记）
    expect(BUFF_DEFS[BuffType.SuspiciousTentacle].vanillaBuff).toBe(190); // ←3577 月总掉落（光宠）
    expect(BUFF_DEFS[BuffType.DeadCellsMushroomBoiMinion].vanillaBuff).toBe(355); // ←5456（召唤物）
  });

  it('46 件全清单与审计一致：新条目 vanillaBuff 集合 = 审计轻项清单、无多无漏', () => {
    const mapped = new Set(GAP_TYPES.map((t) => BUFF_DEFS[t].vanillaBuff));
    expect(mapped.size).toBe(GAP_LIGHT_IDS.length);          // 无重码
    for (const v of GAP_LIGHT_IDS) expect(mapped.has(v)).toBe(true);
    // 全 DEFS 中 vanillaBuff 总数 = 旧 122 + 新 46 + 冰障 62（2026-08-22 配饰审计
    //  冰冻护盾族 1253/3997 IceBarrier buff——BuffType.IceBarrier=246）+ 火把祝福 376
    //  （2026-08-22 补 C 审计：火把神药水 5573 施加链——TorchGodPotion=247）+
    //  红仙灵 101/绿仙灵 102（2026-08-22 补 C ⚠️425 批：仙灵铃三选一 27/101/102
    //  全档可施加——FairyRed=248/FairyGreen=249），且无重复映射
    const all = Object.keys(BUFF_DEFS).map(Number).map((t) => BUFF_DEFS[t as BuffType].vanillaBuff);
    expect(new Set(all).size).toBe(all.length);
    // 下限锁（并行审计批持续扩表——随从杖伴生 buff 等后续批只增不减）：
    // 122+46+冰障+火把祝福+红/绿仙灵(⚠️425 批)=172 起步
    expect(all.length).toBeGreaterThanOrEqual(122 + 46 + 1 + 1 + 2);
  });

  it('BUFF_BY_VANILLA 反查非 undefined 且往返一致（Game.ts:135 桥 = BUFF_DEFS 同构反查）', () => {
    for (let i = 0; i < GAP_LIGHT_IDS.length; i++) {
      const v = GAP_LIGHT_IDS[i];
      const t = buffTypeByVanilla(v);
      expect(t).not.toBeUndefined();                          // 反查不落空 → 物品使用不再静默丢 buff
      expect(BUFF_DEFS[t!].vanillaBuff).toBe(v);              // 往返一致
      expect(GAP_TYPES[i]).toBe(t);
    }
  });

  it('枚举值避让：新成员全部落在 200-245（冰障 246 为后续配饰批），全枚举零重复', () => {
    for (const t of GAP_TYPES) {
      expect(t).toBeGreaterThanOrEqual(200);
      expect(t).toBeLessThanOrEqual(245);
    }
    const values = Object.keys(BUFF_DEFS).map(Number);
    expect(new Set(values).size).toBe(values.length);         // 枚举值唯一（Record 键无碰撞）
    // 下限锁：FairyGreen=249（⚠️425 三选一批）起——并行批（随从杖伴生等）只增不减
    expect(Math.max(...values)).toBeGreaterThanOrEqual(249);
  });

  it('descKey 走原版 BuffDescription.<Internal>：zh-Hans/en-US 语料在键非空；fallbackName 非空', () => {
    const zh = JSON.parse(readFileSync(join(ROOT, 'public/l10n/zh-Hans.json'), 'utf8'));
    const en = JSON.parse(readFileSync(join(ROOT, 'public/l10n/en-US.json'), 'utf8'));
    for (const t of GAP_TYPES) {
      const d = BUFF_DEFS[t];
      expect(d.descKey.startsWith('BuffDescription.')).toBe(true);   // 原版键（同 Honey/Chilled 先例）
      expect((zh.BuffDescription?.[d.descKey.slice('BuffDescription.'.length)] ?? '').length).toBeGreaterThan(0);
      expect((en.BuffDescription?.[d.descKey.slice('BuffDescription.'.length)] ?? '').length).toBeGreaterThan(0);
      expect(d.fallbackName.length).toBeGreaterThan(0);
    }
  });

  it('图标 Buff_N.png 全部在盘（UI.ts 直链 /sprites/vanilla/Buff_N.png 即可显示）', () => {
    for (const t of GAP_TYPES) {
      const png = join(ROOT, 'public/sprites/vanilla', `Buff_${BUFF_DEFS[t].vanillaBuff}.png`);
      expect(existsSync(png), `缺图标 ${png}`).toBe(true);
    }
  });

  it('生命周期与存档语义：apply/到期正常；BUFF_NO_SAVE 名单内（如 133）不落盘、名单外（如 19）落盘', () => {
    const b = new BuffState();
    b.apply(BuffType.ShadowOrb, 60);
    expect(b.has(BuffType.ShadowOrb)).toBe(true);
    b.tick(59.9);
    expect(b.has(BuffType.ShadowOrb)).toBe(true);             // max 合并语义不受新批影响
    b.tick(0.2);
    expect(b.has(BuffType.ShadowOrb)).toBe(false);            // 到期自动移除
    // 轻项批无任何属性聚合（原版同款仅标记层）：moveSpeed/defense 不受 ShadowOrb/SpiderMinion 影响
    const b2 = new BuffState();
    const ms0 = b2.moveSpeedMult, df0 = b2.defenseBonus;
    b2.apply(BuffType.ShadowOrb, 60);
    b2.apply(BuffType.SpiderMinion, 60);
    expect(b2.moveSpeedMult).toBe(ms0);
    expect(b2.defenseBonus).toBe(df0);
    // 存档过滤：133/173/355 在 Main.buffNoSave 名单（vanilla-atlas 侧无关,Buffs.ts BUFF_NO_SAVE）
    b2.apply(BuffType.NebulaUpLife1, 60);
    b2.apply(BuffType.DeadCellsMushroomBoiMinion, 60);
    const saved = b2.toSave().map(([v]) => v);
    expect(saved).not.toContain(133);
    expect(saved).not.toContain(173);
    expect(saved).not.toContain(355);
    expect(saved).toContain(19);                              // 19 不在名单 → 正常落盘
  });
});

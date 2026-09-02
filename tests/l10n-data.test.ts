// 构建产物校验:跑过 scripts/build-l10n.mjs 后执行。
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const L10N_DIR = join(here, '..', 'public', 'l10n');
const CULTURES = ['en-US', 'de-DE', 'it-IT', 'fr-FR', 'es-ES', 'ru-RU', 'zh-Hans', 'pt-BR', 'pl-PL', 'ja-JP', 'ko-KR', 'zh-Hant'];

describe('l10n 构建产物', () => {
  const index = existsSync(join(L10N_DIR, 'index.json'))
    ? JSON.parse(readFileSync(join(L10N_DIR, 'index.json'), 'utf8'))
    : [];

  it('12 语言包 + index.json 齐全', () => {
    expect(index.map((c: { name: string }) => c.name).sort()).toEqual([...CULTURES].sort());
    for (const name of CULTURES) {
      expect(existsSync(join(L10N_DIR, `${name}.json`)), name).toBe(true);
    }
  });

  for (const name of CULTURES) {
    it(`${name}: 抽查键非空 + 无 {$}/{? 残留`, () => {
      const raw = readFileSync(join(L10N_DIR, `${name}.json`), 'utf8');
      const d = JSON.parse(raw);
      expect(d.ItemName?.IronPickaxe).toBeTruthy();
      expect(d.LegacyMenu?.['12']).toBeTruthy();
      expect(d.Language?.Chinese).toBeTruthy();
      expect(d.UI?.WorldSizeSmall).toBeTruthy();
      expect(d.Mods?.['SandboxWorld.UI.InvLabel']).toBeTruthy();
      // {$} 可解析引用已构建期展开(未命中引用按原版行为保留,如 NPCName.None)
      expect(raw.includes('{$CommonItemTooltip.')).toBe(false);
      // {? 条件标记已剥离(残留 {0} 位置参数合法)
      expect(raw.includes('{?')).toBe(false);
    });

    // ★M2 l10n 快照重基线（2026-09-02）：1456 快照无 1.4.5 新品段 6147-6195,
    // tooltip/名称落英文兜底——已从 Terarria1457 本地化文件逐语言提取回填
    // tools/l10n/<culture>.Items.json(ItemID.cs:13840-13916 → 49 ids)。
    // 6160 SharpBarb 原版自身无 ItemTooltip(12 语言同缺,见 1457 en-US.Items)——
    // 如实保持缺失,hover 走原版"无说明行"语义,非遗漏。
    it(`${name}: 1.4.5 新品段 6147-6195 名称/说明在位 + 组合 tooltip 已展开`, () => {
      const d = JSON.parse(readFileSync(join(L10N_DIR, `${name}.json`), 'utf8'));
      expect(d.ItemName?.GiantTiki).toBeTruthy();                       // 6147
      expect(d.ItemTooltip?.GiantTiki).toBe(d.CommonItemTooltip?.PlacementStyle); // {$} 引用已展开
      expect(d.ItemName?.SharpBarb).toBeTruthy();                       // 6160
      expect(d.ItemTooltip?.SharpBarb).toBeUndefined();                 // 原版本就无 tooltip
      expect(d.ItemName?.PhoenixQuiver).toBeTruthy();                   // 6181
      expect(d.ItemTooltip?.PhoenixQuiver).not.toContain('{$ItemTooltip.');
      expect(d.ItemName?.OldStyleParkourBook).toBeTruthy();             // 6190
      expect(d.ItemTooltip?.OldStyleParkourBookInactive).toBeTruthy();  // 6195
      expect(d.ItemTooltip?.OldStyleParkourBook).not.toContain('{$');
    });
  }

  it('zh-Hans 抽查中文值;en-US 抽查英文值', () => {
    const zh = JSON.parse(readFileSync(join(L10N_DIR, 'zh-Hans.json'), 'utf8'));
    const en = JSON.parse(readFileSync(join(L10N_DIR, 'en-US.json'), 'utf8'));
    expect(zh.LegacyMenu['12']).toBe('单人模式');
    expect(zh.Mods['SandboxWorld.Toast.NpcArrived']).toContain('{0}');
    expect(en.LegacyMenu['12']).toBe('Single Player');
    // 1.4.5 新品段 6147-6195 真值抽查（对 1457 本地化文件逐字）
    expect(zh.ItemName.OldStyleParkourBook).toBe('旧世界跑酷指南');
    expect(zh.ItemName.GlacierFang).toBe('冰川之牙');
    expect(en.ItemName.OldStyleParkourBook).toBe('Guide to Old World Parkour');
    expect(en.ItemTooltip.OldStyleParkourBook).toContain("'Because it's there!'");
  });
});

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
      expect(d.Mods?.['SandboxWorld.UI.Inventory']).toBeTruthy();
      // {$} 可解析引用已构建期展开(未命中引用按原版行为保留,如 NPCName.None)
      expect(raw.includes('{$CommonItemTooltip.')).toBe(false);
      // {? 条件标记已剥离(残留 {0} 位置参数合法)
      expect(raw.includes('{?')).toBe(false);
    });
  }

  it('zh-Hans 抽查中文值;en-US 抽查英文值', () => {
    const zh = JSON.parse(readFileSync(join(L10N_DIR, 'zh-Hans.json'), 'utf8'));
    const en = JSON.parse(readFileSync(join(L10N_DIR, 'en-US.json'), 'utf8'));
    expect(zh.LegacyMenu['12']).toBe('单人模式');
    expect(zh.Mods['SandboxWorld.UI.Dropped']).toContain('{0}');
    expect(en.LegacyMenu['12']).toBe('Single Player');
  });
});

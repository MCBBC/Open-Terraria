// l10n 键完整性回归锁：src 全部 Lang.text/has 字面键必须在 zh-Hans 合并包命中。
// （构建期同检查在 vite.config.ts 的 l10n-audit-auto 插件——build 缺键即失败。）
import { describe, it, expect } from 'vitest';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
// @ts-expect-error -- .mjs 无类型声明
import { auditL10n, resolvePackKey } from '../tools/l10n-audit.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('l10n 键完整性（vite build 同源检查）', () => {
  it('src 全部 Lang.text/has 字面键在 zh-Hans 包命中', () => {
    const { used, missing } = auditL10n(join(ROOT, 'src'), join(ROOT, 'public', 'l10n', 'zh-Hans.json'));
    expect(used).toBeGreaterThan(150); // 基数护栏（防提取器失效静默归零）
    expect(missing).toEqual([]);
  });

  it('resolvePackKey 语义：嵌套段/扁平整段键/缺失（与 LanguageManager 同源）', async () => {
    const zh = (await import(join(ROOT, 'public/l10n/zh-Hans.json'), { with: { type: 'json' } })).default as Record<string, unknown>;
    expect(resolvePackKey(zh, 'UI.Play')).toBeTypeOf('string');
    expect(resolvePackKey(zh, 'Mods.SandboxWorld.Toast.NeedItem')).toBeTypeOf('string'); // 扁平整段键（★拍板#3A：NPC.Rescued 键随自创浮字摘除而退役）
    expect(resolvePackKey(zh, 'Mods.SandboxWorld.NPC.__nope__')).toBeUndefined();
  });
});

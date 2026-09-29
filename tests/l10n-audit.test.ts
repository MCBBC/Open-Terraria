// l10n 键完整性回归锁：src 全部 Lang.text/has 字面键必须在 zh-Hans 合并包命中。
// （构建期同检查在 vite.config.ts 的 l10n-audit-auto 插件——build 缺键即失败。）
//
// ★清偿刀 O（2026-09-29，J-2 结构性扩闸）：在 zh 单语言闸之上新增——
//  ① 全 12 语言 used→present 正向闸（对 public/l10n 产物解析 = 运行时同源，
//    LanguageManager.ts:3-7 单文件单请求；en 兜底由 build-l10n.mjs:71-74/:87 的
//    enBase overlay 在构建期完成）；
//  ② en 兜底 leg 合法形态：语言包缺键但 en 产物包可解析 = 合法计数（enFallback）；
//    连 en 都没有 = 红（gateKeys 纯函数单测锁两腿判定）；
//  ③ viaEnBase 计数：产物命中但该语言自有源解析不出 = 实际显示 en overlay 值；
//    zh-Hans 恒 0（缺省语言全覆盖纪律硬闸）；
//  ④ zh-Hans 裸键占位哨兵（J-1）：custom 值 = 键名回显（value===键尾段/整键）
//    白名单外一律红；白名单失效条目（补译后未摘）同样红（自净闸）。
import { describe, it, expect } from 'vitest';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
// @ts-expect-error -- .mjs 无类型声明
import { auditL10n, auditL10nAll, gateKeys, resolvePackKey, ownSourcePack, zhBarePlaceholderAudit, CULTURES } from '../tools/l10n-audit.mjs';

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

describe('l10n 全 12 语言闸（清偿刀 O J-2 收敛形态）', () => {
  const ALL = auditL10nAll(join(ROOT, 'src'));

  it('used→present 正向闸：全 12 语言零缺失（连 en 兜底都没有才红）', () => {
    expect(ALL.cultures).toEqual(CULTURES);
    expect(ALL.cultures).toHaveLength(12);
    expect(ALL.used).toBeGreaterThan(150);
    expect(ALL.shape).toEqual([]); // 12 语言产物形状闸（validateTable 全零）
    expect(ALL.redTotal).toBe(0);
    for (const cult of ALL.cultures) {
      const l = ALL.langs[cult];
      // 分区不变量：hit + enFallback + red === used（三腿恰一分类，防漏判）
      expect(l.hit + l.enFallback.length + l.red.length, cult).toBe(ALL.used);
      expect(l.red, `${cult} 缺键（en 兜底也无）`).toEqual([]);
    }
  });

  it('enBase overlay 计数：zh-Hans 恒 0（缺省语言全覆盖纪律），各语言 ≤ used/2（加载器腐化护栏）', () => {
    expect(ALL.langs['zh-Hans'].viaEnBase).toEqual([]);
    for (const cult of ALL.cultures) {
      expect(ALL.langs[cult].viaEnBase.length, `${cult} viaEnBase`).toBeLessThanOrEqual(ALL.used / 2);
    }
  });

  it('en 兜底 leg 纯函数：语言包缺但 en 可解析=合法计数；双双缺失=红；非 string 值不算命中', () => {
    const used = ['UI.Play', 'Mods.SandboxWorld.ZhOnly', 'Mods.SandboxWorld.Nope', 'Broken.Shape'];
    const pack = {
      UI: { Play: '玩' },
      Mods: { 'SandboxWorld.ZhOnly': '仅中文自有' },
      Broken: { Shape: { '': '假类别对象值' } }, // NeedTempleKey 形态：非 string 不算命中
    };
    const enPack = { UI: { Play: 'Play' } };
    const g = gateKeys(used, pack, enPack);
    expect(g.hit).toEqual(['UI.Play', 'Mods.SandboxWorld.ZhOnly']);
    expect(g.enFallback).toEqual([]); // Broken.Shape 在 en 也缺 → 红（腿②不豁免非 string 假类别）
    expect(g.red).toEqual(['Mods.SandboxWorld.Nope', 'Broken.Shape']);

    const g2 = gateKeys(['UI.Play'], {}, enPack); // 语言包整缺 → en 兜底合法
    expect(g2.enFallback).toEqual(['UI.Play']);
    expect(g2.red).toEqual([]);
  });

  it('own-source 加载器活性：每语言自有源可解析 vanilla 探锚键（分片缺文件须 throw 非静默）', () => {
    for (const cult of CULTURES) {
      const own = ownSourcePack(cult);
      expect(resolvePackKey(own, 'UI.Play'), cult).toBeTypeOf('string');
      expect(resolvePackKey(own, 'Mods.SandboxWorld.Toast.NeedItem'), cult).toBeTypeOf('string');
    }
  });
});

describe('zh-Hans 裸键占位哨兵（清偿刀 O J-1）', () => {
  it('custom zh 零裸键占位（裁定白名单外）+ 白名单自恰（补译后须摘条目）', () => {
    const { flagged, violations, stale } = zhBarePlaceholderAudit();
    expect(violations).toEqual([]);
    expect(stale).toEqual([]); // 白名单条目失效（已补译）→ 红，逼同步摘除
    expect(flagged.length).toBeGreaterThan(0); // 白名单非空自证（防检测器空转）
  });

  it('J-1 六键 + S刀五键中文定谳值钉死（回退占位即红）', async () => {
    const zh = (await import(join(ROOT, 'public/l10n/zh-Hans.json'), { with: { type: 'json' } })).default as Record<string, Record<string, string>>;
    const m = zh.Mods;
    expect(m['SandboxWorld.Settings.TouchBtnAlpha']).toBe('触摸按钮透明度');
    expect(m['SandboxWorld.Settings.TouchBtnSize']).toBe('触摸按钮大小');
    expect(m['SandboxWorld.Settings.TouchJoystickFloat']).toBe('浮动摇杆');
    expect(m['SandboxWorld.Settings.TouchLongPress']).toBe('长按时长');
    expect(m['SandboxWorld.Settings.TouchScDefault']).toBe('智能光标触屏默认');
    expect(m['SandboxWorld.Settings.HudScaleMode']).toBe('HUD 缩放档');
    // 清偿刀 S（2026-09-29）五键补译（原 zh 裸键占位,O 债 #1;Farewell 三键为
    // src/mainFlow.ts:1806-1812 退出告别幕布活键）
    expect(m['SandboxWorld.Settings.HudScaleFactor']).toBe('HUD 缩放');
    expect(m['SandboxWorld.Settings.CatTouch']).toBe('触控');
    expect(m['SandboxWorld.Farewell.Hint']).toBe('世界仍保存在本地。');
    expect(m['SandboxWorld.Farewell.Reload']).toBe('重新载入');
    expect(m['SandboxWorld.Farewell.Title']).toBe('下次再见');
  });
});

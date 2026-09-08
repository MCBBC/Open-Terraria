// ★IIIII221 l10n 占位符替换层——永久回归（2026-09-08）。
// 用户实报：世界生成屏提示条裸显「按{InputTrigger_SmartCursor}可切换光标模式。」
// 根因 = raw 类目路径（randomFromCategory）直返 pack 原文,漏 LocalizedText.Value
// 的 {Token} 全局替换半边。
// 原版定谳锚（Terarria1458）：
//   VariableText.cs:29     —— {Token}/{?Cond}/{?!Cond} 正则（数字 {0} 不入）
//   LocalizedText.cs:17-27 —— Value getter = TryFormat(Lang.GetGlobalSubstitution)
//   Lang.cs:100-167        —— RegisterGlobalSubstitution 全表（NPC 名/动态值/InputTrigger_*）
//   PlayerInput.cs:1958-2006 —— GenerateInputTag_ForCurrentGamemode：键盘 =
//       GenerateRawInputList（LocalizeKey 仅译 Mouse1/Mouse2,其余键名原样,'/' 连接,
//       无美化——vanilla zh-Hans 键盘显示名即绑定表原文）；手柄 = GlyphTagHandler
//   GameTipsDisplay.cs:64  —— GameTip 构造期 _formattedText = _textKey.Value（定格一次）
//   GameTipsProvider.cs:19-51 —— 池 = LoadingTips_Default + (Gamepad?GamePad:Keyboard)
//   WorldGen.cs:25205      —— 墓碑 RandomFromCategory("Epitaph").Value（raw 路径也读 .Value）
//   UIWorldLoad.cs:117-118 —— DrawSelf 直画 Menu tips
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { languageManager, setNpcNameResolver, setGlobalSubstitutionContext } from '../src/i18n/LanguageManager';
import { Lang } from '../src/i18n/Lang';
import { options } from '../src/core/Options';
import { DEFAULT_KEYBINDS, keybindCodeLabel, bindsOf, type KeybindAction } from '../src/core/Keybinds';
import { UIWorldLoadState } from '../src/vui/states/UIWorldLoadState';

const REAL_ZH = () => JSON.parse(readFileSync('public/l10n/zh-Hans.json', 'utf8'));
const tipsOf = (s: UIWorldLoadState) =>
  (s as unknown as { tips: { text: string }[] }).tips;

describe('IIIII221 · substitute helper（LocalizedText.Value 的 {Token} 半边）', () => {
  beforeEach(() => {
    languageManager.resetForTest();
  });

  it('{InputTrigger_SmartCursor} → 活绑表真实显示名（Ctrl/R·Ctrl,缺省双绑）', () => {
    languageManager.loadPackJson({ Controls: { Control: 'Ctrl', Shift: 'Shift' } });
    const out = Lang.substitute('按{InputTrigger_SmartCursor}可切换光标模式。');
    expect(out).toBe('按Ctrl/R·Ctrl可切换光标模式。');   // GenerateRawInputList '/' 连接
  });

  it('鼠标 token → Controls.* 官译（LocalizeKey :1967-1978 Mouse1/Mouse2 门）', () => {
    languageManager.loadPackJson({
      Controls: { RightClick: '右键点击', LeftClick: '左键点击' },
    });
    expect(Lang.substitute('{InputTrigger_ToggleOrOpen} 打开')).toBe('右键点击 打开');
    expect(Lang.substitute('按{InputTrigger_UseOrAttack}攻击')).toBe('按左键点击攻击');
    expect(Lang.substitute('{InputTrigger_InteractWithTileUI}交互')).toBe('右键点击交互');
  });

  it('活绑跟随：重绑 SmartCursor 后即时换显示名（GenerateInputTag 读 KeyStatus 现值同构）', () => {
    languageManager.loadPackJson({ Controls: { Control: 'Ctrl' } });
    expect(Lang.substitute('{InputTrigger_SmartCursor}')).toBe('Ctrl/R·Ctrl');
    const prev = options.data.keybinds;
    options.data.keybinds = { SmartCursor: ['KeyC'] } as Partial<Record<KeybindAction, string[]>>;
    try {
      expect(Lang.substitute('{InputTrigger_SmartCursor}')).toBe('C');
    } finally {
      options.data.keybinds = prev;
    }
  });

  it('空绑定 → 空串（GenerateRawInputList :1996-1998 空表语义,如 LockOn 手柄 trigger）', () => {
    expect(Lang.substitute('[{InputTrigger_LockOn}]')).toBe('[]');
    languageManager.loadPackJson({ UI: { X: '{InputTrigger_RadialHotbar}' } });
    expect(Lang.substitute('{InputTrigger_RadialHotbar}')).toBe('');   // HotbarPlus 缺省无绑
  });

  it('NPC 名/动态值替换;null 生成器保留 token（GetFirstNPCNameOrNull null 语义）', () => {
    languageManager.loadPackJson({ UI: { A: '{Nurse}说:{WorldName}' } });
    expect(Lang.substitute('{Nurse}说:{WorldName}')).toBe('{Nurse}说:{WorldName}');
    setNpcNameResolver((t) => (t === 18 ? '安娜' : null));
    setGlobalSubstitutionContext({
      worldName: () => '泰拉世界', playerName: () => '', inventoryKey: () => '',
      anglerQuests: () => 0, totalDeaths: () => 0, crimson: () => false,
      reversedArmorBonusKey: () => false,
    });
    expect(Lang.substitute('{Nurse}说:{WorldName}')).toBe('安娜说:泰拉世界');
  });

  it('未注册 token 与 {0} 位置位原样保留（VariableText 正则不含数字位）', () => {
    expect(Lang.substitute('造成{PowerUnit}伤害{0}')).toBe('造成{PowerUnit}伤害{0}');
    expect(Lang.substitute('无花括号')).toBe('无花括号');
  });

  it('Lang.cs:146-166 注册表全谱：InputTrigger_* 19 键 + NPC 名 24 键 + 动态值 7 键全注册', () => {
    languageManager.loadPackJson({ Controls: { Control: 'Ctrl', Shift: 'Shift' } });
    const keys = new Set(languageManager.substitutionKeys());
    // InputTrigger_*（Lang.cs:146-165）
    for (const k of [
      'InputTriggerUI_BuildFromInventory', 'InputTriggerUI_Trash', 'InputTriggerUI_FavoriteItem',
      'InputTrigger_QuickEquip', 'InputTrigger_Grapple', 'InputTrigger_LockOn',
      'InputTrigger_RadialQuickbar', 'InputTrigger_RadialHotbar', 'InputTrigger_SmartCursor',
      'InputTrigger_UseOrAttack', 'InputTrigger_Jump', 'InputTrigger_InteractWithTile',
      'InputTrigger_InteractWithTileUI', 'InputTrigger_ToggleOrOpen', 'InputTrigger_SmartSelect',
      'InputTrigger_Mount', 'InputTrigger_Healing', 'InputTrigger_ManaHealing',
      'InputTrigger_QuickBuff',
    ]) expect(keys.has(k), k).toBe(true);
    // NPC 名 24 键（Lang.cs:102-125/:139）
    for (const k of ['Nurse', 'Merchant', 'ArmsDealer', 'Dryad', 'Demolitionist', 'Clothier',
      'Guide', 'Wizard', 'GoblinTinkerer', 'Mechanic', 'Truffle', 'Steampunker', 'DyeTrader',
      'PartyGirl', 'Cyborg', 'Painter', 'WitchDoctor', 'Pirate', 'Stylist', 'TravelingMerchant',
      'Angler', 'Bartender', 'GolfGuy', 'TaxCollector']) expect(keys.has(k), k).toBe(true);
    // 动态值（Lang.cs:124-144/:142/:161）
    for (const k of ['WorldName', 'PlayerName', 'InventoryKey', 'AnglerCompletedQuestsCount',
      'TotalDeathsCount', 'WorldEvilStone', 'ToggleArmorSetBonusKey']) expect(keys.has(k), k).toBe(true);
  });
});

describe('IIIII221 · raw 类目路径出口替换（vanilla 消费方读 .Value 实证）', () => {
  beforeEach(() => {
    languageManager.resetForTest();
  });

  it('randomFromCategory 替换（GameTipsDisplay.GameTip :64 构造期 .Value 同构）', () => {
    languageManager.loadPackJson({
      Controls: { Control: 'Ctrl', Shift: 'Shift' },
      LoadingTips_Keyboard: { '1': '按{InputTrigger_SmartCursor}可切换光标模式。' },
    });
    expect(languageManager.randomFromCategory('LoadingTips_Keyboard', () => 0))
      .toBe('按Ctrl/R·Ctrl可切换光标模式。');
  });

  it('indexedFromCategory 替换（墓碑 WorldGen.cs:25205 .Value 实证;现值面无 token=零扰动）', () => {
    languageManager.loadPackJson({
      Controls: { Shift: 'Shift' },
      Epitaph: { '1': '{InputTrigger_SmartSelect}长眠' },
      LucyTheAxe_Idle: { '1': '普通串' },
    });
    expect(languageManager.indexedFromCategory('Epitaph', 0)).toBe('Shift长眠');
    expect(languageManager.indexedFromCategory('LucyTheAxe_Idle', 0)).toBe('普通串');
  });

  it('randomFromPrefix 替换（SpecialText 族 .Value 同构）', () => {
    languageManager.loadPackJson({
      Controls: { RightClick: '右键点击' },
      FooSpecialText: { Rain1: '{InputTrigger_ToggleOrOpen}开' },
    });
    expect(languageManager.randomFromPrefix('FooSpecialText.Rain')).toBe('右键点击开');
  });

  it('真实 zh-Hans 包全 LoadingTips_Keyboard/Default 池替换后零裸 token', () => {
    languageManager.loadPackJson(REAL_ZH());
    for (const cat of ['LoadingTips_Keyboard', 'LoadingTips_Default']) {
      const n = languageManager.categorySize(cat);
      for (let i = 0; i < n; i++) {
        const v = languageManager.indexedFromCategory(cat, i)!;
        expect(v, `${cat}[${i}]`).not.toMatch(/\{[A-Za-z]/);
      }
    }
  });
});

describe('IIIII221 · 世界生成屏提示条渲染（GameTipsDisplay 接入,用户实报面）', () => {
  beforeAll(() => {
    languageManager.resetForTest();
    languageManager.loadPackJson(REAL_ZH());
  });

  it('提示条滚定文本无裸 {InputTrigger_*}（截图实报「按{InputTrigger_SmartCursor}…」修复）', () => {
    const s = new UIWorldLoadState(0, { seedText: '9293480' });
    for (let i = 0; i < 30; i++) s.update();          // updateTips 至少滚定一条
    const tips = tipsOf(s);
    expect(tips.length).toBeGreaterThanOrEqual(1);
    for (const t of tips) expect(t.text).not.toMatch(/\{[A-Za-z]/);
  });

  it('SmartCursor 键位词条替换后含真实键位名（Ctrl/R·Ctrl,来自缺省活绑表）', () => {
    const expectLabel = bindsOf('SmartCursor').map(keybindCodeLabel).join('/');
    expect(expectLabel).toBe('Ctrl/R·Ctrl');           // 缺省 ControlLeft+ControlRight
    // 池内该词条（zh-Hans LoadingTips_Keyboard.1）经 randomFromCategory 出口必含键位名
    const raw = JSON.parse(readFileSync('public/l10n/zh-Hans.json', 'utf8'));
    expect(raw.LoadingTips_Keyboard['1']).toBe('按{InputTrigger_SmartCursor}可切换光标模式。');
    expect(Lang.substitute(raw.LoadingTips_Keyboard['1'])).toBe(`按${expectLabel}可切换光标模式。`);
    expect(DEFAULT_KEYBINDS.SmartCursor.length).toBeGreaterThan(0);
  });
});

describe('IIIII221 · 语言包 token 全谱审计（{Token} 清点 vs 注册表+对象参数白名单）', () => {
  beforeAll(() => {
    languageManager.resetForTest();
    languageManager.loadPackJson({ Controls: { Control: 'Ctrl', Shift: 'Shift' } });
  });

  it('public/l10n 全 12 语言值面 {Token} 均落在 注册表∪消费方对象参数白名单', () => {
    const registered = new Set(languageManager.substitutionKeys());
    // FormatWith(obj) 族（原版不经 GetGlobalSubstitution,由消费方传对象解析——
    // RandomWorldName/TownNPCMood/UI 资源包/BestiaryInfo/AssetRejections/Workshop/
    // CombineFormat）+ 语言包内原版同款笔误键（ja/zh-Hant NurseSpecialText 等,
    // vanilla 注册表同样没有 → 裸显原文,1:1 保留非缺口）
    const objectParamTokens = new Set([
      'Adjective', 'Noun', 'Location',                       // RandomWorldName_Composition
      'Amount', 'Description', 'Numerator', 'Denominator',   // UI 资源包/套装奖励
      'Count', 'Percent',                                    // BestiaryInfo
      'ActualWidth', 'ActualHeight', 'NeededWidth', 'NeededHeight', // AssetRejections
      'FilePath', 'Width', 'Height', 'Reason',               // Workshop
      'ItemName', 'PrefixName',                              // CombineFormat.Prefix
      'BiomeName', 'NPCName',                                // TownNPCMood
      'Armsdealer', 'WorldNmae', 'TotalDeathCount',          // 官方包笔误键
      'cyborg', 'dryad', 'guide', 'nurse', 'partygirl', 'pirate', 'truffle',
    ]);
    const leaked: string[] = [];
    for (const lang of ['zh-Hans', 'en-US', 'de-DE', 'es-ES', 'fr-FR', 'it-IT', 'ja-JP',
      'ko-KR', 'pl-PL', 'pt-BR', 'ru-RU', 'zh-Hant']) {
      const pack = JSON.parse(readFileSync(`public/l10n/${lang}.json`, 'utf8'));
      for (const [cat, entries] of Object.entries(pack)) {
        if (typeof entries !== 'object' || entries === null) continue;
        for (const [k, v] of Object.entries(entries as Record<string, unknown>)) {
          if (typeof v !== 'string') continue;
          for (const m of v.matchAll(/\{([A-Za-z][A-Za-z0-9_.]*)\}/g)) {
            const tok = m[1];
            if (!registered.has(tok) && !objectParamTokens.has(tok)) {
              leaked.push(`${lang}:${cat}.${k}:{${tok}}`);
            }
          }
        }
      }
    }
    expect(leaked).toEqual([]);
  });
});

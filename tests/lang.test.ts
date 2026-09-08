// LanguageManager 核心语义单测(对标 Terarria1456/Terraria.Localization/LanguageManager.cs)。
import { describe, it, expect, beforeEach } from 'vitest';
import { languageManager } from '../src/i18n/LanguageManager';
import { fromLegacyId, fromName, normalizeLang, DEFAULT_LANG, CULTURES } from '../src/i18n/GameCulture';

describe('GameCulture(GameCulture.cs:67-121)', () => {
  it('12 culture 注册,LegacyId 1-12 与枚举一致', () => {
    expect(CULTURES).toHaveLength(12);
    expect(CULTURES.map((c) => c.legacyId)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(CULTURES.find((c) => c.name === 'zh-Hans')!.legacyId).toBe(7);
  });

  it('FromLegacyId:id<1 钳到 1,未知落 en-US(GameCulture.cs:49-54)', () => {
    expect(fromLegacyId(0).name).toBe('en-US');
    expect(fromLegacyId(-3).name).toBe('en-US');
    expect(fromLegacyId(999).name).toBe('en-US');
    expect(fromLegacyId(7).name).toBe('zh-Hans');
  });

  it('FromName 查无返回 null;normalizeLang 未知值落 en-US', () => {
    expect(fromName('zh-Hans')!.displayNameKey).toBe('Language.Chinese');
    expect(fromName('xx-XX')).toBeNull();
    expect(normalizeLang(undefined)).toBe(DEFAULT_LANG);
    expect(normalizeLang('xx-XX')).toBe('en-US');
    expect(normalizeLang(7)).toBe('zh-Hans'); // 旧数字兼容(对齐原版 config.json)
  });
});

describe('LanguageManager', () => {
  beforeEach(() => {
    languageManager.resetForTest();
  });

  it('loadPackJson 顺序加载覆盖:后载覆盖先载(原版 en→target 语义,LanguageManager.cs:102)', () => {
    languageManager.loadPackJson({ UI: { Play: 'Play' } });
    languageManager.loadPackJson({ UI: { Play: '开始游戏', New: '新建' } });
    expect(languageManager.getTextValue('UI.Play')).toBe('开始游戏');
    expect(languageManager.getTextValue('UI.New')).toBe('新建');
  });

  it('缺失键返回 key 本身(LanguageManager.cs:446)', () => {
    languageManager.loadPackJson({ UI: { Play: '开始游戏' } });
    expect(languageManager.getTextValue('UI.NotExist')).toBe('UI.NotExist');
    expect(languageManager.exists('UI.NotExist')).toBe(false);
    expect(languageManager.exists('UI.Play')).toBe(true);
  });

  it('{0}/{1} 位置参数(GetTextValue,LanguageManager.cs:455)', () => {
    languageManager.loadPackJson({ UI: { Greet: '你好 {0},你有 {1} 个苹果' } });
    expect(languageManager.getTextValue('UI.Greet', '小明', 3)).toBe('你好 小明,你有 3 个苹果');
  });

  it('$ 变体键入变体表,不进正文(UpdateTextValue,LanguageManager.cs:303)', () => {
    languageManager.loadPackJson({ ItemName: { Chair: '椅子', 'Chair$Gender': '阴性' } });
    expect(languageManager.exists('ItemName.Chair')).toBe(true);
    expect(languageManager.getTextValue('ItemName.Chair')).toBe('椅子');
    expect(languageManager.tryGetVariation('ItemName.Chair', 'Gender')).toBe('阴性');
    expect(languageManager.tryGetVariation('ItemName.Chair', 'Nope')).toBeNull();
  });

  it('IndexedFromCategory 取模循环(LanguageManager.cs:431)', () => {
    languageManager.loadPackJson({ RandomWorldName_Noun: { '1': '森林', '2': '岛' } });
    expect(languageManager.indexedFromCategory('RandomWorldName_Noun', 0)).toBe('森林');
    expect(languageManager.indexedFromCategory('RandomWorldName_Noun', 2)).toBe('森林');
    expect(languageManager.indexedFromCategory('RandomWorldName_Noun', -1)).toBe('岛');
    expect(languageManager.indexedFromCategory('Empty', 0)).toBeNull();
  });

  it('RandomFromCategory 保类别内随机可命中', () => {
    languageManager.loadPackJson({ LoadingTips_Default: { '0': 'A', '1': 'B', '2': 'C' } });
    const seen = new Set<string>();
    let seed = 0.123;
    const rng = () => (seed = (seed * 9301 + 49297) % 233280 / 233280);
    for (let i = 0; i < 30; i++) seen.add(languageManager.randomFromCategory('LoadingTips_Default', rng)!);
    expect(seen.has('A')).toBe(true);
    expect(languageManager.categorySize('LoadingTips_Default')).toBe(3);
  });

  it('setLanguage:fetch 语言包 + 广播 OnLanguageChanged + 重复切换幂等(LanguageManager.cs:38/92)', async () => {
    const calls: string[] = [];
    const origFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string) => {
      calls.push(url);
      return { ok: true, json: async () => ({ UI: { Play: url.includes('zh-Hans') ? '开始游戏' : 'Play' } }) } as Response;
    }) as typeof fetch;
    try {
      const events: string[] = [];
      const off = languageManager.onChange(() => events.push('changed'));
      await languageManager.setLanguage('zh-Hans');
      expect(languageManager.activeCulture?.name).toBe('zh-Hans');
      expect(languageManager.getTextValue('UI.Play')).toBe('开始游戏');
      expect(events).toEqual(['changed']);
      // 同语言重复切换:早退,不重复 fetch/广播
      events.length = 0;
      await languageManager.setLanguage('zh-Hans');
      expect(events).toEqual([]);
      // 退订后不再收
      off();
      await languageManager.setLanguage('en-US');
      expect(events).toEqual([]);
      expect(languageManager.getTextValue('UI.Play')).toBe('Play');
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it('缺失语言包返回 false 不改变当前状态', async () => {
    languageManager.loadPackJson({ UI: { Play: '开始游戏' } });
    const origFetch = globalThis.fetch;
    globalThis.fetch = (async () => ({ ok: false })) as unknown as typeof fetch;
    try {
      const ok = await languageManager.setLanguage('en-US');
      expect(ok).toBe(false);
      expect(languageManager.getTextValue('UI.Play')).toBe('开始游戏');
    } finally {
      globalThis.fetch = origFetch;
    }
  });
});

describe('全局替换表（Lang.cs:102-110/:146-160 RegisterGlobalSubstitution）', () => {
  beforeEach(() => {
    languageManager.resetForTest();
  });
  it('{InputTrigger_ToggleOrOpen} → Controls.RightClick 本地化键名（蠕虫罐头/礼袋 171 条 tooltip 的裸 token 修复）', () => {
    languageManager.loadPackJson({
      Controls: { RightClick: '右键点击', LeftClick: '左键点击', Control: 'Ctrl', Shift: 'Shift' },
      ItemTooltip: { CanOfWorms: '{InputTrigger_ToggleOrOpen} to open打开' },
    });
    const out = languageManager.getTextValue('ItemTooltip.CanOfWorms');
    expect(out).toBe('右键点击 to open打开');       // "to open打开"是 1.4.5.6 官中数据终态
    expect(out).not.toContain('{');
  });

  it('其余键位 token：UseOrAttack→左键点击 / SmartCursor→Ctrl / Grapple→E / 未绑(LockOn)→空串', () => {
    languageManager.loadPackJson({
      Controls: { RightClick: '右键点击', LeftClick: '左键点击', Control: 'Ctrl', Shift: 'Shift' },
      UI: {
        A: '按住{InputTrigger_UseOrAttack}攻击',
        B: '{InputTrigger_SmartCursor}切换光标',
        C: '{InputTrigger_Grapple}抛出钩爪',
        D: '[{InputTrigger_LockOn}]锁定',
      },
    });
    expect(languageManager.getTextValue('UI.A')).toBe('按住左键点击攻击');
    // ★IIIII221：期望值随 SW-BN2 缺省表对齐更新——SmartCursor 缺省 =
    // ControlLeft+ControlRight 双绑（Keybinds.ts DEFAULT_KEYBINDS）,活绑表显示名
    // '/' 连接（GenerateRawInputList :1994-2005 同形）= 'Ctrl/R·Ctrl'
    expect(languageManager.getTextValue('UI.B')).toBe('Ctrl/R·Ctrl切换光标');
    expect(languageManager.getTextValue('UI.C')).toBe('E抛出钩爪');
    expect(languageManager.getTextValue('UI.D')).toBe('[]锁定');
  });

  it('{Nurse} NPC 名：resolver 命中→随机名；未注入/无该 NPC→保留 token（null 语义）', async () => {
    const { setNpcNameResolver } = await import('../src/i18n/LanguageManager');
    languageManager.loadPackJson({ UI: { NurseHere: '{Nurse}已到达！' } });
    expect(languageManager.getTextValue('UI.NurseHere')).toBe('{Nurse}已到达！');
    setNpcNameResolver((t) => (t === 18 ? '安娜' : null));
    expect(languageManager.getTextValue('UI.NurseHere')).toBe('安娜已到达！');
    setNpcNameResolver(() => null);
    expect(languageManager.getTextValue('UI.NurseHere')).toBe('{Nurse}已到达！');
  });

  it('{0} 位置参数与未注册 token 不受影响', () => {
    languageManager.loadPackJson({
      CommonItemTooltip: { RestoresLife: '恢复{0}生命' },
      UI: { Weird: '造成{PowerUnit}点伤害' },
    });
    expect(languageManager.getTextValue('CommonItemTooltip.RestoresLife', 20)).toBe('恢复20生命');
    expect(languageManager.getTextValue('UI.Weird')).toBe('造成{PowerUnit}点伤害');
  });
});

describe('全局替换表补全批（61 注册全量,2026-08-18）', () => {
  beforeEach(() => {
    languageManager.resetForTest();
  });
  it('23 NPC 名全覆盖:{Mechanic}/{Bartender}/{TaxCollector} 等经 resolver', async () => {
    const { setNpcNameResolver } = await import('../src/i18n/LanguageManager');
    languageManager.loadPackJson({ LegacyDialog: { X: '找{Mechanic}和{Bartender}和{TaxCollector}' } });
    setNpcNameResolver((t) => ({ 124: '米卡', 550: '麦斯威尔', 441: '税务官' }[t] ?? null));
    expect(languageManager.getTextValue('LegacyDialog.X')).toBe('找米卡和麦斯威尔和税务官');
  });

  it('动态值:WorldName/PlayerName/计数器/WorldEvilStone/ToggleArmorSetBonusKey', async () => {
    const { setGlobalSubstitutionContext } = await import('../src/i18n/LanguageManager');
    languageManager.loadPackJson({
      Misc: { Ebonstone: '黑檀石', Crimstone: '猩红石' },
      Key: { DOWN: '向下键', UP: '向上键' },
      UI: {
        W: '欢迎来到{WorldName},{PlayerName}!',
        Q: '已完成{AnglerCompletedQuestsCount}次渔夫任务',
        D: '死亡{TotalDeathsCount}次',
        E: '挖{WorldEvilStone}',
        K: '按{ToggleArmorSetBonusKey}切换套装奖励',
      },
    });
    setGlobalSubstitutionContext({
      worldName: () => '泰拉世界', playerName: () => '史蒂夫', inventoryKey: () => 'Escape',
      anglerQuests: () => 42, totalDeaths: () => 7, crimson: () => false,
      reversedArmorBonusKey: () => false,
    });
    expect(languageManager.getTextValue('UI.W')).toBe('欢迎来到泰拉世界,史蒂夫!');
    expect(languageManager.getTextValue('UI.Q')).toBe('已完成42次渔夫任务');
    expect(languageManager.getTextValue('UI.D')).toBe('死亡7次');
    expect(languageManager.getTextValue('UI.E')).toBe('挖黑檀石');
    expect(languageManager.getTextValue('UI.K')).toBe('按向下键切换套装奖励');
  });

  it('注入器缺位保留 token（null 语义,与 NPC 名一致）', async () => {
    const { setGlobalSubstitutionContext } = await import('../src/i18n/LanguageManager');
    languageManager.loadPackJson({ UI: { W: '世界:{WorldName}' } });
    expect(languageManager.getTextValue('UI.W')).toBe('世界:{WorldName}');
  });
});

describe('旗帜 tooltip NPC 名注入（{$NPCName.None} → 裸键名后由 UI 层换名）', () => {
  it('bannerNpcOfItem:旗帜物品 → NPC id（共享旗取家族最小 id;非旗帜 -1）', async () => {
    const { bannerNpcOfItem, bannerItemId } = await import('../src/world/Banners');
    // 蓝邪教徒战士旗:banner 216 → item 3667 → npc 402 族最小
    const item = bannerItemId(216);
    expect(item).toBeGreaterThan(0);
    expect(bannerNpcOfItem(item)).toBeGreaterThan(0);
    expect(bannerNpcOfItem(1)).toBe(-1);   // 非旗帜物品
  });
});

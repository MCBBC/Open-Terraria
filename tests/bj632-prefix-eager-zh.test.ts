// ★BJ632 件1（2026-10-10）：「渴望」前缀译名定谳锁——用户实报「渴望·刃杖」对照
//  wiki 中文表「热切」疑本仓误译。定谳：**官方 zh-Hans 就是「渴望」**（
//  Terarria1457/Terraria.Localization.Content.zh-Hans.Items.json `Prefix.Eager`
//  亲读），wiki「热切」=中文 wiki 社区译名与官方文本的出入（以反编译为准,销案）。
//  本刀 = 数据面闸：本仓 l10n 产物（public/l10n/zh-Hans.json + zh-Hant.json）
//  与反编译官方文本全 97 前缀逐字节对拍——任何手改/重跑洗键立即爆红。
//  同族顺查（召唤系新前缀组 84-97）已含在全量对拍内，另显式钉值锁一批判别例。
//  ★判别力：built.Prefix.Eager 改成 wiki 的「热切」→ ①红；names 常量映射错位 → ③红。
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
// ★C档可移植:仓库外依赖(game/ 兄弟目录,clone 侧缺=正常形态)——缺则本文件 skip,本机在=真跑零语义变化
const EXT_MISSING = !['Terarria1457'].every((d) => existsSync(new URL(`../../${d}`, import.meta.url)));


const GAME = join(__dirname, '..');
// ★C档可移植:缺档降级(EXT_MISSING skip 兜底;describe 体收集期亦执行)
const OFFICIAL_ZH = existsSync(join(GAME, '..', 'Terarria1457', 'Terraria.Localization.Content.zh-Hans.Items.json'))
  ? JSON.parse(readFileSync(join(GAME, '..', 'Terarria1457', 'Terraria.Localization.Content.zh-Hans.Items.json'), 'utf8')) as { Prefix: Record<string, string> }
  : { Prefix: {} };
const OFFICIAL_ZH_HANT = existsSync(join(GAME, '..', 'Terarria1457', 'Terraria.Localization.Content.zh-Hant.Items.json'))
  ? JSON.parse(readFileSync(join(GAME, '..', 'Terarria1457', 'Terraria.Localization.Content.zh-Hant.Items.json'), 'utf8')) as { Prefix: Record<string, string> }
  : { Prefix: {} };

const BUILT_ZH = JSON.parse(readFileSync(join(GAME, 'public', 'l10n', 'zh-Hans.json'), 'utf8')) as {
  Prefix: Record<string, string>;
};
const BUILT_ZH_HANT = JSON.parse(readFileSync(join(GAME, 'public', 'l10n', 'zh-Hant.json'), 'utf8')) as {
  Prefix: Record<string, string>;
};

const VANILLA_PREFIX = JSON.parse(readFileSync(join(GAME, 'src', 'data', 'vanilla-prefix.json'), 'utf8')) as {
  names: Record<string, string>;
  stats: Record<string, { arpen?: number; dmg?: number; tagdmg?: number }>;
};

// PrefixID.cs 亲读（Terarria1457/Terraria.ID/PrefixID.cs:178-204）：召唤系新前缀组
const SUMMON_GROUP: Array<[number, string]> = [
  [84, 'Legendary2'], [85, 'Fabled'], [86, 'Loyal'], [87, 'Worthy'], [88, 'Focused'],
  [89, 'Patient'], [90, 'Rabid'], [91, 'IllTempered'], [92, 'Petty'], [93, 'Feeble'],
  [94, 'Skittish'], [95, 'Eager'], [96, 'Ballistic'], [97, 'Scraggling'],
];

describe.skipIf(EXT_MISSING)('BJ632-①:官方 zh-Hans 全 97 前缀逐字节对拍（Eager=渴望 定谳销案）', () => {
  it('built.Prefix 与反编译官方 zh-Hans.Items.json 全键全等（wiki「热切」≠官方「渴望」）', () => {
    const official = OFFICIAL_ZH.Prefix;
    expect(Object.keys(BUILT_ZH.Prefix).length).toBe(Object.keys(official).length);
    for (const [k, v] of Object.entries(official)) {
      expect(BUILT_ZH.Prefix[k], `Prefix.${k}`).toBe(v);
    }
  });

  it('定谳判别例：官方 Prefix.Eager =「渴望」（非 wiki 的「热切」）', () => {
    expect(OFFICIAL_ZH.Prefix.Eager).toBe('渴望');
    expect(BUILT_ZH.Prefix.Eager).toBe('渴望');
  });

  it('zh-Hant 同构全等（官方 Eager=熱情——两官方中文面均非 wiki 表用词）', () => {
    expect(OFFICIAL_ZH_HANT.Prefix.Eager).toBe('熱情');
    for (const [k, v] of Object.entries(OFFICIAL_ZH_HANT.Prefix)) {
      expect(BUILT_ZH_HANT.Prefix[k], `Prefix.${k} (zh-Hant)`).toBe(v);
    }
  });
});

describe.skipIf(EXT_MISSING)('BJ632-②:召唤系新前缀组 84-97 逐型钉值（同族顺查收编）', () => {
  it('常量名映射（vanilla-prefix.json names 键=PrefixID.cs 亲读值）', () => {
    for (const [id, name] of SUMMON_GROUP) {
      expect(VANILLA_PREFIX.names[String(id)], `names[${id}]`).toBe(name);
    }
  });

  it('官方译名逐型（含 Eager=渴望/Ballistic=弹道/Scraggling=散乱）', () => {
    const want: Record<string, string> = {
      Legendary2: '传奇', Fabled: '传说', Loyal: '忠诚', Worthy: '英勇',
      Focused: '专注', Patient: '耐心', Rabid: '狂暴', IllTempered: '暴躁',
      Petty: '吝啬', Feeble: '虚弱', Skittish: '胆小', Eager: '渴望',
      Ballistic: '弹道', Scraggling: '散乱',
    };
    for (const [, name] of SUMMON_GROUP) {
      expect(OFFICIAL_ZH.Prefix[name]).toBe(want[name]);
      expect(BUILT_ZH.Prefix[name], `built.${name}`).toBe(want[name]);
    }
  });

  it('Eager(95) 机制面：甲穿 +25 / 无伤害加成（与用户图 100 形态一致=机制无罪）', () => {
    const s = VANILLA_PREFIX.stats['95'];
    expect(s.arpen).toBe(25);
    expect(s.dmg ?? 1).toBe(1);
    expect(s.tagdmg ?? 0).toBe(0);
  });
});

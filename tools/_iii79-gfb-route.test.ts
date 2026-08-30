// IIII79 批 · 一次性诊断（只读）：GFB(getfixedboi/everything=zenith) 路由语义 JS 侧现状考证。
// 对拍对象：Terarria1458/Terraria.WorldBuilding/WorldSeedOption_Everything.cs + WorldGenerationOptions.cs
//   - SpecialSeedNames={"getfixedboi"}（GetOptionFromSeedText 文本路,归一化 [^a-z0-9]→''）
//   - ServerConfigName="zenith"（TryEnablingFlagFrom 吃 seed_zenith=0|1,经 seed_ 前缀）
//   - Dependencies 七件套：Remix/Drunk/NotTheBees/NoTraps/DontStarve/Anniversary/ForTheWorthy
// 运行：cd game && npx vitest run tools/_iii79-gfb-route.test.ts （纯函数,零 server 需求）
import { it } from 'vitest';
import { parseSeed, parseSeedChain } from '../src/world/gen/SeedEasterEggs';
import { translateSeed } from '../src/core/rng';

const KEYS = ['everything', 'remix', 'drunkWorld', 'notTheBees', 'noTraps',
  'theConstant', 'tenthAnniversary', 'getGoodWorld'];

it('文本路由：getfixedboi 展开 = everything+七依赖（Everything.Dependencies 全件）', () => {
  const { flags, specialName } = parseSeed('getfixedboi');
  console.log('[route] getfixedboi flags =', flags);
  const missing = KEYS.filter((k) => !(flags as Record<string, boolean>)[k]);
  if (missing.length > 0) throw new Error(`七依赖展开缺位: ${missing.join(',')}`);
  const extra = Object.keys(flags).filter((k) => !KEYS.includes(k));
  if (extra.length > 0) throw new Error(`多置旗标(不该有): ${extra.join(',')}`);
  if (specialName !== 'get fixed boi') throw new Error(`specialName=${specialName}`);
});

it('归一化鲁棒性：空格/大小写/标点变体同命中（vanilla 正则剥离等价）', () => {
  for (const s of ['GET FIXED BOI', 'get fixed boi', 'Get-Fixed-Boi!', 'getfixedboi']) {
    const { flags } = parseSeed(s);
    if (!flags.everything) throw new Error(`未命中: "${s}"`);
  }
});

it('数字路由不受染：seed=9293480 不应命中任何特殊种子（确定性 Route B 前提）', () => {
  const { flags } = parseSeed('9293480');
  const hit = Object.keys(flags);
  if (hit.length > 0) throw new Error(`纯数字被误判为特殊种子: ${hit.join(',')}`);
  // 同理不得撞 SpecialSeedValues{5162020,5162021,5162011}
  for (const s of ['05162020', '5162021', '05162011']) {
    if (Object.keys(parseSeed(s).flags).length === 0) throw new Error(`vanilla 数字路失效: ${s}`);
  }
});

it('parseSeedChain 多段串：getfixedboi 段照常全量展开', () => {
  const { flags, hitTexts } = parseSeedChain('getfixedboi');
  if (hitTexts.length !== 1 || !flags.everything) throw new Error(`chain 解析异常 ${JSON.stringify(hitTexts)}`);
});

it('直注等价集：八字段注入 == Route B 终态旗标面（vanilla zenith 级联后）', () => {
  // Route B 终态（serverconfig seed_zenith=1 → AutoGenEnabled 循环 Enabled=true →
  // OnEnabledStateChanged 级联）= zenith+7依赖全真、normal/skyblock=false。
  const injected = Object.fromEntries(KEYS.map((k) => [k, true]));
  const viaText = parseSeedChain('getfixedboi').flags;
  const a = KEYS.every((k) => injected[k] === (viaText as Record<string, boolean>)[k]);
  if (!a) throw new Error('直注八字段与文本路由展开终态不一致');
  // skyblock 必须两边都不置（Everything.Dependencies 不含 Skyblock;
  // onlyShimmerOceanWorlds(Main.cs:2759) 显式排除 zenithWorld）
  if ((viaText as Record<string, boolean>).skyblock) throw new Error('zenith 不该点亮 skyblock');
});

it('RNG 种子等价：Route B 的 translateSeed("9293480")=9293480（abs 数字路,vanilla TranslateSeed 同构）', () => {
  if (translateSeed('9293480') !== 9293480) throw new Error(`translateSeed=${translateSeed('9293480')}`);
});

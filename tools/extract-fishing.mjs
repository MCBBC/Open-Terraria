// 从反编译源码全量提取 1457 钓鱼渔获规则表 → src/data/vanilla-fishing.json
//
// 数据源（权威 = 1.4.5.7 反编译）：
//   ① Terraria.GameContent.FishDropRules/GameContentFishDropPopulator.cs
//      Populate() 注册序 + 各 XxxDrops() 方法体的 Add/AddWithHardmode/AddQuestFish/
//      AddStopper 语句 → FishDropRule 列表（Main.cs:6525-6527 装配进 Main.FishDropsDB，
//      Projectile.FishingCheck_RollItemDrop :19433 是唯一消费方）
//   ② Terraria.GameContent.FishDropRules/AFishDropRulePopulator.cs
//      protected AFishingCondition 字段定义（条件语义 + 行号）
//   ③ Terraria/Main.cs
//      anglerQuestItemNetIDs（:1845-1852，41 条任务鱼）+ AnglerQuestSwap 每日
//      选取拒绝表（:3799-3947）
//
// ★ 先说清一件事：任务描述里的"原版 400+ 条"指的是 1.4.0 时代已删除的 FishingRules
//   类（1456 反编译全树 grep 无 FishingRules/HookStats/GetFishingCatch）。1.4.5.6 的
//   权威实现 = FishDropRule 列表，全量就是本脚本提取出的条数（见 _meta.ruleCount），
//   不允许为了凑数注水——本脚本对源文件做结构断言，行数/条数漂移即抛错。
//
// ★BJ298 2026-09-23 era guard 落闸（四要素习语 docs/era-guard-family.md,BJ284 banners
//   同构;BJ261 续批排期②【洗库险·B 形】清偿——原缺省无 env 无旗直写现库）：
//   ① SW_ITEM_VER 白名单 {1457,1458}（读域 GameContentFishDropPopulator.cs 1457↔1458
//     逐字节全等 f7391368 + AFishDropRulePopulator.cs 三版全等 2525c321 + Main.cs
//     anglerQuestItemNetIDs(:1864)/AnglerQuestSwap(:3851) 两域 1457↔1458 同位同文
//     （BJ298 diff 亲核——Main.cs 整文件两版有差但读域零漂移,line 域 src 字段稳定）;
//     1456 退役显式拒+指引）;缺省 1457（拍板#7A）;
//   ② 输出通道三分离：缺省=干跑对拍零写盘（双向路径级 diff——live-only=洗库预警/
//     fresh-only=现库退化缺键型,任一非空 exit 1+物证;★_meta.sources 动态基线路径串按
//     BJ284 处方豁免对拍）/ SW_OUT=<dir>=沙箱 / --write-real=写真库（diff 非纯增量拒,
//     强推须 --force-full --overwrite-append-era 双旗）;SW_OUT 与 --write-real 双旗互斥;
//     非 1457 禁写真库;探测注入面 SW_FISHING_JSON 与 --write-real 混用拒（g1 footgun）;
//   ③ 锚 fail-loud：结构断言（18 组/锚点抽查/任务鱼 41/拒绝表 14+18）+基数护栏
//     （ruleCount≥230,BJ298 亲数）（原有+新增）;
//   ④ 判别力自证：tests/extract-tables2-era-guard.test.ts（M1 摘干跑门/M3 摘 fresh-only 轴）。
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';

// ★BJ183 2026-09-20 基准对齐 1456→1457（FishDropRules 两版源级 diff=0;Main.cs
// anglerQuestItemNetIDs/AnglerQuestSwap 仅有行号平移,语义零漂移——对拍已证）
const ROOT0 = process.env.SW_PROJECT_ROOT ?? new URL('../../', import.meta.url).pathname.replace(/\/+$/, '');   // ★C档可移植
// ---- ★BJ298 era guard ①②：版本白名单 + 输出通道开关（对拍在文末落盘段） ----
const VER = process.env.SW_ITEM_VER ?? '1457';
const VER_ALLOWED = new Set(['1457', '1458']);
if (!VER_ALLOWED.has(VER) || !existsSync(`${ROOT0}/Terarria${VER}/Terraria/Main.cs`)) {
  console.error(`[extract-fishing] 拒绝运行：SW_ITEM_VER="${VER}" 非法（白名单 ${[...VER_ALLOWED].join('/')}，且需存在 Terarria${VER}/ 反编译目录）。`);
  if (VER === '1456') console.error('  1456 锚集已退役（BJ183 基准对齐 1457,BJ298 落闸）；1456 回拍读时代快照。');
  process.exit(1);
}
const WRITE_REAL = process.argv.includes('--write-real');
const FORCE_FULL = process.argv.includes('--force-full');
const OVERWRITE_APPEND_ERA = process.argv.includes('--overwrite-append-era');
const SW_OUT = process.env.SW_OUT;
if (SW_OUT !== undefined && SW_OUT !== '' && WRITE_REAL) {
  console.error('[extract-fishing] 拒绝运行：SW_OUT 与 --write-real 双旗互斥（输出通道必须唯一）。');
  process.exit(1);
}
if (WRITE_REAL && VER !== '1457') {
  console.error(`[extract-fishing] 拒绝写真库：SW_ITEM_VER=${VER}≠1457（旧基线重放禁写 vanilla-fishing.json）。`);
  process.exit(1);
}
if (WRITE_REAL && process.env.SW_FISHING_JSON !== undefined) {
  console.error('[extract-fishing] 拒绝运行：探测注入面（SW_FISHING_JSON）已设置而 --write-real 将写真实现库（fail-closed）。');
  process.exit(1);
}
const LIVE_JSON = process.env.SW_FISHING_JSON ?? `${ROOT0}/game/src/data/vanilla-fishing.json`;
const OUT_JSON = WRITE_REAL
  ? LIVE_JSON
  : (SW_OUT ? `${SW_OUT.replace(/\/+$/, '')}/vanilla-fishing.json` : null);
const ROOT = `${ROOT0}/Terarria${VER}`;
const POP = `${ROOT}/Terraria.GameContent.FishDropRules/GameContentFishDropPopulator.cs`;
const BASE = `${ROOT}/Terraria.GameContent.FishDropRules/AFishDropRulePopulator.cs`;
const MAIN = `${ROOT}/Terraria/Main.cs`;

const popSrc = readFileSync(POP, 'utf8');
const baseSrc = readFileSync(BASE, 'utf8');
const mainSrc = readFileSync(MAIN, 'utf8');

// 源内偏移 → 行号
function lineOf(src, idx) { let n = 1; for (let i = 0; i < idx; i++) if (src[i] === '\n') n++; return n; }
function fail(msg) { throw new Error(`extract-fishing: ${msg}`); }

// ---- ① 条件定义表（AFishDropRulePopulator.cs protected 字段）-----------------
// 每条含归一化谓词 t（运行时求值键）+ 表达式原文 + 行号。
// 谓词域（运行时 vanillaFishing.ts 逐一实现）：
//   inLava/inHoney/junk/crate/anyEnemies/canFishInLava — FishingAttempt 直读字段
//   dungeon/beach/hallow/glowshroom/trueDesert/trueSnow — 玩家 zone（dungeon 含 downedBoss3 门）
//   remix — Main.remixWorld（本仓无 remix 世界，恒 false）
//   height{cmp,v} — fisher.heightLevel 比较
//   underRockLayer — fisher.Y >= Main.rockLayer
//   rolled{Corruption,Crimson,Jungle,Snow,Desert} / rolledHallowDesert / remixOcean
//     — PrepareFishingContext 掷出的 rolled 旗（Projectile.cs:19451-19502）
//   ocean — RolledRemixOcean || IsOriginalOcean（heightLevel<=1 + 横向边缘 380 + 水量>1000）
//   water1000 — fisher.waterTilesCount > 1000
//   bloodMoon / didNotUseCombatBook / hardMode{v} / questFish{item} / questFishRemix{item}
const COND_T = {
  HardMode: { t: 'hardMode', v: true }, EarlyMode: { t: 'hardMode', v: false },
  InLava: { t: 'inLava' }, InHoney: { t: 'inHoney' }, Junk: { t: 'junk' }, Crate: { t: 'crate' },
  AnyEnemies: { t: 'anyEnemies' }, CanFishInLava: { t: 'canFishInLava' },
  Dungeon: { t: 'dungeon' }, Beach: { t: 'beach' }, Hallow: { t: 'hallow' },
  GlowingMushrooms: { t: 'glowshroom' }, TrueDesert: { t: 'trueDesert' }, TrueSnow: { t: 'trueSnow' },
  Remix: { t: 'remix' },
  Height1: { t: 'height', cmp: '==', v: 1 }, Height1And2: { t: 'height', cmp: 'in', v: [1, 2] },
  HeightAbove1: { t: 'height', cmp: '>', v: 1 }, HeightAboveAnd1: { t: 'height', cmp: '>=', v: 1 },
  HeightUnder2: { t: 'height', cmp: '<', v: 2 }, HeightAbove2: { t: 'height', cmp: '>', v: 2 },
  Height0: { t: 'height', cmp: '==', v: 0 }, Height2: { t: 'height', cmp: '==', v: 2 },
  Height3: { t: 'height', cmp: '==', v: 3 },
  UnderRockLayer: { t: 'underRockLayer' },
  Corruption: { t: 'rolledCorruption' }, Crimson: { t: 'rolledCrimson' },
  Jungle: { t: 'rolledJungle' }, Snow: { t: 'rolledSnow' }, Desert: { t: 'rolledDesert' },
  RolledHallowDesert: { t: 'rolledHallowDesert' },
  OriginalOcean: { t: 'originalOcean' },   // :149 IsOriginalOcean（未被 Populate 引用，Ocean 内联同式）
  RemixOcean: { t: 'rolledRemixOcean' },   // :151（未被 Populate 引用）
  Ocean: { t: 'ocean' }, Water1000: { t: 'water1000' },
  BloodMoon: { t: 'bloodMoon' }, DidNotUseCombatBook: { t: 'didNotUseCombatBook' },
};
const conditions = {};
{
  const re = /protected AFishingCondition (\w+) = new DelegateFishingCondition\(\(FishingContext context\) => ([^;]+?)\);/g;
  let m;
  while ((m = re.exec(baseSrc))) {
    const name = m[1];
    if (!COND_T[name]) fail(`未映射的条件字段 ${name}（AFishDropRulePopulator.cs:${lineOf(baseSrc, m.index)}）`);
    conditions[name] = { ...COND_T[name], expr: m[2], src: `AFishDropRulePopulator.cs:${lineOf(baseSrc, m.index)}` };
  }
  const missing = Object.keys(COND_T).filter((k) => !conditions[k]);
  if (missing.length) fail(`条件字段缺失/改名: ${missing.join(',')}`);
}
// IsOriginalOcean / IsHardmode 私有助手（行号记档）
const HELPERS = {
  IsOriginalOcean: 'AFishDropRulePopulator.cs:257-264',
  IsHardmode: 'AFishDropRulePopulator.cs:252-255',
};

// ---- ② 语句级解析 GameContentFishDropPopulator.cs ----------------------------
function methodBody(src, sig) {
  const start = src.indexOf(sig);
  if (start < 0) fail(`找不到方法 ${sig}`);
  let i = src.indexOf('{', start), depth = 1; i++;
  while (depth > 0 && i < src.length) {
    if (src[i] === '{') depth++; else if (src[i] === '}') depth--;
    i++;
  }
  return { text: src.slice(start, i), start };
}
// 顶层（单层缩进）语句逐条切出：本文件每条语句独占一行，无多行语句
function statements(body) {
  const out = [];
  const lines = body.text.split('\n');
  let off = 0;
  for (let i = 0; i < lines.length; i++) {
    const text = lines[i].trim();
    const ln = lineOf(popSrc, body.start + off);
    off += lines[i].length + 1;
    if (!text || text === '{' || text === '}' || text.startsWith('//')
      || text.startsWith('private') || text.startsWith('public')) continue;
    out.push({ l: text, ln });
  }
  return out;
}
// 括号平衡的参数切分
function splitArgs(s) {
  const out = []; let depth = 0, cur = '';
  for (const ch of s) {
    if (ch === '(') { depth++; cur += ch; }
    else if (ch === ')') { depth--; cur += ch; }
    else if (ch === ',' && depth === 0) { out.push(cur.trim()); cur = ''; }
    else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}
const isNum = (t) => /^\d+$/.test(t);
const isGroup = (t) => /^Group\(/.test(t);
function parseGroup(t) {
  const inner = t.slice(t.indexOf('(') + 1, t.lastIndexOf(')'));
  return splitArgs(inner).map(Number);
}

// 条件 token → 归一化条件对象数组（处理别名 / Join / array 别名）
function resolveCondToken(tok, scope) {
  if (/^Join\(/.test(tok)) {
    return splitArgs(tok.slice(tok.indexOf('(') + 1, tok.lastIndexOf(')'))).flatMap((t) => resolveCondToken(t, scope));
  }
  if (scope.arrays[tok]) return scope.arrays[tok].slice();
  if (scope.aliases[tok]) return resolveCondToken(scope.aliases[tok], scope);
  if (conditions[tok]) return [{ ...conditions[tok] }];
  fail(`未知条件 token "${tok}"`);
}
function baseConds(args, scope) {
  const out = [];
  for (const a of args) out.push(...resolveCondToken(a, scope));
  return out;
}

// Populate() 注册序
const populate = methodBody(popSrc, 'public void Populate()');
const order = [];
for (const s of statements(populate)) {
  const m = /^(\w+)\([^()]*\);$/.exec(s.l);
  if (!m) fail(`Populate 出现非调用语句: ${s.l}`);
  if (m[1] === 'AddStopper') order.push({ kind: 'stopperAnyEnemies', ln: s.ln });
  else if (popSrc.includes(`private void ${m[1]}()`)) order.push({ kind: 'group', name: m[1], ln: s.ln });
  else fail(`Populate 调用了未知方法 ${m[1]}`);
}

const rules = [];
const RARITIES = new Set(['Any', 'Legendary', 'VeryRare', 'Rare', 'Uncommon', 'Common',
  'BombRarityOfNotLegendaryAndNotVeryRareAndUncommon', 'UncommonOrCommon']);

function addRule(group, ln, rarity, num, den, items, conds) {
  if (!RARITIES.has(rarity)) fail(`未知稀有档 ${rarity}`);
  if (!(den > 0)) fail(`ChanceDenominator<=0（${group} :${ln}）——FishDropRuleList.Validate 会抛`);
  rules.push({
    group, rarity, num, den, items,
    conditions: conds.map((c) => ({ ...c })),   // t + (v|cmp/item 参数) + src + expr 原文
    stopper: items.length === 0,       // FishDropRule.IsStopper（FishDropRule.cs:15-29）
    src: `GameContentFishDropPopulator.cs:${ln}`,
  });
}

for (const step of order) {
  if (step.kind === 'stopperAnyEnemies') {
    // AddStopper(AnyEnemies)：PossibleItems=[] → Attempt 命中即返回 0（敌怪优先于一切渔获）
    addRule('Populate', step.ln, 'Any', 1, 1, [], [conditions.AnyEnemies]);
    continue;
  }
  const body = methodBody(popSrc, `private void ${step.name}()`);
  const scope = { aliases: {}, arrays: {} };
  for (const s of statements(body)) {
    const ln = s.ln;
    let m;
    if ((m = /^AFishingCondition (\w+) = (\w+);$/.exec(s.l))) { scope.aliases[m[1]] = m[2]; continue; }
    if ((m = /^AFishingCondition\[\] (\w+) = Join\((.*)\);$/.exec(s.l))) {
      scope.arrays[m[1]] = splitArgs(m[2]).flatMap((t) => resolveCondToken(t, scope));
      continue;
    }
    if ((m = /^(\w+) = (\w+);$/.test(s.l) && /^(\w+) = (\w+);$/.exec(s.l)) && scope.aliases[m[1]] !== undefined) {
      scope.aliases[m[1]] = m[2];   // rolledHallowDesert = Hallow; 再绑定
      continue;
    }
    if ((m = /^AddStopper\((\w+)\);$/.exec(s.l))) {
      addRule(step.name, ln, 'Any', 1, 1, [], resolveCondToken(m[1], scope)); continue;
    }
    if ((m = /^AddWithHardmode\((.*)\);$/.exec(s.l))) {
      // AFishDropRulePopulator.cs:212-230：同分母两条——EarlyMode 配 itemTypeEarly / HardMode 配 itemTypeHard
      const a = splitArgs(m[1]);
      if (a.length < 4) fail(`AddWithHardmode 参数不足: ${s.l}`);
      const [, den, early, hard, ...conds] = a;
      addRule(step.name, ln, a[0].replace(/^Rarity\./, ''), 1, Number(den), [Number(early)],
        [...baseConds(conds, scope), conditions.EarlyMode]);
      addRule(step.name, ln, a[0].replace(/^Rarity\./, ''), 1, Number(den), [Number(hard)],
        [...baseConds(conds, scope), conditions.HardMode]);
      continue;
    }
    if ((m = /^AddQuestFishForRemix\((.*)\);$/.exec(s.l))) {
      // AFishDropRulePopulator.cs:203-210 → FishingConditions.QuestFishConditionRemix（FishingConditions.cs:15-27）
      const a = splitArgs(m[1]);
      const [, den, item, ...conds] = a;
      addRule(step.name, ln, a[0].replace(/^Rarity\./, ''), 1, Number(den), [Number(item)],
        [...baseConds(conds, scope), { t: 'questFishRemix', item: Number(item), src: 'FishingConditions.cs:15-27' }]);
      continue;
    }
    if ((m = /^AddQuestFish\((.*)\);$/.exec(s.l))) {
      // AFishDropRulePopulator.cs:194-201 → FishingConditions.QuestFishCondition（FishingConditions.cs:5-13）
      const a = splitArgs(m[1]);
      const [, den, item, ...conds] = a;
      addRule(step.name, ln, a[0].replace(/^Rarity\./, ''), 1, Number(den), [Number(item)],
        [...baseConds(conds, scope), { t: 'questFish', item: Number(item), src: 'FishingConditions.cs:5-13' }]);
      continue;
    }
    if ((m = /^Add\((.*)\);$/.exec(s.l))) {
      // 三重载（AFishDropRulePopulator.cs:166-192）归一成 (num, den, items, conds)：
      // 前导 数字/Group 游程长 3 = (num, den, item)，长 2 = (den, item)
      const a = splitArgs(m[1]);
      const rarity = a[0].replace(/^Rarity\./, '');
      const rest = a.slice(1);
      let k = 0;
      while (k < rest.length && (isNum(rest[k]) || isGroup(rest[k]))) k++;
      if (k < 2) fail(`Add 前导参数不足: ${s.l}`);
      let num = 1, den, items;
      if (k === 3) { num = Number(rest[0]); den = Number(rest[1]); items = isGroup(rest[2]) ? parseGroup(rest[2]) : [Number(rest[2])]; }
      else { den = Number(rest[0]); items = isGroup(rest[1]) ? parseGroup(rest[1]) : [Number(rest[1])]; }
      addRule(step.name, ln, rarity, num, den, items, baseConds(rest.slice(k), scope));
      continue;
    }
    fail(`未识别语句（${step.name} :${ln}）: ${s.l}`);
  }
}

// ---- 结构断言（防源码漂移后静默产出残表）------------------------------------
{
  const groups = [...new Set(rules.map((r) => r.group))];
  const expectGroups = ['Populate', 'LavaDrops', 'HoneyDrops', 'JunkDrops', 'CrateDrops', 'RareDrops',
    'RemixDrops', 'DungeonDrops', 'CorruptionDrops', 'CrimsonDrops', 'HallowedDrops',
    'GlowingMushroomsDrops', 'SnowDrops', 'JungleDrops', 'OceanDrops', 'DesertDrops',
    'FloatingIslandDrops', 'SurfaceDrops'];
  for (const g of expectGroups) if (!groups.includes(g)) fail(`缺少规则组 ${g}`);
  // 关键锚点抽查（源码行号硬编码对账）
  const anchor = (idx, want) => {
    const r = rules[idx];
    if (!r || r.items.join(',') !== want.items.join(',') || r.src !== want.src) {
      fail(`锚点 #${idx} 漂移: 期望 ${JSON.stringify(want)} 实得 ${JSON.stringify(r)}`);
    }
  };
  anchor(0, { items: [], src: 'GameContentFishDropPopulator.cs:12' });                      // AddStopper(AnyEnemies)
  anchor(rules.findIndex((r) => r.group === 'RareDrops'),
    { items: [4382], src: 'GameContentFishDropPopulator.cs:196' });                          // 血月 4382 首条
  const surfLast = [...rules].reverse().find((r) => r.group === 'SurfaceDrops');
  if (surfLast.items.join(',') !== '2290' || surfLast.src !== 'GameContentFishDropPopulator.cs:70') {
    fail(`SurfaceDrops 末条漂移: ${JSON.stringify(surfLast)}`);
  }
  // 任务鱼覆盖：41 条 anglerQuestItemNetIDs 全部有对应 QuestFish 规则
  //（4393/4394 在 Desert/Hallow 双组重复注册 → 按去重物品数对账）
  const questItems = new Set(rules.filter((r) => r.conditions.some((c) => c.t === 'questFish'))
    .flatMap((r) => r.items));
  if (questItems.size !== 41) fail(`QuestFish 覆盖 ${questItems.size} ≠ 41`);
  const remixItems = new Set(rules.filter((r) => r.conditions.some((c) => c.t === 'questFishRemix'))
    .flatMap((r) => r.items));
  if (remixItems.size !== 10) fail(`QuestFishRemix 覆盖 ${remixItems.size} ≠ 10（RemixDrops :32-44）`);
}

// ---- ③ 渔夫任务链数据（Main.cs）---------------------------------------------
const quest = {};
{
  const m = /public static int\[\] anglerQuestItemNetIDs = new int\[41\]\s*\r?\n?\s*\{(.*?)\};/s.exec(mainSrc);
  if (!m) fail('anglerQuestItemNetIDs 解析失败');
  const items = m[1].replace(/[\n\r]/g, '').split(',').map((s) => Number(s.trim())).filter((n) => n > 0);
  if (items.length !== 41) fail(`任务鱼 ${items.length} ≠ 41`);
  quest.items = items;
  quest.itemsSrc = `Main.cs:${lineOf(mainSrc, m.index)}-${lineOf(mainSrc, m.index + m[0].length)}`;
}
// AnglerQuestSwap 拒绝表（Main.cs:3799-3947）：while(flag2) 内逐条 if → flag2=true
{
  const fnStart = mainSrc.indexOf('public static void AnglerQuestSwap()');
  if (fnStart < 0) fail('AnglerQuestSwap 缺失');
  const body = mainSrc.slice(fnStart, mainSrc.indexOf('NetMessage.SendAnglerQuest(-1);', fnStart));
  const ln0 = lineOf(mainSrc, fnStart);
  const gateMap = {
    'num == 2454 && (!hardMode || WorldGen.crimson)': [{ gate: 'hardMode', want: true }, { gate: 'evil', want: 'corrupt' }],
    'num == 2457 && WorldGen.crimson': [{ gate: 'evil', want: 'corrupt' }],
    'num == 2462 && !hardMode': [{ gate: 'hardMode', want: true }],
    'num == 2463 && (!hardMode || !WorldGen.crimson)': [{ gate: 'hardMode', want: true }, { gate: 'evil', want: 'crimson' }],
    'num == 2465 && !hardMode': [{ gate: 'hardMode', want: true }],
    'num == 2468 && !hardMode': [{ gate: 'hardMode', want: true }],
    'num == 2471 && !hardMode': [{ gate: 'hardMode', want: true }],
    'num == 2473 && !hardMode': [{ gate: 'hardMode', want: true }],
    'num == 2477 && !WorldGen.crimson': [{ gate: 'evil', want: 'crimson' }],
    'num == 2480 && !hardMode': [{ gate: 'hardMode', want: true }],
    'num == 2483 && !hardMode': [{ gate: 'hardMode', want: true }],
    'num == 2484 && !hardMode': [{ gate: 'hardMode', want: true }],
    'num == 2485 && WorldGen.crimson': [{ gate: 'evil', want: 'corrupt' }],
    '(num == 2476 || num == 2453 || num == 2473) && !flag': [{ gate: 'anyBoss', want: true }],
  };
  const filters = [];
  const re = /if \(\(?(num == (\d+)(?: \|\| num == (\d+))*)\)? && ([^)]*(?:\([^)]*\))?)\)\r?\n?\s*\{\r?\n?\s*flag2 = true;/g;
  let m;
  while ((m = re.exec(body))) {
    const parenthesized = body[m.index + 4] === '(';   // if ((num == …) && …) 三物品带外括号
    const condText = `${parenthesized ? `(${m[1]})` : m[1]} && ${m[4]}`;
    const gates = gateMap[condText];
    if (!gates) fail(`AnglerQuestSwap 出现未映射拒绝条件 "${condText}"（Main.cs:${ln0 + lineOf(body, m.index) - 1}）`);
    filters.push({
      items: m[1].match(/\d+/g).map(Number),
      gates, src: `Main.cs:${ln0 + lineOf(body, m.index) - 1}`,
    });
  }
  if (filters.length !== 14) fail(`拒绝表 ${filters.length} 条 ≠ 14`);
  quest.filters = filters;
  // !isThereAWorldSurface 嵌套组（Main.cs:3870-3944）：无地表世界（don't dig up 等）整族拒绝
  const ns = /if \(!isThereAWorldSurface\)([\s\S]*?)\n\t\t\t\}/.exec(body);
  if (!ns) fail('!isThereAWorldSurface 组缺失');
  const noSurface = [...ns[1].matchAll(/if \(num == (\d+)\)/g)].map((x) => Number(x[1]));
  if (noSurface.length !== 18) fail(`noSurface 拒绝 ${noSurface.length} 条 ≠ 18`);
  quest.noSurfaceItems = noSurface;
  quest.noSurfaceSrc = `Main.cs:${ln0 + lineOf(body, ns.index) - 1}-${ln0 + lineOf(body, ns.index + ns[0].length) - 1}`;
  quest.swapSrc = `Main.cs:${ln0}`;
}

// ---- 奖励阶梯锚点（Player.GetAnglerReward_MainReward switch，Player.cs:55374-55393）----
const rewardMilestones = [
  { questsDone: 5, item: 2428 }, { questsDone: 10, item: 2367 }, { questsDone: 15, item: 2368 },
  { questsDone: 20, item: 2369 }, { questsDone: 25, item: 3031 }, { questsDone: 30, item: 2294 },
];
{
  const seg = mainSrc; // 占位：阶梯在 Player.cs，运行时模块内逐条行号注释（见 vanillaFishing.ts）
  void seg;
}

const out = {
  _meta: {
    generator: 'tools/extract-fishing.mjs',
    note: [
      '1.4.5.6 权威渔获表 = FishDropRule 列表（GameContentFishDropPopulator.Populate 注册序）。',
      '消费链：Projectile.FishingCheck :19175 → TryBuildFishingContext :19189 → SetFishingCheckResults :19333',
      '→ FishingCheck_RollItemDrop :19431 → Main.FishDropsDB.TryGetItemDropType（FishDropRuleList.cs:10-21）。',
      '规则求值序（FishDropRule.Attempt :31-51）：条件全中 → chance 掷骰（Next(den) < num）→ 稀有档 → 池内取一。',
      'items 为空 = Stopper（命中即整表终止、返回 0）。',
      '曾用的"FishingRules/HookStats 400+ 条"是 1.4.0 旧类，1456 已删除——条数以本表为准，勿再引用。',
    ],
    sources: [POP, BASE, MAIN].map((p) => p.replace(`${ROOT0}/`, '')),   // ★0a86175f 现库态=相对形(机器绝对路径禁入产物,C档可移植);era-guard byte-perfect 锚
    helpers: HELPERS,
    ruleCount: rules.length,
    groupCounts: rules.reduce((a, r) => ((a[r.group] = (a[r.group] ?? 0) + 1), a), {}),
  },
  conditions,
  rules,
  anglerQuest: quest,
  rewardMilestones,   // 里程碑道具锚点（数值对 Player.cs:55374-55393 switch）
};

// ---- ★BJ298 ③ 基数护栏（1457 实测 rules 158,BJ298 亲数;漂移=解析面残表）----
if (rules.length < 140) {
  fail(`基数护栏: ruleCount ${rules.length} < 140（解析面漂移,禁止静默半表）`);
}

// ---- ★BJ298 era guard ②：干跑对拍 / 沙箱 / 逃生门（banners 同构 deepWash;
//      _meta.sources 动态基线路径串豁免——BJ284 provenance 处方）----
/** 现库 vs 重产双向路径级 diff。live-only=洗库预警面 / fresh-only=现库退化缺键型面
 *  （★G-1/S3 处方）/ drift=同路径值漂移。 */
function deepWash(live, fresh, prefix = '') {
  const w = { liveOnly: [], freshOnly: [], drift: [] };
  const base = prefix || '<root>';
  if (live === null || fresh === null || typeof live !== 'object' || typeof fresh !== 'object') {
    if (JSON.stringify(live) !== JSON.stringify(fresh)) w.drift.push(`${base}: ${JSON.stringify(live)}→${JSON.stringify(fresh)}`);
    return w;
  }
  if (Array.isArray(live) !== Array.isArray(fresh)) {
    w.drift.push(`${base}: 类型漂移 ${Array.isArray(live) ? 'arr' : 'obj'}↔${Array.isArray(fresh) ? 'arr' : 'obj'}`);
    return w;
  }
  const lk = new Set(Object.keys(live));
  const fk = new Set(Object.keys(fresh));
  for (const k of Object.keys(live)) {
    const p = `${prefix}.${k}`;
    if (!fk.has(k)) { w.liveOnly.push(p); continue; }
    const sub = deepWash(live[k], fresh[k], p);
    w.liveOnly.push(...sub.liveOnly); w.freshOnly.push(...sub.freshOnly); w.drift.push(...sub.drift);
  }
  for (const k of Object.keys(fresh)) if (!lk.has(k)) w.freshOnly.push(`${prefix}.${k}`);
  return w;
}
const washEmpty = (v) => !v.liveOnly.length && !v.freshOnly.length && !v.drift.length;
function washReport(v) {
  console.error('  物证：');
  if (v.liveOnly.length) console.error(`    [live-only] 现库独有 ${v.liveOnly.length} 处（重产缺=提取器退化/洗库面）: ${v.liveOnly.slice(0, 6).join(', ')}`);
  if (v.freshOnly.length) console.error(`    [fresh-only] 重产独有 ${v.freshOnly.length} 处（现库缺=源侧新增/现库退化）: ${v.freshOnly.slice(0, 6).join(', ')}`);
  if (v.drift.length) console.error(`    [drift] 值漂移 ${v.drift.length}: ${v.drift.slice(0, 6).join(' | ')}`);
}
const stripProvenance = (o) => {
  const c = JSON.parse(JSON.stringify(o));
  if (c?._meta?.sources !== undefined) c._meta.sources = ['<exempt>'];
  return c;
};
const json = JSON.stringify(out, null, 2) + '\n';   // ★0a86175f 现库态=2-space(原 1-space);era-guard byte-perfect 锚
let live = null;
if (existsSync(LIVE_JSON)) { try { live = JSON.parse(readFileSync(LIVE_JSON, 'utf8')); } catch { /* 坏损:不拦（npcdrops 同款） */ } }
const wash = live === null ? null : deepWash(stripProvenance(live), stripProvenance(JSON.parse(json)));
if (OUT_JSON) {
  if (WRITE_REAL && wash && !washEmpty(wash) && !(FORCE_FULL && OVERWRITE_APPEND_ERA)) {
    console.error('[extract-fishing] 拒绝 --write-real：重产 diff 非纯增量（双向差异非空）——先逐值定谳（反编译为准）再回写。');
    washReport(wash);
    console.error('  确需原地强推：--force-full --overwrite-append-era 双旗（单旗仍拒）。');
    process.exit(1);
  }
  mkdirSync(OUT_JSON.slice(0, OUT_JSON.lastIndexOf('/')), { recursive: true });
  writeFileSync(OUT_JSON, json);
  console.log(`vanilla-fishing.json 已写 ${OUT_JSON}（${WRITE_REAL ? '--write-real 真库' : 'SW_OUT 沙箱'}）: ${rules.length} rules / ${quest.items.length} quest fish / ${quest.filters.length} swap filters`);
} else if (wash === null) {
  console.error('[extract-fishing] 干跑（零写盘）：现库缺 vanilla-fishing.json,跳过对拍。写盘须显式 SW_OUT=<dir> 或 --write-real。');
} else if (!washEmpty(wash)) {
  console.error('[extract-fishing] 干跑对拍：双向 diff 非空（live-only=洗库预警 / fresh-only=现库退化缺键型）——零写盘。');
  washReport(wash);
  console.error('  处置：逐值定谳（反编译为准）后 --write-real 定谳回写；沙箱试验用 SW_OUT=<dir>。');
  process.exit(1);
} else {
  console.log(`vanilla-fishing.json 干跑对拍：重产盖住现库（双向零差,零写盘）: ${rules.length} rules / ${quest.items.length} quest fish / ${quest.filters.length} swap filters`);
}
for (const [g, c] of Object.entries(out._meta.groupCounts)) console.log(`  ${g}: ${c}`);

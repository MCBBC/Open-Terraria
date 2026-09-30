// 从 Terarria1456 Item.cs 提取 rare/value → src/data/{vanilla-itemrare,vanilla-itemvalue}.json。
// 未列出的物品 rare=0 / value=0（ResetStats :48542/:48628 默认）。供 Tooltip 稀有度
// 着色（GetItemNameColor 15 档）、重铸费用 value×stack÷3、商店定价与 decraft 组代表
// （RecipeGroup.DecraftItemId OrderBy(value)）。
//
// 2026-08-13 工厂方法盲区修复（本批散项）：旧实现单正则扫全文件，五类失真——
//   ① value = buyPrice(...) 不求值（427 处，致 1250/1251/1252 读 0 抢占
//      Cloud/Blizzard/SandstormBalloon 三组 decraft 组代表，实测错位）；
//   ② SetShopValues(rarity, price) 双字段工厂（1139 处）完全不可见；
//   ③ case 标签列（case A: case B: 共体）只有末标签拿到值（水母饵 2436-2438、
//      宝石小动物 4831-4844、食物大列表）；
//   ④ 扫描越界：体终止锚 `\n\t\tbreak;` 匹配不到 3-tab 深的体 → 贯穿到后续
//      case 偷 value（case 2630 幻影 150）；工厂方法体内 case（4071/4072/4073/2626）
//      也被当物品混入；
//   ⑤ 工厂方法体内的 value（DefaultToSeaShell/DefaultToFood/DefaultToTorch…）不可见。
// 现策略：仅扫 SetDefaults1..5 + SetFoodDefaults（IsFood 分派 :48295 → 食物走后者），
//   按行解析（case 标签列合并 / 体终止 = 同深度 case|default|break|return|goto /
//   只认 case 体顶层(depth 3)无条件赋值——变体 if 块内赋值属 WeakerVariant 等变体，
//   本表建模基础变体，取顶层赋值序列的**最后一个**（工厂调用与显式赋值按源序覆盖，
//   DefaultToFood→SetShopValues 即此模式）），嵌套 if/switch 内赋值忽略。
//
// 2026-08-23 sellPrice 系统性漏乘 ×5 修复：sellPrice(p,g,s,c) = buyPrice(…)×5
//   （1457 Item.cs:49426-49429 尾乘 5；1456 :49019-49022 同式；extract-shops.mjs
//   同名分支早已带 ×5，本件是漏网者）。旧 evalPrice 把 sellPrice 与 buyPrice 同式
//   求值 → 全表 sellPrice 系条目统一 ÷5（case 757 实证 200000，应为 1000000）。
//   FACTORY_VALUE 同病同修：SeaShell/Vanitypet 手算常量按无 ×5 口径，改存源码
//   表达式串经修后 evalPrice 求值（Solution/Food/HealingPotion 本就是 buyPrice 不变，
//   Torch/MusicBox 字面量不变）。2026-08-23 二批（只读价格字段 + 自赋值伪影）：
//   ⑥ `value = shadowOrbPrice/dungeonPrice/queenBeePrice/hellPrice/eclipse*` 只读
//      字段引用不可求值 → FIELD_PRICE 映射表（字段 → 初始化器 sellPrice 表达式，
//      1457 Item.cs:71-83 / 1456 :52-64，经 evalPrice 自动 ×5 与 sellPrice 系同口径）；
//   ⑦ 反编译器自赋值伪影 `value = (value = 250000);`（1456:6323 case 425 /
//      :10417 case 774）→ evalPrice 剥 `(value = X)` 壳。
//   变体分支内字段引用不收（case 2623 影杖 WeakerVariant `value = dungeonPrice`
//   :25670，基础变体已有顶层 sellPrice(0,5)，按既有"建模基础变体"口径忽略）。
//
// ★追加时代守卫（2026-09-18，清债 BJ114-e 同族普查；★拍板#7A 同日缺省翻转 1457——
//   原洗库险面「缺省 1456（SW_ITEM_VER 未设 → SRC_VER='1456'）而现库已是 1457
//   终值态」就此闭合，守卫语义与流不变）：重产盖不住现库（如显式 SW_ITEM_VER=1456
//   重放旧基线）=把 1457 新物品 6147-6195（49 件）连同 1293 rare 档
//   （1457 Item.cs:15981 新增 rare=8，1456 案无此行）从现库洗成缺键 → 运行时
//   rare=0/value=0 兜底，拾取飘名/重铸费用/商店定价/decraft 组代表全错。BJ92
//   （3860-3862 错值非缺键）同案异构：本件=缺键型增量，与 extract-npcs 的字段型
//   不同构。照 era guard 判例（atlas 四连 / recipes R25-B5② / npcs 债刀-3）落闸——
//   守卫=重产输出 vs 现库【动态 diff】：现库有而重产盖不住的 id（missing）非空即拒
//   exit 1+物证，不硬编码 id 清单（1293≤6146 同被动态探测捕获；实证 1456 重产
//   missing=50/49）。正常更新流：裸跑重产（缺省 1457，输出盖住现库全部 id →
//   零缺失放行；实证与现库逐键 byte-perfect 零漂移）。--dump 对账通道不受守卫限制
//   （recon-item-1456-1457.mjs 双实例 1456/1457 都走 --dump，拦了=对账闸门自断）。
//   活通道与 recon 闸分工：守卫只拦【缺键型】（一门一职责），错值型漂移归
//   recon-item-1456-1457.mjs（--fix 一键重放 1457 终值 + DRIFT=0 双闸）。确需原地
//   强推：双旗 --force-full --overwrite-append-era（单旗仍拒）；事后必须全绿 recon
//   双闸门 + tests/item-stats-golden-1457。测试注入面：SW_ITEMRARE_JSON/
//   SW_ITEMVALUE_JSON（守卫探测路径）/ SW_OUT（写盘目录，缺省 game/src/data），
//   缺省行为不变。守卫测试：tests/extract-itemrare-era-guard.test.ts。
// ★g1 footgun 硬化（2026-09-18，红蓝-F①）：探测 env（SW_ITEMRARE_JSON/
//   SW_ITEMVALUE_JSON）设置而 SW_OUT 缺省 → 拒跑 exit 1（fail-closed）——定谳：
//   守卫探测读注入夹具（零缺失→放行）而写盘落缺省 OUT_DIR=现库 game/src/data，
//   探测与写盘分离=守卫被绕过洗库。处置：显式 SW_OUT（与探测同沙箱）或同时清
//   探测 env 走真实现库守卫；--dump 对账通道不写盘不受此限。
// ★R2 边界登记（2026-09-30 helper 体面收官时的同域残留面,均【未】在本件建模——
//   逐面有源码锚,修复须各自定谳）：
//   ① SetFoodDefaults 方法尾 rare=(int)(num/4f)（:48395;1456:48007/1458 同式）——
//     86 件食物/Eggnog1912/无 case 的 4010 错值型面（饱食档越高 rare 越高,json 恒 SSV 的 1）;
//   ② SetDefaults3 方法尾 value=buyPrice(0,10)（:27641,2192-2208 笼件段+2194 覆写）——value 缺键;
//   ③ 方法级 if 范围守卫 rare 面（case 组不可达,QuestFish 2450-2488 已 HAND 同族）：
//     1522-1527=1(:18541)/1533-1537=8(:18563)/1977-1986=2(:21241)/2104-2113=1(:21879)/
//     2214-2217=3(:22380)/2284-2287=5(:22993)/3309-3314=2(:30262)/2421=1(:23088);
//   ④ case 内 per-type if 链 rare（RB20b 同族残留）：bait 链 2303-2321（:23171-23270）、
//     2420/2421 if-else（:23088-23096）、30189 内层 switch rare=2;
//   ⑤ SetDefaults 派发后方法级块（:48721-48836 value if 链 + :48843 bait>0 → rare 3/2/1）;
//   ⑥ 变体 if 分支（Weaker/StrongerVariant）=按设计忽略（本表建模基础变体,非债）。
import { readFileSync, writeFileSync, writeSync, existsSync } from 'node:fs';

const ROOT = '/Users/vinlic/Project/GLM/SandboxWorld';
// 源版本可选(★拍板#7A 2026-09-18 缺省翻转 1456→1457：现库 vanilla-itemrare/itemvalue
//   已是 1457 终值态,裸跑重产恢复正常更新流;extract-projectiles.mjs 同族先例。
//   1456 显式路径保留供 recon-item-1456-1457.mjs 双闸——其双实例均显式注入
//   SW_ITEM_VER(:198-199 亲核,--dump 对账通道不受守卫限制,不破)。显式 1456
//   重放旧基线会被下方追加时代守卫拦截(missing=50/49),防洗库)
export const SRC_VER = process.env.SW_ITEM_VER ?? '1457';

/** 提取库:Item.cs 全文 → { RARE, VALUE }（id → 档位/价值,铜币,原版 value 字段终值——
 *  sellPrice 系含 ×5 尾乘,2026-08-23 修正） */
export function extractRareValue(src) {
  const LINES = src.split('\n');

// ============ 区域：SetDefaults1..5 + SetFoodDefaults 方法体 ============

/** 方法体切片（从签名行到配平的闭括号，含尾行） */
function methodRange(name) {
  const sig = LINES.findIndex((l) => new RegExp(`^\\t(public|private) void ${name}\\(`).test(l));
  if (sig < 0) throw new Error(`method ${name} not found`);
  let depth = 0;
  for (let i = sig; i < LINES.length; i++) {
    depth += (LINES[i].match(/{/g) ?? []).length - (LINES[i].match(/}/g) ?? []).length;
    if (depth === 0 && i > sig) return [sig, i];
  }
  throw new Error(`method ${name} unbalanced`);
}

const REGIONS = ['SetDefaults1', 'SetDefaults2', 'SetDefaults3', 'SetDefaults4', 'SetDefaults5', 'SetFoodDefaults']
  .map((n) => methodRange(n));

// ============ 表达式求值 ============

/** 只读价格字段 → 初始化器 sellPrice 表达式（Item.cs 顶部 private readonly 字段，
 *  静态扫描只见 `value = shadowOrbPrice;` 引用名 → 先展开为表达式再走 sellPrice
 *  求值（自动 ×5，与 sellPrice 系条目同口径）。出处行号：1457 Item.cs:71-83 /
 *  1456 :52-64，两版初始化器同式。 */
const FIELD_PRICE = {
  shadowOrbPrice: 'sellPrice(0, 1, 50)',        // 1457:71 / 1456:52 → 75000（卖 1金50银）
  dungeonPrice: 'sellPrice(0, 1, 75)',          // 1457:73 / 1456:54 → 87500（卖 1金75银）
  queenBeePrice: 'sellPrice(0, 2)',             // 1457:75 / 1456:56 → 100000（卖 2金）
  hellPrice: 'sellPrice(0, 2, 50)',             // 1457:77 / 1456:58 → 125000（卖 2金50银）
  eclipsePrice: 'sellPrice(0, 7, 50)',          // 1457:79 / 1456:60 → 375000（卖 7金50银）
  eclipsePostPlanteraPrice: 'sellPrice(0, 10)', // 1457:81 / 1456:62 → 500000（卖 10金）
  eclipseMothronPrice: 'sellPrice(0, 12, 50)',  // 1457:83 / 1456:64 → 625000（卖 12金50银）
};

/** buyPrice(p, g, s[, c]) = p*1e6 + g*1e4 + s*100 + c（Item.cs:49421-49424，铜币直和）。
 *  sellPrice(p, g, s[, c]) = buyPrice(…) × 5（Item.cs:49426-49429 尾乘 5；1456
 *  :49019-49022 同式）——参数语义 = 玩家卖出价（币面额），value 字段存 NPC 买入价
 *  = 卖价×5（原版商店 5:1 买卖差）。★2026-08-23 系统性漏乘修复：旧实现把两者
 *  同式求值，全表 sellPrice 系条目统一 ÷5（case 757 实证 200000，应为 1000000）。 */
function evalPrice(expr) {
  let out = expr
    .replace(new RegExp(`\\b(${Object.keys(FIELD_PRICE).join('|')})\\b`, 'g'), (n) => `(${FIELD_PRICE[n]})`)
    .replace(/sellPrice\(([^()]*)\)/g, (_all, args) => {
      const a = args.split(',').map((x) => parseInt(x.trim(), 10) || 0);
      return String(((a[0] || 0) * 1e6 + (a[1] || 0) * 1e4 + (a[2] || 0) * 100 + (a[3] || 0)) * 5);
    })
    .replace(/buyPrice\(([^()]*)\)/g, (_all, args) => {
      const a = args.split(',').map((x) => parseInt(x.trim(), 10) || 0);
      return String((a[0] || 0) * 1e6 + (a[1] || 0) * 1e4 + (a[2] || 0) * 100 + (a[3] || 0));
    })
    .replace(/\((?:int|double|float)\)\s*/g, '')  // (int)((double)x * 1.5) 族强转
    .trim();
  // 反编译器自赋值伪影：`value = (value = 250000);`（1456:6323 case 425 /
  // :10417 case 774）→ 剥壳取内层表达式（C# 赋值表达式值为右操作数）
  while (/\(value = ([^()]*)\)/.test(out)) out = out.replace(/\(value = ([^()]*)\)/g, '$1').trim();
  if (!/^[\d+\-*/(). ]+$/.test(out)) return null;
  try {
    // eslint-disable-next-line no-new-func
    const v = new Function(`"use strict";return (${out});`)();
    return Number.isFinite(v) ? Math.trunc(v) : null;
  } catch {
    return null;
  }
}

/** ItemRarityColor（Terraria.Enums/ItemRarityColor.cs）→ rare 档 */
const RARITY_COLOR = {
  AmberMinus11: -11, TrashMinus1: -1, White0: 0, Blue1: 1, Green2: 2, Orange3: 3,
  LightRed4: 4, Pink5: 5, LightPurple6: 6, Lime7: 7, Yellow8: 8, Cyan9: 9,
  StrongRed10: 10, Purple11: 11,
};

// ============ 工厂方法 value 表（方法体内赋值，静态扫描不可见） ============
//  行号锚 = 1457：DefaultToSeaShell :47967-47993 按 type 内层 switch；DefaultToSolution
//  :47800-47808；DefaultToVanitypet :47937-47952；DefaultToTorch :48471-48482；
//  DefaultToFood :48544-48570；DefaultToHealingPotion :48573-48615；DefaultToMusicBox
//  :48638-48648。表值一律存源码表达式字符串、经上方 evalPrice 求值（sellPrice 自动
//  ×5）——★旧表存手算常量（按无 ×5 口径），SeaShell/Vanitypet 六族随之 ÷5。
//  DefaultToPlaceableTile/Wall / DefaultToCapturedCritter 不设 value（缺表=0 是对的）。
const FACTORY_VALUE = {
  DefaultToSeaShell: (id) => (id === 4071 ? 'sellPrice(0, 1)' : id === 4072 || id === 4073 ? 'sellPrice(0, 0, 20)' : id === 2626 ? 'sellPrice(0, 0, 10)' : 'sellPrice(0, 0, 5)'),
  DefaultToSolution: () => 'buyPrice(0, 0, 15)',
  DefaultToVanitypet: () => 'sellPrice(0, 2)',
  DefaultToTorch: () => '60',             // value = 60 字面量
  DefaultToFood: () => 'buyPrice(0, 0, 20)',
  DefaultToHealingPotion: () => 'buyPrice(0, 0, 20)',
  DefaultToMusicBox: () => '100000',      // value = 100000 字面量
};

// ============ ★清偿刀 R2（2026-09-30,头注续）：DefaultTo* helper 体 rare/value 编译 ============
//  extract-itemcombat Q1 DEFAULT_TO_BODY 同法移植（两提取器独立文件,按本件 rare/value
//  两域裁剪为「委托基座先、自身行后覆写」的行源序模拟;形参不参与 rare/value 表达式
//  ——11 helper 逐条亲核 RHS 全为字面/buyPrice/sellPrice/ItemRarityColor）。
//  census（1457 逐 helper 亲读;1456/1458 三版同构零漂移——BodyCensus 对照脚本实证）：
//  33 名 DefaultTo* 中 11 名体含 rare/value/SetShopValues——DefaultToMusicBox rare=4+
//  value=100000（:48649-48650）、DefaultToSolution rare=3+value（:47806-47807）、
//  DefaultToVanitypet rare=3+value（:47944/47946）、DefaultToFood rare=1+value（:48565-
//  48566）、DefaultToHealingPotion rare=1+value（:48583-48584）、DefaultToTorch value=60
//  （:48482）、DefaultToQuestFish rare=-11（:27658）、DefaultToKite SSV(Blue1,buyPrice(0,2))
//  （:47835）、DefaultToBanner SSV(Blue1,1000)（:47756）、DefaultToGolfBall value=0→
//  SSV(Green2,buyPrice(0,1))（:35459-35460,行序尾胜=rare2/10000）。case 体顶层可达调用点
//  （id 对,由区域扫描组归属）：MusicBox 101/Solution 3/Vanitypet 51/Kite 24/Banner 3/
//  GolfBall 15/QuestFish 2/Food 85/Potion 1/SeaShell 5/Torch 8;其余 22 名体无 rare/value。
//  value 域分工（配方核对,禁双源漂移）：FACTORY_VALUE 七表维持权威（金标已锁;SeaShell
//  per-type switch 体编译器不可达=表唯一来源）;编译器对七表 helper 做编译值≡表值对拍,
//  不等即 throw;表缺的 Kite/Banner/GolfBall 由编译器供值。rare 域：编译器唯一权威
//  （MusicBox=4/Solution=3/Vanitypet=3/Kite=1/Banner=1/GolfBall=2/QuestFish=-11/Food=1/
//  Potion=1——Food/Potion 调用点全带尾随 SetShopValues,case 级 rare 已在,编译值不新增键）。
//  fail-loud：①helper 体/委托缺失 ②depth>0 处 rare/value/SetShopValues 不可达编译（唯
//  SeaShell per-type switch 已知例外,FACTORY_VALUE 承接）③rare RHS 非整数字面 ④value
//  RHS evalPrice 不可解 ⑤七表 helper 编译值≠表值。
const DEFAULT_TO_BODY_RV = (() => {
  const SPEC = new Map(); // name -> (id) => {rare?, value?}
  // ① 收集全部 DefaultTo* 声明（含重载——DefaultToPlaceableTile int/ushort 双载,自转发）
  const decls = new Map(); // name -> body[]
  const declRe = /\b(?:public|private)\s+void\s+(DefaultTo\w+)\s*\(([^)]*)\)\s*\{/g;
  let dm;
  while ((dm = declRe.exec(src))) {
    const name = dm[1];
    const start = src.indexOf('{', dm.index);
    let d = 0, end = -1;
    for (let i = start; i < src.length; i++) {
      if (src[i] === '{') d++;
      else if (src[i] === '}') { d--; if (d === 0) { end = i; break; } }
    }
    if (end < 0) continue;
    if (!decls.has(name)) decls.set(name, []);
    decls.get(name).push(src.slice(start + 1, end));
    declRe.lastIndex = end + 1;
  }
  // ② 体编译：行序步进（委托/rare/value/SetShopValues 赋值）;depth>0 的本域赋值不可达
  //   编译即 fail-loud（era guard ③ 静默兜底禁令;唯 SeaShell switch(type) 已知例外）
  function compileBody(name, stack) {
    if (SPEC.has(name)) return SPEC.get(name);
    if (stack.has(name)) throw new Error(`[extract-itemrare] helper 委托环:${[...stack, name].join('→')}`);
    const bodies = decls.get(name);
    if (!bodies) throw new Error(`[extract-itemrare] helper 体缺失:${name}（Item.cs 漂移,禁止静默空体）`);
    stack.add(name);
    const steps = [];
    for (const body of bodies) {
      let depth = 0;
      for (const raw of body.split('\n')) {
        const o = (raw.match(/{/g) || []).length, c = (raw.match(/}/g) || []).length;
        const t = raw.trim();
        if (t) {
          if (depth === 0 && o === 0) {
            let m;
            if (new RegExp(`^${name}\\s*\\(`).test(t)) { /* 自转发重载行（int→ushort） */ }
            else if ((m = /^(DefaultTo\w+)\s*\((.*)\);\s*$/.exec(t))) steps.push({ delegate: m[1] });
            else if ((m = /^SetShopValues\(ItemRarityColor\.(\w+),\s*([^;]+)\);\s*$/.exec(t))) {
              const r = RARITY_COLOR[m[1]];
              if (r === undefined) throw new Error(`[extract-itemrare] helper ${name} SetShopValues 档名不可解:${m[1]}`);
              steps.push({ rare: r }, { value: m[2] });
            } else if ((m = /^rare = (-?\d+);\s*$/.exec(t))) steps.push({ rare: +m[1] });
            else if ((m = /^value = ([^;]+);\s*$/.exec(t))) steps.push({ value: m[1] });
            // 其它语句（width/height/useStyle…）与本域无关,忽略
          } else if (/^(rare = |value = |SetShopValues\()/.test(t) && name !== 'DefaultToSeaShell') {
            throw new Error(`[extract-itemrare] helper ${name} depth>${depth} 处 rare/value/SetShopValues 不可达编译（Item.cs 漂移,禁止静默跳过）:${t}`);
          }
        }
        depth += o - c;
        if (depth < 0) depth = 0;
      }
    }
    // 委托基座【编译期】递归解析（环检测在此发生）
    for (const st of steps) if (st.delegate) compileBody(st.delegate, stack);
    stack.delete(name);
    const spec = () => {
      const out = {};
      for (const st of steps) {
        if (st.delegate) {
          const sub = SPEC.get(st.delegate)();
          if (sub.rare !== undefined) out.rare = sub.rare;
          if (sub.value !== undefined) out.value = sub.value;
          continue;
        }
        if (st.rare !== undefined) out.rare = st.rare;
        else {
          const v = evalPrice(st.value);
          if (v === null) throw new Error(`[extract-itemrare] helper ${name} value 不可解:${st.value}`);
          out.value = v;
        }
      }
      return out;
    };
    SPEC.set(name, spec);
    return spec;
  }
  for (const name of decls.keys()) compileBody(name, new Set());
  return SPEC;
})();

const RARE = {};
const VALUE = {};

// 深度栈解析：switch 关键字 depth d → case 标签 d+1 → 体语句/终止符 d+2。
// SetDefaults 各段嵌套异构（顶层 case depth 2；SetDefaults2/3 内还有 depth 4 的
// 内层 switch case，如水母饵 2436-2438 :24082、贝壳 2625/2626 :25598）——
// 按标签深度分组建栈，语句归属 depth-1 的最内层组，终止符弹同深度组；
// 内层 per-type 赋值随内层组独立成段（变体分支，不污染外层基础值）。
for (const [from, to] of REGIONS) {
  const groups = []; // { ids: number[], depth, entries: [] }
  const groupAt = (d) => {
    for (let i = groups.length - 1; i >= 0; i--) if (groups[i].depth === d) return groups[i];
    return null;
  };
  const flush = (g) => {
    if (!g) return;
    // 顶层序列最后一个生效（DefaultToFood → SetShopValues 覆盖模式）；
    // 工厂调用按标签逐个求值（DefaultToSeaShell 2625=500 / 2626=1000 per-type）。
    // **先写为准**：反编译 SetDefaults 是多个顺序独立 switch(type) 链，命中即 return
    // ——后置 switch 里的重叠标签是死代码（如 2291 鱼竿 :22989 先于 :23107 的
    // 死标签组 value=500），不覆盖
    for (const id of g.ids) {
      let val;
      let rar;
      for (const e of g.entries) {
        if (e.kind === 'value') val = e.v;
        else if (e.kind === 'rare') rar = e.v;
        else if (e.kind === 'factory') {
          // ★R2：工厂调用 → DEFAULT_TO_BODY_RV 体编译规格。rare 域=编译器唯一权威;
          //   value 域=FACTORY_VALUE 七表权威（金标已锁）+编译值对拍（不等即 throw,
          //   禁双源漂移）;表缺 helper（Kite/Banner/GolfBall 等）由编译器供值。
          const spec = DEFAULT_TO_BODY_RV.get(e.name);
          if (!spec) throw new Error(`[extract-itemrare] 工厂 ${e.name} 无体编译规格（Item.cs 漂移,禁止静默空面）`);
          const b = spec(id);
          if (b.rare !== undefined) rar = b.rare;
          const table = FACTORY_VALUE[e.name];
          if (table) {
            const fv = evalPrice(table(id));
            if (fv === null) throw new Error(`[extract-itemrare] ${e.name} FACTORY_VALUE 不可解:${table(id)}`);
            if (b.value !== undefined && fv !== b.value) throw new Error(`[extract-itemrare] ${e.name} value 双源漂移:表=${fv} 体编译=${b.value}`);
            val = fv;
          } else if (b.value !== undefined) {
            val = b.value;
          }
        }
      }
      if (val !== undefined && VALUE[id] === undefined) VALUE[id] = val;
      if (rar !== undefined && RARE[id] === undefined) RARE[id] = rar;
    }
    groups.splice(groups.indexOf(g), 1);
  };
  for (let i = from; i <= to; i++) {
    const line = LINES[i];
    const depth = (line.match(/^\t*/) ?? [''])[0].length;
    const cm = line.match(/^\t*case (\d+):\s*$/);
    if (cm) {
      const id = parseInt(cm[1], 10);
      const top = groups[groups.length - 1];
      if (top && top.depth === depth) top.ids.push(id);
      else groups.push({ ids: [id], depth, entries: [] });
      continue;
    }
    const s = line.trim();
    if (/^(break;|return\b|goto )/.test(s)) { flush(groupAt(depth - 1)); continue; }
    if (/^default:/.test(s)) { flush(groupAt(depth)); continue; }
    const g = groupAt(depth - 1);
    if (!g || depth !== g.depth + 1) continue;   // 只认 case 体顶层无条件语句
    let m;
    if ((m = s.match(/^SetShopValues\(ItemRarityColor\.(\w+),\s*([^;]+)\);$/))) {
      const v = evalPrice(m[2]);
      const r = RARITY_COLOR[m[1]];
      if (r !== undefined) g.entries.push({ kind: 'rare', v: r });
      if (v !== null) g.entries.push({ kind: 'value', v });
      continue;
    }
    // ★R2：工厂 regex 扩面 7 名 → DefaultTo\w+ 全量（Kite/Banner/GolfBall/QuestFish 等
    //   体含 rare/SetShopValues 的 helper 调用点此前整行不可见;体面产出走
    //   DEFAULT_TO_BODY_RV 编译规格,见 flush 工厂分支）
    if ((m = s.match(/^(DefaultTo\w+)\(/))) {
      g.entries.push({ kind: 'factory', name: m[1] });
      continue;
    }
    if ((m = s.match(/^value = ([^;]+);$/))) {
      const v = evalPrice(m[1]);
      if (v !== null) g.entries.push({ kind: 'value', v });
      continue;
    }
    if ((m = s.match(/^rare = (-?\d+);$/))) {
      g.entries.push({ kind: 'rare', v: +m[1] });
    }
  }
  while (groups.length) flush(groups[0]);
}

// ★BJ91 2026-09-15（RB17b note③）共享 case 的 if(type==X) 全覆盖 rare 覆写反哺：
//   提取器按设计只认 case 体顶层无条件赋值、忽略 if 变体分支（头注口径）——但
//   case 3860/3861/3862（泰坦袋/食人魔袋/黑魔法师袋）的基础 rare=1 被三型 if 链
//   【全覆盖】=对每型皆死码，终值 3860=8/3861=5/3862=3（Item.cs:34145-34164；
//   1456:34120-34140/1458:34145-34165 同链零漂移）。
// ★RB20b 2026-09-15 追加（同族盲区残留）：13 主 Boss 宝袋 3320-3332 与 3860-3862
//   同构——共享 case 3319-3332 基础 rare=1（:30562）+ 13 条 if(type==X) 覆写链
//   （1457 :30563-30589；1456 :30539-30588/1458 同链零漂移）：2/2/3/3/4/5/5/5/6/7/
//   7/8/8（逐值=吞噬/克脑/蜂王/骷髅/肉山/毁灭者/双子/ Prime /世纪花/石巨人/猪龙鱼/
//   拜月教主）。★RB20b note① 勘误：旧注「此前整缺」不实——json 一直有键，
//   是【错值非缺键】（提取面 rare=1，运行时 tooltip/拾取飘名按 1=蓝档着色错档）。
//   3319 克苏鲁之眼袋无覆写行=1 正确不在此列。钉值随提取器走=重产不回退
//   （判例 fx3:重产前必反哺，否则手补被静默洗回提取字面）。守卫=tests/
//   bj91-bossbag-rare.test.ts（json 值+def 面+13 袋值表）+ recon-item-1456-1457.mjs DRIFT。
const HAND_RARE = {
  3860: 8, 3861: 5, 3862: 3,
  3320: 2, 3321: 2, 3322: 3, 3323: 3, 3324: 4, 3325: 5, 3326: 5, 3327: 5,
  3328: 6, 3329: 7, 3330: 7, 3331: 8, 3332: 8,
  // ★BJ413 2026-09-30（风筝无效实报,item 面回填）：24 风筝 rare=1（Blue1）——
  //   rare 由 DefaultToKite 体 :47835 `SetShopValues(ItemRarityColor.Blue1,
  //   buyPrice(0, 2))` 落（helper 体内=case 体顶层无条件语句子之外,本提取器
  //   「只认 case 体顶层」口径不可达→HAND 钉值,与 3860 判例同形）。17 调用点
  //   （4367-4371 组/4379/4610-4612/4613/4648-4651 组/4669-4671/4674-4677/4681/
  //   4683-4684）。4676/4681 的 case 内 `value = buyPrice(0, 2)` 与 helper 体同值
  //   （冗余覆写,非 rare 面）。
  4367: 1, 4368: 1, 4369: 1, 4370: 1, 4371: 1, 4379: 1,
  4610: 1, 4611: 1, 4612: 1, 4613: 1,
  4648: 1, 4649: 1, 4650: 1, 4651: 1,
  4669: 1, 4670: 1, 4671: 1, 4674: 1, 4675: 1, 4676: 1, 4677: 1,
  4681: 1, 4683: 1, 4684: 1,
  // ★R2 2026-09-30（helper 体 rare 面·方法级 if 范围守卫形态,Kite/BJ413 判例同构）：
  //   angler 任务鱼 2450-2488（39 件）rare=-11——rare 由 DefaultToQuestFish 体 :27657
  //   `rare = -11;` 落,但调用点在 SetDefaults3 方法级范围守卫 `if (type >= 2450 &&
  //   type <= 2488)`（:24153-24157,内层 switch 收口后）=非 case 组顶层,本扫描器
  //   「只认 case 体顶层」口径不可达→HAND 钉值。case 顶层调用的 4393/4394 走上方
  //   DEFAULT_TO_BODY_RV 体编译器自动入面（同 rare=-11）,3385-3388 为 case 级显式行
  //   （:30975）既有——任务鱼全族 45 件=39+2+4。消费面：Bobber consumeBait
  //   （Player.cs:53148-53156 rare<0 饵不耗,任务鱼原版同款）+ tooltip 稀有色 quest 档
  //   （UI rarityColor −11 档）。
  2450: -11, 2451: -11, 2452: -11, 2453: -11, 2454: -11, 2455: -11, 2456: -11,
  2457: -11, 2458: -11, 2459: -11, 2460: -11, 2461: -11, 2462: -11, 2463: -11,
  2464: -11, 2465: -11, 2466: -11, 2467: -11, 2468: -11, 2469: -11, 2470: -11,
  2471: -11, 2472: -11, 2473: -11, 2474: -11, 2475: -11, 2476: -11, 2477: -11,
  2478: -11, 2479: -11, 2480: -11, 2481: -11, 2482: -11, 2483: -11, 2484: -11,
  2485: -11, 2486: -11, 2487: -11, 2488: -11,
};
for (const [id, r] of Object.entries(HAND_RARE)) RARE[id] = r;
// ★BJ413：24 风筝 value=20000（2 金）——DefaultToKite 体 :47835 buyPrice(0, 2)
//   （buyPrice(int platinum=0, int gold=0, int silver=0, int copper=0),Item.cs:49421
//   ——第一实参 0=platinum、第二实参 2=gold → 2×10000=20000 铜;4676/4681 case 内
//   `value = buyPrice(0, 2)` 同值冗余）。helper 体面提取器不可达→HAND 钉值
//   （消费面=Game.ts:48408 权威值查表/商店售价/Shimmer 重铸费）。
const HAND_VALUE = {
  4367: 20000, 4368: 20000, 4369: 20000, 4370: 20000, 4371: 20000, 4379: 20000,
  4610: 20000, 4611: 20000, 4612: 20000, 4613: 20000,
  4648: 20000, 4649: 20000, 4650: 20000, 4651: 20000,
  4669: 20000, 4670: 20000, 4671: 20000, 4674: 20000, 4675: 20000, 4676: 20000,
  4677: 20000, 4681: 20000, 4683: 20000, 4684: 20000,
};
for (const [id, v] of Object.entries(HAND_VALUE)) VALUE[id] = v;

  return { RARE, VALUE };
}

const { RARE, VALUE } = extractRareValue(readFileSync(`${ROOT}/Terarria${SRC_VER}/Terraria/Item.cs`, 'utf8'));
export { RARE, VALUE };
if (process.argv[1] && import.meta.url === (await import('node:url')).pathToFileURL(process.argv[1]).href) {
  // --dump:全量表出 stdout 不落盘(recon-item-1456-1457.mjs 双版本对账用;守卫不拦
  //  dump——双实例 1456/1457 都走此通道,拦了=对账闸门自断)
  if (process.argv.includes('--dump')) {
    writeSync(1, JSON.stringify({ src: SRC_VER, RARE, VALUE }));
  } else {
    // ★g1 footgun 硬化（红蓝-F①,2026-09-18）：探测注入面设置而 SW_OUT 缺省 →
    //  fail-closed 拒跑。定谳：守卫探测读 SW_ITEMRARE_JSON/SW_ITEMVALUE_JSON（夹具，
    //  零缺失→放行）而 writeFileSync 落缺省 OUT_DIR=现库 game/src/data——探测与
    //  写盘分离=守卫被绕过洗库。变异判别：tests/extract-itemrare-era-guard.test.ts。
    const PROBE_ENV_SET = process.env.SW_ITEMRARE_JSON !== undefined || process.env.SW_ITEMVALUE_JSON !== undefined;
    if (PROBE_ENV_SET && process.env.SW_OUT === undefined) {
      console.error('[extract-itemrare] 拒绝运行：探测注入面（SW_ITEMRARE_JSON/SW_ITEMVALUE_JSON）已设置而 SW_OUT 缺省（fail-closed）。');
      console.error('  守卫将探测注入夹具（零缺失→放行），写盘却落缺省现库路径 game/src/data——探测与写盘分离=守卫被绕过（footgun 洗库面）。');
      console.error('  处置：显式设置 SW_OUT 指向与探测一致的沙箱目录，或同时清掉探测 env 走真实现库守卫；--dump 对账通道不写盘不受此限。');
      process.exit(1);
    }
    // ---- ★追加时代守卫（头注见上）：重产 vs 现库动态 diff,缺键非空即拒 ----
    const FORCE_FULL = process.argv.includes('--force-full');
    const OVERWRITE_APPEND_ERA = process.argv.includes('--overwrite-append-era');
    const OUT_DIR = process.env.SW_OUT ?? `${ROOT}/game/src/data`;
    const RARE_OUT = `${OUT_DIR}/vanilla-itemrare.json`;
    const VALUE_OUT = `${OUT_DIR}/vanilla-itemvalue.json`;
    const RARE_GUARD = process.env.SW_ITEMRARE_JSON ?? RARE_OUT;
    const VALUE_GUARD = process.env.SW_ITEMVALUE_JSON ?? VALUE_OUT;
    // 现库 id 集 − 重产输出集 = 重产盖不住的缺键（动态探测,不硬编码 id 清单;
    // 现库不存在/坏损时不拦——同 npcs 判例,让正常流程自行报错）
    const missingOf = (guardPath, fresh) => {
      if (!existsSync(guardPath)) return [];
      try {
        const prev = JSON.parse(readFileSync(guardPath, 'utf8'));
        if (prev == null || typeof prev !== 'object' || Array.isArray(prev)) return [];
        return Object.keys(prev).filter((k) => fresh[k] === undefined);
      } catch { return []; }
    };
    const missingRare = missingOf(RARE_GUARD, RARE).sort((a, b) => Number(a) - Number(b));
    const missingValue = missingOf(VALUE_GUARD, VALUE).sort((a, b) => Number(a) - Number(b));
    const appendEra = missingRare.length > 0 || missingValue.length > 0;
    if (appendEra && !(FORCE_FULL && OVERWRITE_APPEND_ERA)) {
      const sample = (ids) => `${ids.slice(0, 6).join(', ')}${ids.length > 6 ? '…' : ''}`;
      console.error(`[extract-itemrare] 拒绝全量重写：现库含重产(SW_ITEM_VER=${SRC_VER})盖不住的 id（追加时代·缺键型增量）。`);
      console.error(`  物证：vanilla-itemrare.json 缺 ${missingRare.length} 个 id（${sample(missingRare)}）；vanilla-itemvalue.json 缺 ${missingValue.length} 个 id（${sample(missingValue)}）。`);
      console.error('  全量重写会把缺键 id 洗成 rare=0/value=0 兜底——拾取飘名/重铸费用/商店定价/decraft 组代表全错（缺键型,与 BJ92 错值型同案异构）。');
      console.error('  正常更新流：node tools/extract-itemrare.mjs 重产（缺省 1457,输出盖住现库全部 id,零缺失即放行）。');
      console.error('  错值型漂移走活通道：node tools/recon-item-1456-1457.mjs（--fix 一键重放 1457 终值 + DRIFT=0 双闸）。');
      console.error('  确需原地强推：双旗 --force-full --overwrite-append-era（单旗仍拒）；事后必须全绿 recon-item 双闸门 + tests/item-stats-golden-1457。');
      process.exit(1);
    }
    writeFileSync(RARE_OUT, JSON.stringify(RARE));
    writeFileSync(VALUE_OUT, JSON.stringify(VALUE));
    console.error(`rare 条目: ${Object.keys(RARE).length} / value 条目: ${Object.keys(VALUE).length}（源 Terarria${SRC_VER}）`);
  }
}

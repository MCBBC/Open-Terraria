// 从 Terarria1457 Item.cs 提取物品战斗数据（SetDefaults 主 switch + SetDefaults1/2/3 分段 switch）。
// ★BJ215 头注勘误：本行原写「Terarria1456」系陈旧注释——SRC_VER 早已缺省 1457
//   （BJ183 2026-09-20 基准对齐,见下方 SRC_VER 注）；1456/1458 显式回拍走 SW_ITEM_VER。
// case 块内深度 1 赋值；SetDefaultsN(M) 委托块继承 M 记录后覆盖。输出 src/data/vanilla-itemcombat.json
//
// 2026-08-17 三通道扩展（本文件同时是提取库，供 extract-itemfunc.mjs 叠加 useTurn）：
//   · useTurn / noUseGraphic 进 BOOL_FIELDS（显式字面 + DefaultTo* 辅助函数体归档语义，
//     Item.cs:170 字段默认 false；DefaultToFood :48166 / DefaultToHealingPotion :48185 /
//     DefaultToPlaceableTile :48101+:48106 / DefaultToPlaceableWall :48017 / DefaultToTorch :48083 /
//     DefaultToCapturedCritter :47613 隐式 useTurn=true；DefaultToBomb :47399 / DefaultToWhip :47439 /
//     DefaultToSpear :47637 / DefaultToCapturedCritter 隐式 noUseGraphic=true）
//   · UseSound 侧道（不入 combat 记录）→ 重生成 src/data/vanilla-itemusesound.json
//     （SetFoodDefaults 食物族 DefaultToFood Item2/3 + DefaultToStaff Item43 / DefaultToWhip Item152 等）
//   · SetFoodDefaults 仅作三通道来源（食物条目不进 combat 表，useTurn/useSound 走侧道）
//
// ★★2026-09-18 反哺批（BJ121 留守三面收口）：三形态补齐，整表重产不再回退已提交值——
//   ①crit += N 累加形态（SetDefaults2/4 六 case：1254 :15523 +25 / 1553 :18682 +10 /
//     1782 :19756 +6 / 1784 :19787 +6 / 1835 :20322 +10 / 3291 :30171 +10；C# 字段
//     缺省 0 起按序累加,块内字面 `crit = N;` 为赋值语义重置;纯字面块不进此支维持
//     find() 首匹配语义零漂移）
//   ②useTime = useAnimation 别名赋值（1226 :15125,useAnimation=32 字面前行 → 32；
//     4241 :35613 的 useAnimation 在 DefaultToPlaceableTile helper 体（=15）——
//     helper 体字段面未建不解析,登记）
//   ③DefaultTo* 武器族形参位解析（此前 Helper 扫描仅取 helper 体字面三通道,调用点
//     实参从未解析）——六 helper 语义逐行亲读 1457 Item.cs（:48425-48470）：
//     RangedWeapon(baseProj,ammoID,singleShotTime,shotVelocity[,hasAutoReuse]) /
//     Bow(t,v[,autoReuse])=RangedWeapon(1,Arrow=40,…)+width/height+Item5 /
//     ThrownWeapon(p,t,v[,autoReuse]) / Spear(p,v,t)（体 :48458-48470,useAnim=useTime
//     链式终值=animationTime,noUseGraphic/UseSound 走既有 helper 体扫描）/
//     MagicWeapon(p,t,v[,autoReuse]) / Staff(p,v,t,mana)=MagicWeapon(…,autoReuse:true)
//     +mana。hasAutoReuse 缺省 false ≙ 表缺省不注入（照 SetWeaponValues 2 参判例）。
//     25 调用点全 census（4058/4060-4062/4343/4344/4347/4348/4381/4682/4702/4765/
//     4766/4788-4790/5065/5285/5629/6152-6155/6171/6173）；fill-when-undefined
//     （字面 pass 先跑,全部重叠字面均在调用之后:6152 useTime=4/6173 useTime=6/
//     5629·4682·4702 ranged=false）。金标=vanillaItemCombat.ts EXTRACT_PATCH
//     （4060/5629/4058/4381/4788-4790/6155/6171/6173）+本文件 THROWN_WEAPONS 手补表
//     （4343 族）+obj['5065']——dry-run 对拍逐字段全等。
//   ④登记不解析（形参位家族剩余面,须先建 helper 体字段面机制）：
//     · DefaultToPlaceableTile/Wall/MusicBox/Bomb/Solution/Kite/Torch/CapturedCritter
//       等 placeable 族（useTime=10/useAnimation=15/autoReuse/consumable 的 helper 体
//       值——json 现缺,量级数百 id,独立刀）;
//     · 4241 的 useTime 别名（依赖 PlaceableTile 体 useAnimation）。
//   ⑤真值变登记（真值变=停下登记判例）：6152 json useTime=4 系旧提取 shotVelocity
//     误读遗留——源码 case 有字面 `useTime = 4;`（:47414）在调用之后,C# 终值即 4,
//     源序解析与之同值,非本批改动面。
//   ⑦★清偿刀 J 2026-09-30（BJ408 债#1/#2 收口）四根修——TryGet 四门输入面
//     （damage/useAnimation/knockBack/mana,Item.cs:1067-1079）全普查后落刀：
//     a.嵌套 switch(type) 贯穿组（nestedSwitchCases 此前逐 case 切块,`case A: case B:`
//       共享体只落到组末 id——悠悠球 3287 RedsYoyo damage70/kb4.5 全缺=重铸池压缩
//       到 size/crit 档,best 误判;同组族 2289-2296 钓竿/2237-2262·2432-2438 等
//       约百件可放置族 anim/time 半缺）;
//     b.链式/复合/除式赋值（`useAnimation = (useTime = 24);` 双赋值 1296/1345/2350/
//       4870/4715 + `useTime /= 2` 4715 + `useTime = useAnimation / N` 4722/4956/5669）;
//     c.DefaultToWhip 形参位（:47811-47828 五参,18 鞭 damage/kb/useTime/useAnimation/
//       shootSpeed/shoot 全在实参——此前 combat 表仅 noUseGraphic 一键,BJ408 以
//       vanilla-whips.json 在前缀链定点回填,本刀后 combat 表原生全值）;
//     d.守卫链数值面（default 臂纯 type 条件 if/else 块——此前只取三通道
//       useTurn/noUseGraphic/UseSound;数值全漏:2320 战锤全武器面 damage24/kb6/
//       anim24/time14/scale1.05、2421/2422 钓竿对（含 else 臂 shootSpeed16.5）、
//       约三百件可放置族 anim15/time10|7|17）。父域谓词收窄递归,仅补空不覆盖。
//     era guard:SW_OUT 沙箱重产=既有键值零回退+本四类新增键逐一亲读源码定谳。
//   ⑧BJ205 2026-09-20 LAG 残余盘点（dry-run --dump 1457 × vanillaItemCombat.ts
//     EXTRACT_PATCH 逐字段对拍）：45 手补件中 29 件已被①②③反哺全字段原生复现
//     （另 8 件部分字段:炸弹族 shoot 六件/5594-5595 noUseGraphic;1 件末值覆盖:1319）,
//     仍 LAG 15 件 33 字段——手补面记录（vanillaItemCombat.ts EXTRACT_PATCH 为唯一
//     数据源,重产前须先建下列机制,否则整批回退）：
//     · helper 体字段面机制未建：DefaultToLawnMower(:48532-48541,4049)、
//       DefaultToSolution(:47800-47808,5392-5394)、DefaultToBomb(:47771-47783,
//       5594/5595)——体值 useTime/useAnimation/autoReuse/consumable/noMelee/ammo/shoot
//       不入 HELPER_EFFECTS 三通道;
//     · 算式族：4956/5669 `useTime = useAnimation / 3`（:40011/:44557）除法未解析;
//     · useAmmo 双赋值末值语义：1319 源序 Bullet(:16335)→Snowball(:16343) 终值 949,
//       首匹配取 97——TS 补丁 949 权威,反哺须改 find() 为末匹配或序感解析;
//     · 【禁反哺】4423/4824-4827/4908/4909 的 noMelee 七件=本仓派发等价门
//       （combatWeapon consumable&&noMelee 爆炸物门）,原版 SetDefaults 无此字面,
//       提取器不产=正确。
import { readFileSync, writeFileSync, writeSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// ★era guard（BJ215 落闸,四要素习语见 docs/era-guard-family.md）：
//   ① SW_ITEM_VER 缺省 1457（白名单 1456/1457/1458+反编译目录存在性 fail-closed;
//     1456 保留=recon-item-1456-1457.mjs 双实例 --dump 对账通道,拦了=对账闸门自断）;
//   ② 输出通道三分离：缺省=干跑对拍零写盘（重产 vs 现库动态 diff——缺键型洗库面非空
//     或值漂移即 exit 1+物证,B-form:零漂移放行/漂移+物证）/ SW_OUT=<dir> 沙箱 /
//     --write-real 逃生门;双旗互斥;SW_ITEM_VER≠1457 禁写真库;--dump/--audit 不落盘
//     通道不受守卫限制;
//   ③ 锚 fail-loud：methodBody 签名未找到即 throw（禁止「找不到就吃空体」静默兜底）;
//   ④ 判别力自证：tests/extract-itemcombat-era-guard.test.ts（变异:摘干跑门=静默写库;
//     毒化方法签名=fail-loud;★清偿刀 M 2026-09-29 增 M3=摘根修门复现 F 债九 alias 双缺/
//     M4=委托链断 combat 失联;★清偿刀 Q 2026-09-29 退役六锯钻 LUNAR_DELEGATE 手补面
//     （M 根修后委托链单源直出,沙箱重产 sha256 逐字节相等复证）,M4 判别面扩至全 15 件
//     月主委托件）。BJ215 定谳：1457 重产 vs 现库逐值零漂移（4369 items +
//     978 useSound）,bare 重跑幂等态成立,B-form 对拍闸在位。
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const AUDIT = process.argv.includes('--audit'); // 自审计模式:不写文件,stdout 出 JSON 摘要
// 源版本可选(recon-item-1456-1457.mjs 以 query-string 双实例分别取 1456/1457;
// ★BJ183 2026-09-20 基准对齐:缺省 1456→1457(裸跑不再丢 1457 专属字段/条目——
// 1782/1784/1835/3291 crit + 4058/4060/4061/4062/4347/4348/4381/4788-4790/5629
// 战斗画像全字段 + 6152-6155/6171/6173 新武器;1456 档留 SW_ITEM_VER=1456 显式回拍)
export const SRC_VER = process.env.SW_ITEM_VER ?? '1457';
// ★era guard ①:版本白名单 fail-closed（1456 保留=recon 双实例 --dump 对账;目录不存在即拒,
//   禁止让 readFileSync 炸一堆 ENOENT 或静默错锚）
const VER_ALLOWED = new Set(['1456', '1457', '1458']);
if (!VER_ALLOWED.has(SRC_VER) || !existsSync(`${ROOT}/Terarria${SRC_VER}/Terraria/Item.cs`)) {
  console.error(`[extract-itemcombat] 拒绝运行：SW_ITEM_VER="${SRC_VER}" 非法（白名单 ${[...VER_ALLOWED].join('/')}，且需存在 Terarria${SRC_VER}/ 反编译目录）。`);
  process.exit(1);
}
const src = readFileSync(`${ROOT}/Terarria${SRC_VER}/Terraria/Item.cs`, 'utf8');

// ---- 方法体切片（配平花括号） ----
// ★era guard ③:签名未找到即 throw（原实现返回 ''——静默空体=表与源码失配还全绿的
//   静默兜底反模式,extract-petai「源码漂移即报错退出」原旨）
function methodBody(name) {
  const idx = src.indexOf(name);
  if (idx < 0) throw new Error(`[extract-itemcombat] 锚点失配: 方法 ${name} 未找到（Item.cs 漂移,禁止静默空体）`);
  const start = src.indexOf('{', idx);
  let depth = 0;
  for (let i = start; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) return src.slice(start + 1, i); }
  }
  throw new Error(`[extract-itemcombat] 锚点失配: 方法 ${name} 花括号不配平（Item.cs 漂移）`);
}
const bodies = [
  // 签名前缀不带可见性修饰符(1456=public / 1457=private,substring 匹配两者兼容)
  methodBody('void SetDefaults(int Type'),
  methodBody('void SetDefaults1(int type)'),
  methodBody('void SetDefaults2(int type)'),
  methodBody('void SetDefaults3(int type)'),
  methodBody('void SetDefaults4(int type)'),
  methodBody('void SetDefaults5(int type)'),
];

// ---- switch-case 块拆分 ----
// 支持两类 1456 惯用法：
//  ① case 贯穿组（悠悠球 3274-3292：`case A: case B: ... <共享体>`）——
//     相邻 case 标签之间只有空白/注释则并入同组，共享体赋给组内全部 id；
//  ② 块内嵌套 `switch (type)`（贯穿组内按 id 二次覆盖 damage/knockBack/shoot 等）——
//     嵌套 case 块的深度 1（相对嵌套 switch）赋值按其自身 id 合并进全局表
// 注意：case 标签过滤——嵌套 switch 内部的 `case N:` 不算外层组（否则其块会覆盖
// 同 id 组首的 groupShared 共享体，悠悠球 3262 曾被内层 case 覆盖成 damage/shoot 小记录）
function switchSpans(body) {
  const spans = [];
  const re = /\bswitch\s*\(/g;
  let m;
  while ((m = re.exec(body))) {
    const open = body.indexOf('{', m.index);
    if (open < 0) continue;
    let depth = 0, close = open;
    for (let i = open; i < body.length; i++) {
      if (body[i] === '{') depth++;
      else if (body[i] === '}') { depth--; if (depth === 0) { close = i; break; } }
    }
    // 关键字处花括号深度（方法体语句 = 0 → 顶层 switch；case 块内 = ≥1 → 嵌套）
    let d0 = 0;
    for (let i = 0; i < m.index; i++) {
      if (body[i] === '{') d0++;
      else if (body[i] === '}') d0--;
    }
    spans.push({ start: m.index, open, close, depth: d0 });
  }
  return spans;
}
function parseSwitch(body) {
  const out = [];
  const spans = switchSpans(body);
  const isNestedCase = (pos) => {
    let inner = null;
    for (const s of spans) {
      if (s.open < pos && pos < s.close && (!inner || s.open > inner.open)) inner = s;
    }
    return !!inner && inner.depth > 0;
  };
  const caseRe = /\bcase (\d+):/g;
  let m;
  const marks = [];
  while ((m = caseRe.exec(body))) {
    if (!isNestedCase(m.index)) marks.push([+m[1], m.index]);
  }
  let k = 0;
  while (k < marks.length) {
    // 收集贯穿组：当前 case 的冒号到下一个 case 标签之间只有空白/注释
    const group = [marks[k][0]];
    let end = k + 1 < marks.length ? marks[k + 1][1] : body.length;
    while (k + 1 < marks.length) {
      const afterColon = body.indexOf(':', marks[k][1]) + 1;
      const between = body.slice(afterColon, marks[k + 1][1]);
      if (between.trim().length > 0 && !/^[\s/*]+$/.test(between)) break;
      group.push(marks[k + 1][0]);
      k++;
      end = k + 1 < marks.length ? marks[k + 1][1] : body.length;
    }
    const start = body.indexOf(':', marks[k][1]) + 1;
    out.push({ ids: group, block: body.slice(start, end) });
    k++;
  }
  return out;
}

/** 块内嵌套纯 type 条件 if 的覆盖条目（id → 块）。
 *  1456 惯用法:case 贯穿组共享体 + 嵌套条件二次覆盖——
 *  `if (type == K) {…}`（链锤 5012 组共享 shoot=947、内层覆盖 948,曾漏提）
 *  及区间/复合 OR 形态（通配:平衡括号取条件,纯 type 布尔式逐 id 求值）。*/
function nestedTypeIfCases(block) {
  const out = [];
  const re = /(?:else\s+)?if\s*\(/g;
  let m;
  while ((m = re.exec(block))) {
    // 平衡括号取条件
    let d = 0, condEnd = -1;
    for (let i = m.index + m[0].length - 1; i < block.length; i++) {
      if (block[i] === '(') d++;
      else if (block[i] === ')') { d--; if (d === 0) { condEnd = i + 1; break; } }
    }
    if (condEnd < 0) break;
    const cond = block.slice(m.index + m[0].length - 1, condEnd);
    if (/\bType\b/.test(cond)) { re.lastIndex = condEnd; continue; }
    const stripped = cond.replace(/\btype\b/g, '');
    if (!/^[\s\d()&|=<>!*]+$/.test(stripped)) { re.lastIndex = condEnd; continue; }
    let fn;
    try { fn = new Function('type', `return (${cond});`); } catch { re.lastIndex = condEnd; continue; }
    const braceAt = block.indexOf('{', condEnd);
    if (braceAt < 0 || block.slice(condEnd, braceAt).trim() !== '') { re.lastIndex = condEnd; continue; }
    let depth = 0, close = braceAt;
    for (let i = braceAt; i < block.length; i++) {
      if (block[i] === '{') depth++;
      else if (block[i] === '}') { depth--; if (depth === 0) { close = i; break; } }
    }
    const inner = block.slice(braceAt + 1, close);
    for (let id = 0; id <= 5500; id++) {
      let hit = false;
      try { hit = !!fn(id); } catch { hit = false; }
      if (hit) out.push({ id, block: inner });
    }
    re.lastIndex = close + 1;
  }
  return out;
}

/** 块内嵌套 switch(type) 的 case 条目（id → 块）。
 *  ★刀J 根修 a（BJ408 债#1,2026-09-30）：嵌套 case 贯穿组（`case A: case B:` 相邻
 *  标签间只有空白/注释）此前逐 case 切块——组内非末 id 拿到空块=applyRec 早退=整段
 *  字段缺失（悠悠球 3287 RedsYoyo damage70/kb4.5 全缺=重铸池压缩;2289-2296 钓竿组
 *  2289-2295 anim8/time8 半缺）。修=与外层 parseSwitch 同款贯穿组收集,共享体赋给
 *  组内全部 id（C# 语义:组内每个 id 依次执行共享体+自身内层 switch 覆写）。 */
function nestedSwitchCases(block) {
  const out = [];
  const re = /switch\s*\(\s*type\s*\)/gi;
  let m;
  while ((m = re.exec(block))) {
    const open = block.indexOf('{', m.index);
    if (open < 0) continue;
    let depth = 0, close = open;
    for (let i = open; i < block.length; i++) {
      if (block[i] === '{') depth++;
      else if (block[i] === '}') { depth--; if (depth === 0) { close = i; break; } }
    }
    const inner = block.slice(open + 1, close);
    const caseRe2 = /\bcase (\d+):/g;
    const marks2 = [];
    let m2;
    while ((m2 = caseRe2.exec(inner))) marks2.push([+m2[1], m2.index]);
    let j = 0;
    while (j < marks2.length) {
      // 贯穿组收集：当前 case 冒号到下一 case 标签之间只有空白/注释 → 同组
      const group = [marks2[j][0]];
      let end = j + 1 < marks2.length ? marks2[j + 1][1] : inner.length;
      while (j + 1 < marks2.length) {
        const afterColon = inner.indexOf(':', marks2[j][1]) + 1;
        const between = inner.slice(afterColon, marks2[j + 1][1]);
        if (between.trim().length > 0 && !/^[\s/*]+$/.test(between)) break;
        group.push(marks2[j + 1][0]);
        j++;
        end = j + 1 < marks2.length ? marks2[j + 1][1] : inner.length;
      }
      const start = inner.indexOf(':', marks2[j][1]) + 1;
      const shared = inner.slice(start, end);
      for (const id of group) out.push({ id, block: shared });
      j++;
    }
  }
  return out;
}

// ---- 块内深度 1 赋值（switch 内语句深度 0） ----
const depth1Lines = (block) => {
  const out = [];
  let depth = 0;
  for (const raw of block.split('\n')) {
    const opens = (raw.match(/\{/g) || []).length;
    const closes = (raw.match(/\}/g) || []).length;
    if (depth === 0 && opens === 0) out.push(raw.trim());
    depth += opens - closes;
    if (depth < 0) depth = 0;
  }
  return out;
};

/** 剥掉 case 体最外层花括号（`case 2001: { … break; }` 带局部变量的解编译形态，
 *  depth1Lines 会整块跳过——三通道归档时剥一层再扫；legacy 字段提取保持原行为防漂移） */
const stripOuterBrace = (block) => {
  const open = block.indexOf('{');
  if (open < 0) return block;
  if (block.slice(0, open).trim() !== '') return block;
  let depth = 0;
  for (let i = open; i < block.length; i++) {
    if (block[i] === '{') depth++;
    else if (block[i] === '}') {
      depth--;
      if (depth === 0) return block.slice(open + 1, i) + block.slice(i + 1);
    }
  }
  return block;
};

// ---- DefaultTo* 辅助函数归档语义（三通道）----
// 扫全部方法体里 useTurn / noUseGraphic / UseSound 的字面赋值 → 名字 → 效果表；
// 委托链（DefaultToStaff→DefaultToMagicWeapon / DefaultToBow→DefaultToRangedWeapon）
// 两轮迭代收敛。SetDefaults*/SetFoodDefaults/ResetStats/netDefaults 是分发器非族辅助，
// 显式排除（委托走既有 delegates 通道）。
const HELPER_EXCLUDE = new Set(['SetDefaults', 'SetDefaults1', 'SetDefaults2', 'SetDefaults3',
  'SetDefaults4', 'SetDefaults5', 'SetFoodDefaults', 'ResetStats', 'netDefaults']);
function scanHelperEffects() {
  const effects = new Map(); // name -> { useTurn?, noUseGraphic?, useSound?, soundNull? }
  const calls = new Map();   // name -> [callee names]
  const declRe = /\b(?:public|private|internal|protected)\s+(?:static\s+)?[\w<>\[\], .?]+\s+(\w+)\s*\([^;{)]*\)?\s*(?:\r?\n)?\s*\{/g;
  let m;
  while ((m = declRe.exec(src))) {
    const name = m[1];
    // 从声明处配平取方法体
    const start = src.indexOf('{', m.index);
    let depth = 0, end = -1;
    for (let i = start; i < src.length; i++) {
      if (src[i] === '{') depth++;
      else if (src[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
    }
    if (end < 0) continue;
    const body = src.slice(start + 1, end);
    declRe.lastIndex = end + 1;
    const eff = {};
    const ut = body.match(/useTurn = (true|false);/);
    if (ut) eff.useTurn = ut[1] === 'true';
    const ng = body.match(/noUseGraphic = (true|false);/);
    if (ng) eff.noUseGraphic = ng[1] === 'true';
    const us = body.match(/UseSound = (SoundID\.\w+|null);/);
    if (us) eff.useSound = us[1] === 'null' ? null : soundNameOf(us[1]);
    if (Object.keys(eff).length) effects.set(name, eff);
    if (/DefaultTo|SetWeaponValues|SetShopValues|MakeUsable/.test(name)) {
      calls.set(name, [...body.matchAll(/\b([A-Z]\w+)\s*\(/g)].map((c) => c[1]));
    }
  }
  // 委托收敛（2 轮足够：DefaultToStaff→DefaultToMagicWeapon 深度 ≤2）
  for (let round = 0; round < 2; round++) {
    for (const [name, callees] of calls) {
      for (const callee of callees) {
        const eff = effects.get(callee);
        if (!eff || HELPER_EXCLUDE.has(callee)) continue;
        const own = effects.get(name) ?? {};
        let changed = false;
        for (const [k, v] of Object.entries(eff)) {
          if (own[k] === undefined) { own[k] = v; changed = true; }
        }
        if (changed) effects.set(name, own);
      }
    }
  }
  for (const n of HELPER_EXCLUDE) effects.delete(n);
  return effects;
}

/** SoundID 表达式 → 表值（SoundID.Item76 → "Item_76"；命名轨保留原名） */
function soundNameOf(expr) {
  const im = expr.match(/^SoundID\.Item(\d+)$/);
  if (im) return `Item_${im[1]}`;
  const nm = expr.match(/^SoundID\.(\w+)$/);
  return nm ? nm[1] : undefined;
}

const HELPER_EFFECTS = scanHelperEffects();

const NUM_FIELDS = ['damage', 'knockBack', 'useTime', 'useAnimation', 'shoot', 'useAmmo', 'shootSpeed', 'ammo', 'maxStack', 'crit', 'scale', 'mana'];
// AmmoID.* 枚举引用（AmmoID.cs:112-146 全表——曾缺 9 项致 Flare/Snowball/StyngerBolt/
// CandyCorn/JackOLantern/Stake/NailFriendly/FallenStar/Acorn 全落 -1 假数据，2026-08-15 补全）
// SW-V1 2026-09-04: 改导出——extract-itemfunc.mjs 的 DefaultTo* 参数化展开复用同一
// 枚举权威（DefaultToRangedWeapon 第二参 AmmoID.X / DefaultToSolution 的
// AmmoID.Solution;此前 func 提取器不解枚举实参,4060/5629/4703 类整条漏提）。
export const AMMO_ID = {
  None: 0, Gel: 23, Arrow: 40, Coin: 71, FallenStar: 75, Bullet: 97, Sand: 169,
  Dart: 283, Rocket: 771, Solution: 780, Flare: 931, Snowball: 949, StyngerBolt: 1261,
  CandyCorn: 1783, JackOLantern: 1785, Stake: 1836, NailFriendly: 3108, Acorn: 27,
};
// 2026-08-17 新增两布尔（全量归档语义：显式字面 + 辅助函数族批量）
const BOOL_FIELDS = ['consumable', 'noMelee', 'autoReuse', 'melee', 'ranged', 'magic', 'summon',
  'useTurn', 'noUseGraphic'];

// ---- ★反哺批（2026-09-18 BJ121 留守面③）：DefaultTo* 武器族形参位解析 ----
// 括号感知顶层逗号分割（extract-itemfunc.mjs splitArgs 同构）
function splitCallArgs(text) {
  const out = [];
  let d = 0, cur = '';
  for (const ch of text) {
    if (ch === '(') d++;
    else if (ch === ')') d--;
    if (ch === ',' && d === 0) { out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim() !== '') out.push(cur);
  return out.map((s) => s.trim());
}
/** 实参求值：剥 (ushort)/(short)/(sbyte)/(uint)/(int) 显式转换与 float 后缀 f；
 *  `type` 线性算式按当前 id 求值（4766 `type - 4765 + 868`,Item.cs:39209）；
 *  AmmoID 枚举/形参名/不可解 → undefined（拒值不猜,FX53 判例）。 */
function evalCallArg(expr, id) {
  if (expr === undefined) return undefined;
  const s = expr.replace(/\(\s*(?:ushort|short|sbyte|uint|int)\s*\)/g, '').replace(/\s+/g, '');
  if (/^[-+]?\d+$/.test(s)) return parseInt(s, 10);
  if (/^[-+]?\d+(\.\d+)?f?$/.test(s)) return parseFloat(s);
  if (!/\btype\b/.test(s)) return undefined;
  if (!/^[\d()+-]+$/.test(s.replace(/\btype\b/g, ''))) return undefined;
  try { return Function(`"use strict";return (${s.replace(/\btype\b/g, String(id))});`)(); } catch { return undefined; }
}
/** ammo 位实参：AmmoID.X 枚举 → AMMO_ID 权威表（缺项 -1 兜底同既有 ammo 直派支） */
function evalCallAmmo(expr, id) {
  if (expr === undefined) return undefined;
  const em = /AmmoID\.(\w+)/.exec(expr);
  if (em) return AMMO_ID[em[1]] ?? -1;
  return evalCallArg(expr, id);
}
// 六 helper 基座（行号=1457 Item.cs,逐行亲读;具名实参 hasAutoReuse: true 与位置
// true 双形态）。返回 {field: value};undefined 值位由调用侧 fill-when-undefined 跳过。
const DEFAULT_TO_PARAMS = {
  // :48445-48456 DefaultToRangedWeapon(int baseProjType, int ammoID, int singleShotTime,
  //   float shotVelocity, bool hasAutoReuse = false)
  DefaultToRangedWeapon: (pos, named, id) => ({
    shoot: evalCallArg(pos[0], id),
    useAmmo: evalCallAmmo(pos[1], id),
    useTime: evalCallArg(pos[2], id),
    useAnimation: evalCallArg(pos[2], id),
    shootSpeed: evalCallArg(pos[3], id),
    noMelee: true,
    ranged: true,
    ...((named.hasAutoReuse ?? pos[4]) === 'true' ? { autoReuse: true } : {}),
  }),
  // :48425-48432 DefaultToBow(int singleShotTime, float shotVelocity, bool hasAutoReuse=false)
  //   = DefaultToRangedWeapon(1, AmmoID.Arrow=40, t, v, …) + width/height + UseSound Item5
  //  （width/height 不在 combat 域;UseSound 走既有 helper 体扫描）
  DefaultToBow: (pos, named, id) => ({
    shoot: 1,
    useAmmo: AMMO_ID.Arrow,
    useTime: evalCallArg(pos[0], id),
    useAnimation: evalCallArg(pos[0], id),
    shootSpeed: evalCallArg(pos[1], id),
    noMelee: true,
    ranged: true,
    ...((named.hasAutoReuse ?? pos[2]) === 'true' ? { autoReuse: true } : {}),
  }),
  // :48458-48470 DefaultToThrownWeapon(int baseProjType, int singleShotTime, float shotVelocity,
  //   bool hasAutoReuse = false)
  DefaultToThrownWeapon: (pos, named, id) => ({
    shoot: evalCallArg(pos[0], id),
    useTime: evalCallArg(pos[1], id),
    useAnimation: evalCallArg(pos[1], id),
    shootSpeed: evalCallArg(pos[2], id),
    noMelee: true,
    ranged: true,
    consumable: true,
    ...((named.hasAutoReuse ?? pos[3]) === 'true' ? { autoReuse: true } : {}),
  }),
  // DefaultToSpear(int projType, float pushForwardSpeed, int animationTime)（:48470 起段）
  //   体: useAnim=useTime=31 后 `useAnimation = (useTime = animationTime);` 链式覆写 →
  //   终值=animationTime;noUseGraphic/UseSound Item1 走既有 helper 体扫描。
  DefaultToSpear: (pos, _named, id) => ({
    shoot: evalCallArg(pos[0], id),
    shootSpeed: evalCallArg(pos[1], id),
    useTime: evalCallArg(pos[2], id),
    useAnimation: evalCallArg(pos[2], id),
    noMelee: true,
    melee: true,
  }),
  // :48433-48442 DefaultToMagicWeapon(int projType, int singleShotTime, float shotVelocity,
  //   bool hasAutoReuse = false)
  DefaultToMagicWeapon: (pos, named, id) => ({
    shoot: evalCallArg(pos[0], id),
    useTime: evalCallArg(pos[1], id),
    useAnimation: evalCallArg(pos[1], id),
    shootSpeed: evalCallArg(pos[2], id),
    noMelee: true,
    magic: true,
    ...((named.hasAutoReuse ?? pos[3]) === 'true' ? { autoReuse: true } : {}),
  }),
  // :48016-48023 DefaultToStaff(int projType, float pushForwardSpeed, int singleShotTime,
  //   int manaPerShot) = DefaultToMagicWeapon(proj, t, v, hasAutoReuse: true) + mana
  //   + width/height + UseSound Item43（委托实参位重排:v=pushForwardSpeed）
  DefaultToStaff: (pos, _named, id) => ({
    shoot: evalCallArg(pos[0], id),
    useTime: evalCallArg(pos[2], id),
    useAnimation: evalCallArg(pos[2], id),
    shootSpeed: evalCallArg(pos[1], id),
    mana: evalCallArg(pos[3], id),
    noMelee: true,
    magic: true,
    autoReuse: true,
  }),
  // ★刀J 根修 c（BJ408 债#1 鞭系,2026-09-30）:47811-47828 DefaultToWhip(int projectileId,
  //   int dmg, float kb, float shootspeed, int animationTotalTime = 30)——18 鞭全数值
  //   在形参（此前 combat 表仅 noUseGraphic 一键,BJ408 以 vanilla-whips.json 在前缀链
  //   定点回填,本刀后 combat 表原生全值;vanilla-whips.json 18 件已 recon 闸门对拍=
  //   两源同值）。体赋值:useAnim=useTime=animationTotalTime(缺省 30)/noMelee/summon/
  //   noUseGraphic+UseSound Item152（后两者走既有三通道）;autoReuse=false 缺省不注入
  //   （照 SetWeaponValues 2 参判例）。
  DefaultToWhip: (pos, _named, id) => ({
    shoot: evalCallArg(pos[0], id),
    damage: evalCallArg(pos[1], id),
    knockBack: evalCallArg(pos[2], id),
    shootSpeed: evalCallArg(pos[3], id),
    useTime: evalCallArg(pos[4], id) ?? 30,
    useAnimation: evalCallArg(pos[4], id) ?? 30,
    noMelee: true,
    summon: true,
  }),
};
/** 调用点 → 基座字段（fill-when-undefined 消费）。实参拆分:具名 `hasAutoReuse:`
 *  摘出,其余按位;25 调用点全 census 具名只有 hasAutoReuse 一名。 */
function callEffectOf(name, argText, id) {
  const spec = DEFAULT_TO_PARAMS[name];
  if (!spec) return null;
  const pos = [];
  const named = {};
  for (const p of splitCallArgs(argText)) {
    const nm = /^([a-z]\w*)\s*:\s*(.+)$/.exec(p);
    if (nm) named[nm[1]] = nm[2].trim();
    else pos.push(p);
  }
  return spec(pos, named, id);
}

/** 深度 0 行里的辅助函数调用效果（显式赋值优先——源序近似：case 体先 DefaultTo*
 *  后覆盖的常态成立；DefaultToFood 的 useGulpSound 具名参数改写音效） */
function helperEffectsOf(lines) {
  const eff = {};
  for (const l of lines) {
    const cm = l.match(/^(DefaultTo\w+|MakeUsable\w+|SetShopValues|SetWeaponValues)\s*\(/);
    if (!cm) continue;
    const h = HELPER_EFFECTS.get(cm[1]);
    if (!h) continue;
    for (const [k, v] of Object.entries(h)) {
      if (eff[k] === undefined) eff[k] = v;
    }
    // DefaultToFood 的 if/else 双分支在体内首匹配会拿到 if 支 Item3（:48161-48168）——
    // 具名参数定真值：useGulpSound:true → Item3（仰饮），否则 Item2（咀嚼）
    if (cm[1] === 'DefaultToFood') {
      eff.useSound = /useGulpSound\s*:\s*true/.test(l) ? 'Item_3' : 'Item_2';
    }
  }
  return eff;
}

/** UseSound 侧道：显式行（后写者胜）> 辅助函数效果；undefined = 本块未涉及 */
function soundOfLines(lines) {
  let sound;
  for (const l of lines) {
    const m = l.match(/^UseSound = (SoundID\.\w+|null);/);
    if (m) sound = m[1] === 'null' ? null : soundNameOf(m[1]);
  }
  if (sound !== undefined) return sound;
  const eff = helperEffectsOf(lines);
  return eff.useSound;
}

const literal = new Map(); // id -> rec（字面 case）
const delegates = [];      // id, targetId, rec, sound
const groupShared = new Map(); // 组首 id → 共享体字段（goto case 别名族回补用）
const groupSharedSound = new Map(); // 组首 id → 共享体 UseSound（同上）
const SOUND = new Map();   // id → UseSound 表值（null = 显式静音，写表时剔除）
function fieldsFromLines(id, lines) {
  const rec = {};
  for (const f of NUM_FIELDS) {
    // 表达式形如 `shoot = 541 + type - 3278;`（悠悠球族批量投射物）——按 id 求值
    const eLine = lines.find((l) => new RegExp(`^${f} = (-?\\d+)\\s*\\+\\s*type\\s*-\\s*(\\d+);`).test(l));
    if (eLine) {
      const em = eLine.match(new RegExp(`^${f} = (-?\\d+)\\s*\\+\\s*type\\s*-\\s*(\\d+);`));
      rec[f] = Number(em[1]) + id - Number(em[2]);
      continue;
    }
    const line = lines.find((l) => new RegExp(`^${f} = -?[\\d.]+f?;`).test(l) || (f === 'useAmmo' && /^useAmmo = AmmoID\.\w+;/.test(l)) || (f === 'ammo' && /^ammo = AmmoID\.\w+;/.test(l)));
    if (!line) continue;
    const am = line.match(/AmmoID\.(\w+)/);
    rec[f] = am ? (AMMO_ID[am[1]] ?? -1) : parseFloat(line.match(/-?[\d.]+/)[0]);
  }
  for (const f of BOOL_FIELDS) {
    if (lines.some((l) => l === `${f} = true;`)) rec[f] = true;
    else if (lines.some((l) => l === `${f} = false;`)) rec[f] = false;
  }
  // ★SetWeaponValues 形参解析（提取器盲区补,2026-09-18 旅商帽掉落实报红蓝批）：
  //   `public void SetWeaponValues(int dmg, float knockback, int bonusCritChance = 0)`
  //   （Item.cs:48418-48423,赋值全在形参——helper 扫描拿不到字面,NUM_FIELDS 直派
  //   `damage = N;` 正则全空）。SetDefaults5 内 17 处调用 → 14 件整批漏
  //   damage/knockBack：4058/4059 化石镐(8,5f)/(8,4f)/4060 超级星射手(60,5f)/
  //   4061 风暴矛(14,6f)/4062 雷电zap(24,3f)/4317 血腥斧(30,7f)/4381 血雨弓(14,3f)/
  //   4788-4790 马枪三件(60,12f)/(130,14f)/(90,13f)/5129 臭虫剑 Flymeal(15,5f)/
  //   6155(150,10f,+10 crit)/6171(27,6f)/6173(180,4f)（6155/6171/6173=1457 新增档,
  //   1456 无此三件）。实报面：5129 缺 damage → 近战 meleeDmg 落 fallback 1 伤
  //   （原版 15−镇民防×0.5≈7/击）,wiki 推荐的商贩帽（2222,旅商 368 必掉）获取法
  //   被城镇 NPC 回血(~+1/18t)抵消=事实杀不死。显式行优先序：NUM_FIELDS 直派先跑,
  //   此处仅补空（防同 case 双写时逆序覆盖——C# 源序语义,17 处调用无同 case 双写）。
  //   3 参调用才写 crit（2 参调用 C# 缺省 0 等价表缺省,不注入减 diff）。
  //   ★重产警告已解除（2026-09-18 反哺批）：原登记三面（1254/1553 crit+=、1226
  //   useTime 别名、4703 DefaultToRangedWeapon 形参位）均已反哺进本脚本解析面
  //   （见文件头注①②③）——整表重产不再回退已提交值（dry-run 对拍零损失）。
  // ★crit += N 累加形态（反哺批头注①）：C# crit 字段缺省 0 起按序累加,块内字面
  //   `crit = N;` 为赋值语义（重置）。仅含 += 的块进入（纯字面块不进此支,维持
  //   NUM_FIELDS find() 首匹配语义零漂移）——产出后 SetWeaponValues 补空让位
  //  （现无同块双写形态,源序语义已核）。
  {
    let critVal = 0;
    let sawPlus = false;
    let sawAny = false;
    for (const l of lines) {
      let m = /^crit = (-?[\d.]+)f?;$/.exec(l);
      if (m) { critVal = Number(m[1]); sawAny = true; continue; }
      m = /^crit \+= (-?[\d.]+)f?;$/.exec(l);
      if (m) { critVal += Number(m[1]); sawAny = true; sawPlus = true; }
    }
    if (sawPlus && sawAny && rec.crit === undefined) rec.crit = critVal;
  }
  // ★useTime = useAnimation 别名赋值（反哺批头注②,1457 形态）：取别名行【之前】
  //  的 useAnimation 字面（C# 顺序语义;find() 首匹配与 NUM_FIELDS 同口径）。
  //  1226（:15125,useAnimation=32 :15124）→ 32;4241（:35613）的 useAnimation 在
  //  DefaultToPlaceableTile helper 体（=15）,helper 体字段面未建,不解析（头注④登记）。
  if (rec.useTime === undefined) {
    const aliasAt = lines.findIndex((l) => /^useTime = useAnimation;$/.test(l));
    if (aliasAt >= 0) {
      const ua = lines.slice(0, aliasAt + 1).find((l) => /^useAnimation = (-?[\d.]+)f?;$/.test(l));
      if (ua) rec.useTime = parseFloat(ua.match(/-?[\d.]+/)[0]);
    }
  }
  // ★刀J 根修 b（BJ408 债#2 同族,2026-09-30）：链式/复合/除式赋值三形态（源序遍历）——
  //   · `useAnimation = (useTime = 24);` 解括号双赋值（1296 Razorpine :16035 / 1345
  //     :16651 / 2350 :23648 / 4870 / 4715 :38758——两字段同值;★清偿刀 P4 锚勘误
  //     2026-09-30:旧引 :16040/:23621 漂移,1457 亲读复核）;
  //   · `useTime /= 2;` 复合除（4715 :38759——作用于【本块先前】链式值 12→6,终值
  //     useTime 6/useAnimation 12）;
  //   · `useTime = useAnimation / 5;` 除式（4722 :38801 / 4956 :40011 / 5669 :44557
  //     ——取本行之前的 useAnimation 字面 35|30,与 useTime 别名 pass 同口径;除数
  //     全 int 精除恰尽）。
  //   fill-when-undefined：字面 pass 已收的字段不覆写（现无同块双写,防逆序覆盖
  //   同 SetWeaponValues 判例）。
  {
    const chain = {};
    let uaLit;
    for (const l of lines) {
      let m = /^(\w+) = \((\w+) = (-?[\d.]+)f?\);$/.exec(l);
      if (m && NUM_FIELDS.includes(m[1]) && NUM_FIELDS.includes(m[2])) {
        const v = Number(m[3]);
        if (rec[m[1]] === undefined) rec[m[1]] = v;
        chain[m[2]] = v;
        continue;
      }
      m = /^(\w+) \/= (-?[\d.]+)f?;$/.exec(l);
      if (m && chain[m[1]] !== undefined) { chain[m[1]] = chain[m[1]] / Number(m[2]); continue; }
      m = /^useAnimation = (-?[\d.]+)f?;$/.exec(l);
      if (m) { uaLit = parseFloat(m[1]); continue; }
      m = /^useTime = useAnimation \/ ([\d.]+)f?;$/.exec(l);
      if (m && rec.useTime === undefined && uaLit !== undefined) rec.useTime = uaLit / parseFloat(m[1]);
    }
    for (const [f, v] of Object.entries(chain)) {
      if (rec[f] === undefined) rec[f] = v;
    }
  }
  const swv = lines.find((l) => /^SetWeaponValues\(/.test(l));
  if (swv) {
    const sm = swv.match(/^SetWeaponValues\(\s*(-?\d+)\s*,\s*(-?[\d.]+)f?\s*(?:,\s*(-?\d+)\s*)?\)/);
    if (sm) {
      if (rec.damage === undefined) rec.damage = Number(sm[1]);
      if (rec.knockBack === undefined) rec.knockBack = parseFloat(sm[2]);
      if (sm[3] !== undefined && rec.crit === undefined) rec.crit = Number(sm[3]);
    }
  }
  // ★DefaultTo* 武器族形参位解析（反哺批头注③）：调用点实参 → combat 字段,
  //  fill-when-undefined（字面 pass/SetWeaponValues 先跑;25 调用点的重叠字面均在
  //  调用之后——6152 `useTime = 4;`/6173 `useTime = 6;`/5629·4682·4702 `ranged =
  //  false;` 显式覆写语义由先跑的字面保有,与 C# 源序终值一致）。金标对拍:
  //  EXTRACT_PATCH（vanillaItemCombat.ts）/THROWN_WEAPONS（本文件 main 手补表）/
  //  obj['5065']/json 4703 逐字段全等见 dry-run。
  for (const l of lines) {
    const cm = /^(DefaultTo(?:RangedWeapon|Bow|ThrownWeapon|Spear|Staff|MagicWeapon|Whip))\s*\((.*)\);\s*$/.exec(l);
    if (!cm) continue;
    const paramEff = callEffectOf(cm[1], cm[2], id);
    if (paramEff) {
      for (const [k, v] of Object.entries(paramEff)) {
        if (v !== undefined && rec[k] === undefined) rec[k] = v;
      }
    }
  }
  // 辅助函数族效果：显式行在场则显式胜（DefaultToPlaceableTile 后再 useTurn=false 之类）
  const eff = helperEffectsOf(lines);
  for (const [k, v] of Object.entries(eff)) {
    if (typeof v === 'boolean' && rec[k] === undefined) rec[k] = v;
  }
  return rec;
}
function applyRec(id, lines) {
  const rec = fieldsFromLines(id, lines);
  const sound = soundOfLines(lines);
  if (sound !== undefined) SOUND.set(id, sound);
  // ★清偿刀 M 根修（清偿刀 F 新立债#2,2026-09-29）：委托行判据【先于】早退门。
  //   「纯委托 alias」精确判据 = 本块含 SetDefaultsN(M) 委托行 && rec 空 && sound
  //   undefined——本体只有 type/glowMask/width/height/useStyle 等非 combat 域字段
  //   （combat 域 = NUM_FIELDS∪BOOL_FIELDS + UseSound 侧道,均不入 rec/sound）,
  //   整件战斗身份全在基底 M。原序（早退门在前）把这类件整件吞掉——连 delegates
  //   都不进,月主九挥砍件（2777/2780/2781/2782/2785/2786/3462/3465/3466,本体
  //   `SetDefaults3(N); type=X; glowMask=M;`） combat+sound 双缺根因。
  //   修后:纯 alias 先进 delegates 链,委托展开（合并循环）继承基底全字段/UseSound;
  //   「早退判定移到委托展开后」由两条机制兑现——①target 可解析→基底终态全拷入表;
  //   ②target 无记录→件不入表且 --audit X-02 unresolved-target 报红（fail-loud,
  //   非静默早退）。既有路径行为零变化（rec/sound 任一非空的委托件原就进链）。
  const dl = lines.find((l) => /^SetDefaults\d?\(\d+\);/.test(l));
  if (dl) {
    // ★targetId 取括号内模板号（`/\d+/` 会先抓到 SetDefaultsN 的方法号 N——
    //   七金属短剑 SetDefaults1(6) 曾全部继承成 item 1(铁镐)的基底,
    //   autoReuse:true/shootSpeed 缺即此坑,2026-08-13"铜剑变投掷"根因链）
    delegates.push({ id, targetId: parseInt(dl.match(/\((\d+)\)/)[1], 10), rec, sound });
    return;
  }
  if (!Object.keys(rec).length && sound === undefined) return;
  // 同 id 多处赋值（分段 switch/嵌套覆盖可能重复）：合并（后者覆盖）
  if (Object.keys(rec).length) literal.set(id, { ...(literal.get(id) || {}), ...rec });
}
for (const body of bodies) {
  for (const { ids, block } of parseSwitch(body)) {
    const lines = depth1Lines(block);
    const shared = fieldsFromLines(ids[0], lines);
    if (Object.keys(shared).length) groupShared.set(ids[0], shared);
    const sharedSound = soundOfLines(lines);
    if (sharedSound !== undefined) groupSharedSound.set(ids[0], sharedSound);
    // 贯穿组：共享体赋给组内全部 id
    for (const id of ids) applyRec(id, lines);
    // 嵌套 switch(type)：按其自身 id 合并（悠悠球 per-id damage/shoot 在这里）
    for (const { id, block: nb } of nestedSwitchCases(block)) {
      applyRec(id, depth1Lines(nb));
    }
    // 嵌套 `if (type == K)` 单守卫覆盖：仅守卫 id 属于本 case 组才合并
    //（防跨组污染;else 分支体不归属任何 id,跳过）
    for (const { id, block: nb } of nestedTypeIfCases(block)) {
      if (!ids.includes(id)) continue;
      applyRec(id, depth1Lines(nb));
    }
  }
  // `default: if (type < A || type > B) break; goto case T;` —— 区间 A..B 别名进 T 组
  //（悠悠球 3315-3317 goto case 3262：吃 T 组共享体 + 自身嵌套 case 覆盖）
  for (const gm of body.matchAll(/if\s*\(type\s*<\s*(\d+)\s*\|\|\s*type\s*>\s*(\d+)\)\s*\{\s*break;\s*\}\s*goto\s+case\s*(\d+);/g)) {
    const [lo, hi, target] = [+gm[1], +gm[2], +gm[3]];
    const shared = groupShared.get(target) || groupShared.get([...groupShared.keys()].find((k) => Math.abs(k - target) < 30)) || null;
    if (!shared) continue;
    const sharedSound = groupSharedSound.get(target) ?? groupSharedSound.get([...groupSharedSound.keys()].find((k) => Math.abs(k - target) < 30)) ?? undefined;
    for (let id = lo; id <= hi; id++) {
      literal.set(id, { ...shared, ...(literal.get(id) || {}) });
      if (!SOUND.has(id) && sharedSound !== undefined) SOUND.set(id, sharedSound);
    }
  }
}

// ---- default: 兜底臂守卫链补扫（三通道专用，legacy 字段不走此路防漂移）----
// 1456 惯用法：default 臂内 `if (type < A || type > B) { switch… / if (type >= X && type <= Y) {…} }`
// 守卫链——主循环把 default 臂并入末 case 组，nestedTypeIfCases 的 ids.includes 守卫
// 会拒收区间 id（墙族 2652-2690 / 旗帜床单族等整段缺失）。case 命中的 id 不走 default 臂
// （互斥路径），故此处"仅补空不覆盖"无冲突。
/** 纯 type 条件 if 块深度枚举（对 matched 体递归下钻——守卫 if 的体里还叠着
 *  switch+if 链，非递归扫会整段跳过；非纯条件体不跳过、靠正则自然穿过） */
function typeIfBlocksDeep(text, out) {
  const re = /(?:else\s+)?if\s*\(/g;
  let m;
  while ((m = re.exec(text))) {
    let d = 0, condEnd = -1;
    for (let i = m.index + m[0].length - 1; i < text.length; i++) {
      if (text[i] === '(') d++;
      else if (text[i] === ')') { d--; if (d === 0) { condEnd = i + 1; break; } }
    }
    if (condEnd < 0) break;
    const cond = text.slice(m.index + m[0].length - 1, condEnd);
    if (/\bType\b/.test(cond)) { re.lastIndex = condEnd; continue; }
    const stripped = cond.replace(/\btype\b/g, '');
    if (!/^[\s\d()&|=<>!*]+$/.test(stripped)) { re.lastIndex = condEnd; continue; }
    let fn;
    try { fn = new Function('type', `return (${cond});`); } catch { re.lastIndex = condEnd; continue; }
    const braceAt = text.indexOf('{', condEnd);
    if (braceAt < 0 || text.slice(condEnd, braceAt).trim() !== '') { re.lastIndex = condEnd; continue; }
    let depth = 0, close = braceAt;
    for (let i = braceAt; i < text.length; i++) {
      if (text[i] === '{') depth++;
      else if (text[i] === '}') { depth--; if (depth === 0) { close = i; break; } }
    }
    const inner = text.slice(braceAt + 1, close);
    out.push({ fn, inner });
    typeIfBlocksDeep(inner, out);
    re.lastIndex = close + 1;
  }
}
for (const body of bodies) {
  const blocks = [];
  typeIfBlocksDeep(body, blocks);
  for (const { fn, inner } of blocks) {
    const lines = depth1Lines(stripOuterBrace(inner));
    const eff = helperEffectsOf(lines);
    const explicit = (f) => (lines.includes(`${f} = true;`) ? true : lines.includes(`${f} = false;`) ? false : undefined);
    const ut = explicit('useTurn') ?? eff.useTurn;
    const ng = explicit('noUseGraphic') ?? eff.noUseGraphic;
    const snd = soundOfLines(lines);
    if (ut === undefined && ng === undefined && snd === undefined) continue;
    for (let id = 0; id <= 5500; id++) {
      let hit = false;
      try { hit = !!fn(id); } catch { hit = false; }
      if (!hit) continue;
      const cur = literal.get(id);
      if (cur === undefined) {
        const rec = {};
        if (ut !== undefined) rec.useTurn = ut;
        if (ng !== undefined) rec.noUseGraphic = ng;
        if (Object.keys(rec).length) literal.set(id, rec);
        if (snd !== undefined) SOUND.set(id, snd);
      } else {
        if (ut !== undefined && cur.useTurn === undefined) cur.useTurn = ut;
        if (ng !== undefined && cur.noUseGraphic === undefined) cur.noUseGraphic = ng;
        if (snd !== undefined && !SOUND.has(id)) SOUND.set(id, snd);
      }
    }
  }
}

// ---- ★刀J 根修 d（BJ408 债#2 同族,2026-09-30）：守卫链数值面（父域谓词收窄递归）----
// default 臂纯 type 条件 if/else 块的【数值】赋值——上方守卫链补扫只取三通道
// （useTurn/noUseGraphic/UseSound）,damage/knockBack/useTime/useAnimation/mana 等
// NUM_FIELDS 全漏。实报面（census:Terarria1457 六体全量;★清偿刀 P4 锚勘误 2026-09-30:
//   旧引 :23120-23137/:23140-23159 漂移,1457 亲读复核实锚如下）：
//   · 2320 战锤（if (type == 2320) :23100-23117 全武器面 damage24/kb6/anim24/time14/
//     scale1.05/melee——SwordsHammersAxesPicks 成员=前缀池压缩同病）;
//   · 2421/2422 钓竿对（if (type >= 2421 && type <= 2422) :23075-23098 共享
//     anim8/time8/shoot 算式 + :23084-23097 if(2421) else 臂 2422 shootSpeed16.5
//     ——else 臂须父域谓词取非）;
//   · 约三百件可放置族（1479-1722/2055-2155/2254-2264/2376-2449/2631-2690/2792-2794/
//     3638-3916 等 anim15/time10|7 与 1977-1986 药水族 anim17/time17）——useTime 为
//     放置节奏面,useAnimation 为放置挥动动画面（ApplyItemAnimation createTile 档）。
// 语义：父域谓词收窄（then=父∧fn / else=父∧¬fn）逐 id 精确归属;仅补空不覆盖
//（case 字面/委托/别名先跑的字段保有——守卫链 id 与 case id 互斥,理论无冲突,
//  fill-when-undefined 为防御性）。递归下钻与三通道补扫同构;`N + type - M` 算式
//  行由 fieldsFromLines 既有 eLine 通道求值。
function guardNumericWalk(text, scopeFn, out) {
  const re = /(?:else\s+)?if\s*\(/g;
  let m;
  while ((m = re.exec(text))) {
    let d = 0, condEnd = -1;
    for (let i = m.index + m[0].length - 1; i < text.length; i++) {
      if (text[i] === '(') d++;
      else if (text[i] === ')') { d--; if (d === 0) { condEnd = i + 1; break; } }
    }
    if (condEnd < 0) break;
    const cond = text.slice(m.index + m[0].length - 1, condEnd);
    if (/\bType\b/.test(cond)) { re.lastIndex = condEnd; continue; }
    const stripped = cond.replace(/\btype\b/g, '');
    if (!/^[\s\d()&|=<>!*]+$/.test(stripped)) { re.lastIndex = condEnd; continue; }
    let fn;
    try { fn = new Function('type', `return (${cond});`); } catch { re.lastIndex = condEnd; continue; }
    const braceAt = text.indexOf('{', condEnd);
    if (braceAt < 0 || text.slice(condEnd, braceAt).trim() !== '') { re.lastIndex = condEnd; continue; }
    let depth = 0, close = braceAt;
    for (let i = braceAt; i < text.length; i++) {
      if (text[i] === '{') depth++;
      else if (text[i] === '}') { depth--; if (depth === 0) { close = i; break; } }
    }
    const inner = text.slice(braceAt + 1, close);
    const thenPred = (id) => { try { return scopeFn(id) && !!fn(id); } catch { return false; } };
    // else 臂定位（紧随其后的 else {）——谓词取非
    let eb = close + 1;
    while (eb < text.length && /\s/.test(text[eb])) eb++;
    let elseInner = null;
    let stopAt = close + 1;
    if (text.startsWith('else', eb)) {
      let p = eb + 4;
      while (p < text.length && /\s/.test(text[p])) p++;
      if (text[p] === '{') {
        let d2 = 0, e2 = p;
        for (let i = p; i < text.length; i++) {
          if (text[i] === '{') d2++;
          else if (text[i] === '}') { d2--; if (d2 === 0) { e2 = i; break; } }
        }
        elseInner = text.slice(p + 1, e2);
        stopAt = e2 + 1;
      } else stopAt = p;
    }
    re.lastIndex = stopAt;
    out.push({ pred: thenPred, lines: depth1Lines(inner) });
    guardNumericWalk(inner, thenPred, out);
    if (elseInner !== null) {
      const elsePred = (id) => { try { return scopeFn(id) && !fn(id); } catch { return false; } };
      out.push({ pred: elsePred, lines: depth1Lines(elseInner) });
      guardNumericWalk(elseInner, elsePred, out);
    }
  }
}
for (const body of bodies) {
  const regions = [];
  guardNumericWalk(body, () => true, regions);
  for (const { pred, lines } of regions) {
    if (!lines.some((l) => NUM_FIELDS.some((f) => new RegExp(`^${f}\\s*=`).test(l))
      || BOOL_FIELDS.some((f) => l === `${f} = true;` || l === `${f} = false;`))) continue;
    for (let id = 0; id <= 5500; id++) {
      if (!pred(id)) continue;
      const rec = fieldsFromLines(id, lines);
      if (!Object.keys(rec).length) continue;
      const cur = literal.get(id);
      const merged = { ...(cur ?? {}) };
      for (const [k, v] of Object.entries(rec)) if (merged[k] === undefined) merged[k] = v;
      literal.set(id, merged);
    }
  }
}

// ---- 守卫补集尾段（guard complement）补丁 ----
// SetDefaults3 `if (type < 2192 || type > 2198) { 守卫链 }` 尾段（Item.cs:27602-27630）
// 为守卫补集服务：2192-2198（遗物族,守卫外直落尾段）+ 2203/2204（守卫内 case 空组
// break 贯穿到尾段）吃 `useTurn = true`。全文件仅此一处守卫+尾段带三通道
// （SetDefaults4 3315-3317 是 goto case 别名,走既有别名通道），按源码固化。
for (const id of [2192, 2193, 2194, 2195, 2196, 2197, 2198, 2203, 2204]) {
  const cur = literal.get(id);
  if (cur === undefined) literal.set(id, { useTurn: true });
  else if (cur.useTurn === undefined) cur.useTurn = true;
}

// ---- SetFoodDefaults（Item.cs:47653）：仅三通道（食物族不进 combat 表，
//      useTurn=true（DefaultToFood/DefaultToHealingPotion）与 UseSound Item2/3 走侧道）----
const FOOD_USETURN = new Map();
{
  const foodBody = methodBody('void SetFoodDefaults(');
  for (const { ids, block } of parseSwitch(foodBody)) {
    const lines = depth1Lines(stripOuterBrace(block));
    const eff = helperEffectsOf(lines);
    const sound = soundOfLines(lines);
    // 显式 useTurn/noUseGraphic 行可覆盖辅助效果
    if (lines.includes('useTurn = true;')) eff.useTurn = true;
    if (lines.includes('useTurn = false;')) eff.useTurn = false;
    if (lines.includes('noUseGraphic = true;')) eff.noUseGraphic = true;
    for (const id of ids) {
      if (eff.useTurn === true) FOOD_USETURN.set(id, true);
      if (sound !== undefined && !SOUND.has(id)) SOUND.set(id, sound);
    }
  }
}

// ---- 委托合并（迭代至收敛，处理委托链） ----
// 与既有记录合并（非覆盖）：goto 别名族/嵌套 case 先写入的字段不能被委托基底冲掉
const data = new Map(literal);
for (let round = 0; round < 4; round++) {
  for (const d of delegates) {
    const base = data.get(d.targetId);
    if (base) data.set(d.id, { ...data.get(d.id), ...base, ...d.rec });
    if (d.sound === undefined && SOUND.has(d.targetId)) SOUND.set(d.id, SOUND.get(d.targetId));
  }
}

export const EXTRA_USETURN = (() => {
  const m = new Map(FOOD_USETURN);
  for (const [id, rec] of data) if (rec.useTurn === true) m.set(id, true);
  return m;
})();

// 库模式出口(recon-item-1456-1457.mjs 三方对账用):当前 SRC_VER 的 combat 记录与
// UseSound 侧道表。Map<string id, rec>;直接跑本文件仍写 1456 基线产物,行为不变。
export const COMBAT_DATA = data;
export const COMBAT_SOUND = SOUND;

// ---- 自审计(--audit):与提取同源,防"提取器坏了但没人发现"(2026-08-13 targetId
//      错基底=铜剑丢出去,曾静默 44/2612 件错数据) ----
function main() {
  // 委托异常检测:X-01 自委托 / X-02 target 无字面记录 / X-03 链深>2 /
  // X-04 委托数基数护栏(解析器结构漂移后委托静默归零=bug#2 发生机制)
  const audit = [];
  for (const d of delegates) {
    if (d.id === d.targetId) audit.push({ kind: 'self-delegate', id: d.id, target: d.targetId });
    if (!literal.has(d.targetId)) audit.push({ kind: 'unresolved-target', id: d.id, target: d.targetId });
  }
  if (delegates.length < 20) audit.push({ kind: 'delegate-count-below-floor', delegates: delegates.length });
  // X-05/X-06/X-07:三通道基数护栏（解析结构漂移后新列静默归零=半坏状态无人察觉）
  let useTurnTrue = 0, noUseGraphicTrue = 0;
  for (const rec of data.values()) {
    if (rec.useTurn === true) useTurnTrue++;
    if (rec.noUseGraphic === true) noUseGraphicTrue++;
  }
  if (useTurnTrue < 1300) audit.push({ kind: 'useturn-below-floor', count: useTurnTrue });
  if (noUseGraphicTrue < 180) audit.push({ kind: 'nousegraphic-below-floor', count: noUseGraphicTrue });
  const soundEntries = [...SOUND.entries()].filter(([, v]) => v !== null && v !== undefined);
  if (soundEntries.length < 550) audit.push({ kind: 'usesound-below-floor', count: soundEntries.length });

  const obj = {};
  for (const [k, v] of data) obj[k] = v;
  // 手工回填（提取器盲区,2026-08-22 召唤/事件审计——重生成后不得丢失）：
  //  · 544/556/557 机械三王召唤物：赋值在 `if (Variant != DisabledBossSummonVariant)`
  //    块内（深度 2,Item.cs:7855-7862/:7987-7994/:8000-8007）,深度 1 扫描漏收
  //    ——useStyle 4/consumable/useAnimation 45/useTime 45
  //  · 2350 回归药水手补面退役（★清偿刀 J 2026-09-30,头注⑦b）：`useTime =
  //    (useAnimation = 30)` 链式赋值（Item.cs:23648,★P4 锚勘误:旧引 :23621 漂移）
  //    已由根修 b 原生解析,重产
  //    逐字节等价（SW_OUT 沙箱 sha256 复证）——保留会掩蔽根修回归（同 M/Q 刀判例）。
  for (const vid of ['544', '556', '557']) {
    obj[vid] = { useTime: 45, useAnimation: 45, consumable: true };
  }
  //  · 月主委托件 15 件（2026-08-25 r33 蓝队；red-team-r33 §三 P0-①②）：委托段
  //    `SetDefaults3(N)` 本体只有 type/glowMask[/shoot]。★清偿刀 M 根修（2026-09-29）
  //    后 applyRec 委托行判据先于早退门——九挥砍件（rec/sound 双空）与六锯钻
  //    （rec={shoot}）全部原生进 delegates 链,委托合并直出基底终态+本件覆写
  //    （C# 先跑基底再覆写；1458 :26566-26615/:31056-31078,两版同值已对账）。
  //    ★清偿刀 Q（2026-09-29）：六锯钻 LUNAR_DELEGATE 手补面退役（M 退役九挥砍件
  //    后的最后一块月主手补面）——SW_OUT 沙箱重产 vs 现库 sha256 逐字节相等复证
  //    通过,15 件全走委托链单源;保留曾掩蔽 M4 变异判别（链断时六锯钻 combat 被
  //    手补从基底兜底恢复）,退役后 M4 判别面覆盖全 15 件（era-guard 测试复验）。
  //  · 496 冰雪法杖 knockBack=2（:7297 knockBack=0f 后 :7300 再赋 2f——首匹配取 0，
  //    C# 顺序语义终值 2）。
  //  · 纸飞机/新奇品/PrincessWeapon 批次 A 回填：DefaultToThrownWeapon
  //    （:48458-48469 = autoReuse 缺省 false/useStyle1/anim=time=singleShotTime/
  //    noMelee/ranged/consumable）与 DefaultToStaff(:48016 = DefaultToMagicWeapon
  //    (proj,singleShotTime,pushSpeed,autoReuse)+mana+40×40+Item43) 形参赋值。
  //    ★golden 表的 useTime=4/8 系把第三参 shotVelocity 误当 useTime，源码为 17/25/20。
  // ★清偿刀 Q（2026-09-29）：六锯钻 LUNAR_DELEGATE 手补面（2778/2783/3463←base 2773,
  //  2779/2784/3464←base 2774,shoot 429/431/610/430/432/609）整体退役——委托链单源
  //  直出（applyRec 根修后六件 rec={shoot} 原生进 delegates,合并直出与手补逐字节
  //  等价,M 刀 dump 对拍+Q 刀沙箱 sha256 复证）。案由见上方月主委托件注。
  // ★清偿刀 M（2026-09-29）：九挥砍件 combat 手补面退役——applyRec 根修后委托合并
  //  原生直出 obj[2777]={...obj[2772]} 等（值与 F 刀手补逐字节等价,dump 对拍证明）。
  //  保留会掩盖根修回归（M3 变异=摘根修门,若手补在位则九件不缺=变异无判别力）。
  // ★清偿刀 F→M（2026-09-29）：F 刀九件 UseSound 侧道手补面退役——applyRec 根修后
  //  委托合并循环原生继承基底 UseSound（`d.sound===undefined && SOUND.has(targetId)`
  //  → SOUND.set(id, base 的 Item_1;基底显式行 case 2772 :26479 / case 2776 :26540 /
  //  case 2775 :26558,★P4 补 F 基底锚 2026-09-30:六锯钻双基底 case 2773 :26497 /
  //  case 2774 :26518（UseSound=Item23,亲读）,委托链 :26566-26615/:31056-31078）,
  //  与 F 手补逐值等价。
  //  F 刀定谳存档:缺键面=Game.playUseSound→itemUseSoundWav 静默 null=挥砍无声。
  if (obj['496']) obj['496'] = { ...obj['496'], knockBack: 2 };
  const THROWN_WEAPONS = {
    4343: { shoot: 761, useTime: 17, useAnimation: 17, shootSpeed: 5, damage: 4, knockBack: 2 },
    4344: { shoot: 762, useTime: 17, useAnimation: 17, shootSpeed: 5, damage: 4, knockBack: 2 },
    // ranged:false 为源码显式覆盖（4682 :38561 / 4702 :38650 `ranged = false`）
    4682: { shoot: 851, useTime: 25, useAnimation: 25, shootSpeed: 4, ranged: false, noUseGraphic: true },
    4702: { shoot: 855, useTime: 25, useAnimation: 25, shootSpeed: 4, ranged: false, noUseGraphic: true },
    4765: { shoot: 868, useTime: 20, useAnimation: 20, shootSpeed: 8 },
    4766: { shoot: 869, useTime: 20, useAnimation: 20, shootSpeed: 8 },
    5285: { shoot: 996, useTime: 20, useAnimation: 20, shootSpeed: 8 },
  };
  for (const [vid, rec] of Object.entries(THROWN_WEAPONS)) {
    const full = { noMelee: true, ranged: true, consumable: true, autoReuse: false, ...rec };
    obj[vid] = { ...obj[vid], ...full };
  }
  obj['5065'] = { shoot: 950, useTime: 25, useAnimation: 25, shootSpeed: 10, mana: 18,
    damage: 70, knockBack: 5, noMelee: true, magic: true, autoReuse: true };
  //  · 炸弹六件 4824-4827/4908-4909：`shoot = 903 + (type - 4824)` 算术表达式未解析
  //    （Item.cs:39487/:39783）——补 shoot 903-906/910-911（2026-08-22 补 C 审计：
  //    缺 shoot → thrownCombat 返 null 不可投掷）
  const BOMB_SHOOT = { 4824: 903, 4825: 904, 4826: 905, 4827: 906, 4908: 910, 4909: 911 };
  for (const [vid, sh] of Object.entries(BOMB_SHOOT)) {
    obj[vid] = { ...obj[vid], shoot: sh };
  }
  // --dump:全量数据出 stdout 不落盘(recon-item-1456-1457.mjs 双版本对账用——
  //  vitest 的模块运行器按路径缓存忽略 query-string,库模式双实例不可靠,故走子进程)
  if (process.argv.includes('--dump')) {
    const soundOut = {};
    for (const [id, v] of SOUND) if (v !== null && v !== undefined) soundOut[id] = v;
    writeSync(1, JSON.stringify({ src: SRC_VER, items: obj, useSound: soundOut, anomalies: audit }));
    return;
  }
  if (AUDIT) {
    const summary = {
      items: data.size,
      delegates: delegates.length,
      useTurnTrue,
      noUseGraphicTrue,
      useSoundEntries: soundEntries.length,
      edges: delegates.slice(0, 30).map((d) => ({ id: d.id, target: d.targetId })),
      anomalies: audit,
      // 钉死 id 的收敛记录(bug#2 回归锁数据面:3507 铜短剑须带 shoot 938/noMelee/
      // autoReuse false;错取 targetId=1 铁镐时 autoReuse:true 且无 shoot,必翻)
      pinned: Object.fromEntries(['3507', '3509', '1', '99', '40'].map((k) => [k, obj[k] ?? null])),
    };
    process.stdout.write(JSON.stringify(summary));
    process.exit(audit.length ? 1 : 0);
  }
  // ================= ★BJ215 era guard：输出通道三分离（头注见上） =================
  const WRITE_REAL = process.argv.includes('--write-real');
  const SW_OUT = process.env.SW_OUT;
  if (SW_OUT !== undefined && SW_OUT !== '' && WRITE_REAL) {
    console.error('[extract-itemcombat] 拒绝运行：SW_OUT 与 --write-real 双旗互斥（输出通道必须唯一）。');
    console.error('  处置：沙箱对拍用 SW_OUT=<dir>；确认定谳后更新现库用 --write-real（且 SW_ITEM_VER=1457）。');
    process.exit(1);
  }
  if (WRITE_REAL && SRC_VER !== '1457') {
    console.error(`[extract-itemcombat] 拒绝写真库：SW_ITEM_VER=${SRC_VER}≠1457（旧基线重放禁写 game/src/data/vanilla-itemcombat.json）。`);
    console.error('  处置：1456/1458 重放对拍请走 SW_OUT 沙箱；确要回写 1457 终值请去掉 SW_ITEM_VER 显式注入（缺省即 1457）。');
    process.exit(1);
  }
  // ★1457 段合并保留（2026-08-22 防整表重跑丢失）：SRC_VER=1456 时，
  //   1457 专属 id（≥6100,Palworld/1457 配饰族等,1456 Item.cs 无 case）从现表原样
  //   并回——否则 1456 档重产会把 50 条 1457 条目整段抹掉。1457 档（SW_ITEM_VER=1457）
  //   天然全量产出,不进此分支。recon --fix 是字段级合并不受影响。
  if (SRC_VER === '1456') {
    let prev = null;
    try { prev = JSON.parse(readFileSync(`${ROOT}/game/src/data/vanilla-itemcombat.json`, 'utf8')); } catch { /* 首次生成无旧表 */ }
    if (prev) {
      let merged = 0;
      for (const [k, v] of Object.entries(prev)) {
        if (Number(k) >= 6100 && obj[k] === undefined) { obj[k] = v; merged++; }
      }
      if (merged > 0) console.error(`[extract-itemcombat] 1456 档重产:合并保留 1457 段 ${merged} 条`);
    }
  }
  const soundOut = {};
  for (const [id, v] of SOUND) {
    if (v === null || v === undefined) continue;
    soundOut[id] = v;
  }
  const COMBAT_FRESH = JSON.stringify(obj);
  const SOUND_FRESH = JSON.stringify(soundOut);
  // ★M1 变异锚:干跑臂 null(守卫测试把 null 换成沙箱假现库目录,证明缺省零写盘是唯一拦截面)
  const OUT_DIR = WRITE_REAL ? `${ROOT}/game/src/data`
    : (SW_OUT ? `${SW_OUT.replace(/\/+$/, '')}` : null);
  if (!OUT_DIR) {
    // 缺省干跑对拍（零写盘,B-form）：重产 vs 现库动态 diff——缺键型洗库面非空或值漂移
    // 即 exit 1+物证（BJ215 定谳:bare 1457 重产=现库逐值零漂移,零漂移即放行）
    const liveCombat = existsSync(`${ROOT}/game/src/data/vanilla-itemcombat.json`)
      ? readFileSync(`${ROOT}/game/src/data/vanilla-itemcombat.json`, 'utf8') : null;
    const liveSound = existsSync(`${ROOT}/game/src/data/vanilla-itemusesound.json`)
      ? readFileSync(`${ROOT}/game/src/data/vanilla-itemusesound.json`, 'utf8') : null;
    if (!liveCombat || !liveSound) {
      console.error('[extract-itemcombat] 干跑（零写盘）：现库缺 vanilla-itemcombat/vanilla-itemusesound,跳过对拍。写盘须显式 SW_OUT=<dir> 或 --write-real。');
    } else {
      let prev = null;
      let prevSound = null;
      try { prev = JSON.parse(liveCombat); prevSound = JSON.parse(liveSound); } catch { /* 坏损:对拍跳过 */ }
      if (prev && prevSound) {
        const missing = Object.keys(prev).filter((k) => obj[k] === undefined);
        const soundMissing = Object.keys(prevSound).filter((k) => soundOut[k] === undefined);
        const drift = [];
        const soundDrift = [];
        for (const [k, v] of Object.entries(prev)) {
          if (obj[k] !== undefined && JSON.stringify(obj[k]) !== JSON.stringify(v)) drift.push(k);
        }
        for (const [k, v] of Object.entries(prevSound)) {
          if (soundOut[k] !== undefined && soundOut[k] !== v) soundDrift.push(k);
        }
        if (missing.length || soundMissing.length || drift.length || soundDrift.length) {
          console.error('[extract-itemcombat] 干跑对拍：漂移（零写盘 exit 1）。');
          if (missing.length) console.error(`  vanilla-itemcombat.json 现库 ${missing.length} 键重产盖不住（缺键型洗库面）: ${missing.slice(0, 10).join(', ')}${missing.length > 10 ? '…' : ''}`);
          if (drift.length) console.error(`  combat 值漂移 ${drift.length} 键: ${drift.slice(0, 10).join(', ')}${drift.length > 10 ? '…' : ''}`);
          if (soundMissing.length) console.error(`  vanilla-itemusesound.json 现库 ${soundMissing.length} 键重产盖不住: ${soundMissing.slice(0, 10).join(', ')}`);
          if (soundDrift.length) console.error(`  useSound 值漂移 ${soundDrift.length} 键: ${soundDrift.slice(0, 10).join(', ')}`);
          console.error('  正常更新流：定谳漂移源（新版本段→定谳后 --write-real;错值型→node tools/recon-item-1456-1457.mjs 对账）后再显式写盘。');
          process.exit(1);
        }
        console.error('[extract-itemcombat] 干跑对拍：重产与现库逐值零漂移（零写盘）。写盘须显式 SW_OUT=<dir> 或 --write-real。');
      } else {
        console.error('[extract-itemcombat] 干跑（零写盘）：现库坏损,对拍跳过。');
      }
    }
  } else {
    mkdirSync(OUT_DIR, { recursive: true });
    writeFileSync(`${OUT_DIR}/vanilla-itemcombat.json`, COMBAT_FRESH);
    writeFileSync(`${OUT_DIR}/vanilla-itemusesound.json`, SOUND_FRESH);
    console.error(`[extract-itemcombat] 已写 ${OUT_DIR}/vanilla-{itemcombat,itemusesound}.json（${WRITE_REAL ? '--write-real 真库' : 'SW_OUT 沙箱'}）`);
  }
  const bows = [...data.values()].filter((v) => v.useAmmo === 40);
  const arrows = [...data.values()].filter((v) => v.ammo === 40);
  // ★BJ283 口径勘误：原「共 ${data.size}」=委托合并面——现库终表含手补回填键
  //  （544/556/557/THROWN_WEAPONS 等;★刀J 后 2350/月主 15 已原生,2350 手补退役）,
  //  打印改终表口径。
  console.error(`共 ${Object.keys(obj).length} 物品（终表,含手补回填）/ 弓类 ${bows.length} / 箭类 ${arrows.length}（bows/arrows 系委托合并面统计）`);
  console.error(`useTurn=true ${useTurnTrue} 件 / noUseGraphic=true ${noUseGraphicTrue} 件 / UseSound ${soundEntries.length} 件`);
  console.error('木弓(99):', JSON.stringify(obj['99']));
  console.error('木箭(40):', JSON.stringify(obj['40']));
  console.error('火焰箭(41):', JSON.stringify(obj['41']));
}
// 库模式守卫：被 extract-itemfunc.mjs import 时只暴露 EXTRA_USETURN，不写文件不出审计
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();

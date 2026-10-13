// ★BJ69（2026-09-14）非使用物左键数据门守卫（RB15a 袋豁免集 BOSS_BAG_NO_USE_VIDS 的
// 推广退役刀）。
// 金标：
//  - 起用总门 Player.cs:43064 `controlUseItem && releaseUseItem && itemAnimation==0
//    && item.useStyle != 0`（1458 同域 :43062 diff=same）——useStyle==0 = 非使用物,
//    持用左键零动作（不挥/不响/不耗/不进 useTime）。
//  - useStyle 逐 id 权威 = Terarria1457/Terraria/Item.cs SetDefaults1..5 +
//    SetFoodDefaults（本测试内置执行序仿真提取器：fallthrough 组共享体、嵌套
//    switch(type)、if(type==N) 条件支、DefaultTo* 辅助族 useStyle 种子（DefaultToFood
//    条件于 useGulpSound 实参）、
//    Variant 条件基态口径（FX53：`== EnabledVariant` 恒假/`!= Disabled` 恒真））。
//    ★RB17b note①（2026-09-16）：提取域从「仅 switch(type) 块」推广为【全方法体
//    线性执行】——SetDefaults2/3/4 体存在 35 支顶层区间 if（如 :18300 1479-1494、
//    :18596 1543-1545 漆具、:21236 1977-1986 染发剂 useStyle=9）+1 支补集守卫
//    （:22289）+ 顶层落穿尾支（:27621 `useStyle = 1;`，2192-2198 蜡烛族真值唯一
//    来源）,旧 switch-only 提取器全部漏提（231 vid 真值 0 vs 实值 1/9）,因全部被
//    确定消费支（tile/paintTool/hairDye）接管不入行为断言域而从未爆红=「盲」。
//    封口三哨兵见「RB17b note① 顶层区间支哨兵」describe。
//  - 仓内门数据源 = vanilla-itemfunc.useStyle + Game.NO_USE_STYLE_BACKFILL_1457
//    （fallthrough 组共享体只落组末标签的提取器既有盲区,SW-FX53 族;运行时纠偏
//    先例=items.ts SHARED_GROUP_PLACE_STYLE_1457）。
// 锁面：
//  ①门数据 ≡ Item.cs 真值（6176 件逐 id,双向:误杀面=真值>0∧门=0 / 伪挥面=真值=0∧门>0）
//  ②行为面：updateUse 桩驱动——门静默集（袋 21 件+抽样）一帧零副作用（RB15a 面延续）
//  ③阳性对照：门数据>0 件照常起挥（1874 回填件/1905 表载件）——防"全 miss 恒 0"
//  ④结构锁：updateUse 臂门表达式在位（防静默回退/删除）
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';

import { heldItemUseStyle } from '../src/core/Game';
import { itemFuncOfVid } from '../src/data/vanillaItemFunc';
import vanillaMeta from '../public/sprites/vanilla.json';
import { BOSS_BAG_IDS } from '../src/data/vanillaBossBags';
import { Game } from '../src/core/Game';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { World } from '../src/world/World';
import { TILE } from '../src/core/constants';
import { ITEM_BY_KEY, VANILLA_ITEM_KEY_BY_ID, ITEM_DEFS } from '../src/data/items';
import { newWiresRadialState } from '../src/stats/wiresRadial';

const REPO = join(dirname(__dirname), '..');
const ITEM_CS = readFileSync(join(REPO, 'Terarria1457', 'Terraria', 'Item.cs'), 'utf8');
const LINES = ITEM_CS.split('\n');

// ================= Item.cs useStyle 真值提取器（tools/_bj69-nouse-item-audit.mjs 同构） =================

function methodRange(name: string): [number, number] {
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
  .map((n) => [n, methodRange(n)] as const);

/** DefaultTo* 辅助函数体顶层首个 useStyle 赋值 = 该族 useStyle 种子 */
function helperUseStyle(name: string): number | undefined {
  let r: [number, number];
  try { r = methodRange(name); } catch { return undefined; }
  for (let i = r[0]; i <= r[1]; i++) {
    const m = LINES[i].match(/^\t\tuseStyle = (\d+);/);
    if (m) return +m[1];
  }
  return undefined;
}
const HELPERS: Record<string, number> = {};
for (const n of ['DefaultToPlaceableTile', 'DefaultToPlaceableWall', 'DefaultToCapturedCritter', 'DefaultToFood',
  'DefaultToHealingPotion', 'DefaultToManaPotion', 'DefaultToTorch', 'DefaultToMusicBox', 'DefaultToBanner',
  'DefaultToMonolith', 'DefaultToSeaShell', 'DefaultToGolfBall', 'DefaultToGolfClub', 'DefaultToLawnMower',
  'DefaultToGuitar', 'DefaultToQuestFish', 'DefaultToVoiceOverrideAccessory', 'DefaultToBomb', 'DefaultToSolution',
  'DefaultToWhip', 'DefaultToKite', 'DefaultToVanitypet', 'DefaultToSpear', 'DefaultToBow', 'DefaultToStaff',
  'DefaultToMagicWeapon', 'DefaultToRangedWeapon', 'DefaultToThrownWeapon']) {
  const v = helperUseStyle(n);
  if (v !== undefined) HELPERS[n] = v;
}
expect(Object.keys(HELPERS).length, 'DefaultTo* useStyle 种子表不得为空（提取器面漂移即断）').toBeGreaterThanOrEqual(15);

/** 单个 switch(type) 块的 case 标签组收集（花括号层级感知,不依赖 tab 深度;
 *  连续标签=fallthrough 组共享同一体）。lines 形参=可注入行源（else 链语义哨兵
 *  以合成多行体直测解释器;缺省 LINES,非生产旁路）。 */
function switchCases(from: number, to: number, startLine: number, lines: readonly string[] = LINES): { cases: Array<{ ids: number[]; start: number; end: number }>; bodyEnd: number } {
  let level = 0, bodyEnd = to;
  const cases: Array<{ ids: number[]; start: number; end: number }> = [];
  let curIds: number[] = [], curStart = -1, curEnd = -1;
  const flush = () => {
    if (curStart >= 0) cases.push({ ids: [...curIds], start: curStart, end: curEnd });
    curIds = []; curStart = -1; curEnd = -1;
  };
  for (let k = startLine; k <= to; k++) {
    const opens = (lines[k].match(/{/g) ?? []).length;
    const closes = (lines[k].match(/}/g) ?? []).length;
    const before = level;
    level += opens - closes;
    if (k > startLine && level === 0 && before === 1) {
      if (curStart >= 0) curEnd = k - 1;
      flush();
      bodyEnd = k;
      return { cases, bodyEnd };
    }
    if (level === 1) {
      const cl = lines[k].trim().match(/^(?:case (\d+)|default):\s*$/);
      if (cl) {
        if (curStart >= 0 && curEnd >= curStart) flush();
        curIds.push(cl[1] ? +cl[1] : -1);   // -1 = default 组标签（C# 无 case 命中时执行）
        if (curStart < 0) { curStart = k + 1; curEnd = k; }
        continue;
      }
      if (curStart >= 0) curEnd = k;
    } else if (curStart >= 0 && level >= 2) {
      curEnd = k;
    }
  }
  flush();
  return { cases, bodyEnd };
}

/** 条件支判定（`if (type == N)` 单行头 + Variant 基态口径） */
type Cond = { kind: 'eq'; id: number } | { kind: 'variant'; applies: boolean } | null;

/** if 头谓词求值：type 代 vid、Variant 条件按基态口径（FX53：`== X` 恒假/`!= X`
 *  恒真）；可解=布尔,不可解（Main.* 等外部态）=null（乐观真——保守向「真值>0」
 *  倾斜,误杀面不因求解失败而漏报）。 */
function evalCond(head: string, vid: number): boolean | null {
  const expr = head.replace(/^if\s*\(/, '').replace(/\)\s*$/, '').trim();
  if (/Variant\s*==/.test(expr) || /Variant\s*!=/.test(expr)) {
    const isNe = /Variant\s*!=/.test(expr);
    if (/\btype\b|Main\.|NPC\.|WorldGen\./.test(expr)) return isNe ? true : null;
    return isNe;
  }
  if (!/\btype\b/.test(expr)) return null;
  if (/[^0-9\s()<>=!&|]/.test(expr.replace(/\btype\b/g, ''))) return null;   // 外部标识符=不可解
  const js = expr.replace(/\btype\b/g, String(vid));
  try {
    // eslint-disable-next-line no-new-func
    return !!new Function(`"use strict"; return (${js});`)();
  } catch { return null; }
}

/** case 体执行（花括号条件栈 + 逐深度链态解释器）：
 *  · 嵌套 switch(type) 递归=仅命中该 id 的嵌套组（+default 兜底）生效;
 *  · 条件块栈：useStyle/return/DefaultTo* 仅在【无任何 false 外层条件】时生效
 *    （null=不可解=乐观真）;
 *  · ★C1 复核修复（2026-09-16）else/else-if 链语义：分支闭括号后的 else 系行
 *    （多行形态=1457 全部 else 系的实测形态,单行 `} else` 形态=0）按链入栈——
 *    else 守卫 = 前序各支条件取反之合取;`else if (pred)` 守卫 = 该合取 ∧ pred。
 *    旧版对多行形态整行忽略 → else 体被【无条件采用】。
 *  · ★F4 定谳修复（2026-09-16 红蓝2,探针实证 divergent）：旧版链态=单变量 chain
 *    +栈帧 saved 懒恢复——嵌套构念的内层 else 帧无 saved→外层构念链被内链覆盖
 *    且永不恢复;外层 else 头又取消懒恢复→从陈旧内链求守卫（null=乐观真）→嵌套
 *    混合 `if A{if B{X}else{Y}}else{Z}` 守卫错（探针: vid=50 解释器=9,C#=5）。
 *    红队处方「pendingRestore 存入 else 帧 saved」经模拟不充分（多层闭括号同拍
 *    pop 串灭该 saved;无括号 else 支体不入栈=父 else 仍读陈旧链）,按 C# 语义
 *    落刀=【逐深度链态 chainAt[d]】：d 层 else 系头读 chainAt[d]（=同层前一兄弟
 *    头写入的链态;else 必紧跟其构念闭括号,层间无同层头可改写）;嵌套构念头写
 *    chainAt[d+1] 天然不污染外层——链变量/saved/懒恢复整套机械删除。
 *  · 无括号支体（C# 单语句体;1457 六区实测=0,防御形态回潮）：行首 if/else 头
 *    的守卫经 pendingHead 直施于紧随单条语句（singleOk,false=阻断/null=乐观真）;
 *    同行 `if (…) {` 形态同防（`{` 在位即入栈,谓词先剥尾括号再求值）。
 *    ★BJ112-c（2026-09-17）：无括号体首语句=嵌套 if（`if (A) if (B) X;`）时,内层
 *    构念头叠加外层守卫（A∧B）且悬空 else 归最近未配对 if（内层 else=A∧¬B）——
 *    旧版外层守卫被内层 if 头覆写丢弃;Item.cs 全文件普查该形态=0,纯防御。
 *  · return=true 终止整个方法（同受条件栈门控）。 */
function execCaseBody(vid: number, start: number, end: number, capture: (v: number) => void,
  lines: readonly string[] = LINES): boolean {
  let depth = 0;
  let pendingHead: boolean | null | undefined = undefined;   // 已求值待入栈的分支头
  type ChainState = { accum: boolean | null; lastCond: boolean | null };
  const stack: Array<{ depth: number; pred: boolean | null }> = [];
  const chainAt: Array<ChainState | undefined> = [];   // 逐深度活跃 if/else-if/else 链态（下标=头行所在深度）
  const and3 = (a: boolean | null, b: boolean | null): boolean | null =>
    (a === false || b === false) ? false : (a === null || b === null) ? null : true;
  const not3 = (p: boolean | null): boolean | null => (p === null ? null : !p);
  const closeBrace = (): void => {
    depth--;
    while (stack.length && stack[stack.length - 1].depth > depth) stack.pop();
  };
  const openBlock = (): void => {
    depth++;
    if (pendingHead !== undefined) {
      stack.push({ depth, pred: pendingHead });
      pendingHead = undefined;
    }
  };
  const taken = (): boolean => !stack.some((f) => f.pred === false);   // 任一 false=块未采用
  /** 单条语句守卫（无括号支体）：pendingHead 在位（行首 if/else 头未被 `{` 消费）
   *  时直施于本语句——false=阻断,null=乐观真放行;消费后清除（后续语句出支体）。 */
  const singleOk = (): boolean => {
    if (pendingHead !== undefined) {
      const g = pendingHead;
      pendingHead = undefined;
      if (g === false) return false;
    }
    return taken();
  };
  for (let k = start; k <= end; k++) {
    let s = lines[k].trim();
    if (!s || s.startsWith('//')) continue;              // 空行/注释不消费链态（防注释行插入形态）
    // 单行形态 `} else …`：行首 `}` 先闭前支,余下按 else 头处理（1457 实测=0,防御形态回潮）
    if (s.startsWith('}') && /^}\s*else/.test(s)) { closeBrace(); s = s.replace(/^}/, '').trim(); }
    const mElseIf = s.match(/^else\s+if\s*\(/);
    const isElseHead = !!mElseIf || s === 'else' || /^else\s*\{/.test(s);
    if (isElseHead) {
      const prev = chainAt[depth] ?? { accum: null, lastCond: null };   // 孤立 else（本层无前支）=前链不可解→乐观真
      const accum = and3(prev.accum, not3(prev.lastCond));
      const hadBrace = /\{\s*$/.test(s);                   // 单行形态尾 `{`（else { / else if (…) {）
      if (mElseIf) {
        const cond = evalCond(s.replace(/\{\s*$/, '').replace(/^else\s+if/, 'if'), vid);
        pendingHead = and3(accum, cond);
        chainAt[depth] = { accum, lastCond: cond };
      } else {
        pendingHead = accum;                               // else 守卫=前序全取反之合取
        chainAt[depth] = { accum, lastCond: null };        // else 终结链
      }
      if (hadBrace) openBlock();
      continue;
    }
    if (s === '{') { openBlock(); continue; }
    if (s === '}') { closeBrace(); continue; }
    if (/^if\s*\(/.test(s)) {
      const hadBrace = /\{\s*$/.test(s);                   // 同行 `{` 形态（1457 六区=0,防御）
      const head = hadBrace ? s.replace(/\{\s*$/, '').trim() : s;
      const cond = evalCond(head, vid);
      const outer = pendingHead;
      if (outer !== undefined) {
        // ★BJ112-c（2026-09-17）无括号 if 体首语句=嵌套 if（`if (A) if (B) X;`）：
        //  内层构念头是外层的单语句体——外层守卫不得被覆写丢弃（旧版 pendingHead
        //  直接覆盖=X 仅受内层 B 门,A 假仍误采/null 乐观真放大误采面）。合成 A∧B
        //  作内层体守卫（singleOk 单语句路与 hadBrace 入栈路同源）;chainAt 记
        //  {accum:A, lastCond:B} 使悬空 else 归最近未配对 if（C# 语义）=内层 else
        //  守卫 A∧¬B。边界：三层连环悬空 else（`if A if B if C X; else Y; else Z;`
        //  的 Z 守卫）本式不保——Item.cs 全文件普查=0（2026-09-17 定谳）,哨兵钉
        //  两支构造防回潮。
        pendingHead = and3(outer, cond);
        chainAt[depth] = { accum: outer, lastCond: cond };
      } else {
        pendingHead = cond;
        chainAt[depth] = { accum: true, lastCond: cond };   // 新构念=重置本层链态
      }
      if (hadBrace) openBlock();
      continue;
    }
    // 嵌套 switch(type)：仅执行该 id 命中的嵌套组（+default 兜底），整块跳出
    if (/^\t*switch \(type\)\s*$/.test(lines[k])) {
      if (singleOk()) {
        const { cases, bodyEnd } = switchCases(start, end, k, lines);
        const hit = cases.filter((c) => c.ids.includes(vid));
        const grp = hit.length ? hit : cases.filter((c) => c.ids.includes(-1));
        for (const c of grp) {
          if (execCaseBody(vid, c.start, c.end, capture, lines)) return true;
        }
      }
      // 跳过嵌套块（无论是否采用——case 体界至本组尾）
      let lv = 0;
      for (let j = k; j <= end; j++) {
        lv += (lines[j].match(/{/g) ?? []).length - (lines[j].match(/}/g) ?? []).length;
        if (j > k && lv === 0) { k = j; break; }
      }
      continue;
    }
    const um = s.match(/^useStyle = (\d+);$/);
    if (um) {
      if (singleOk()) capture(+um[1]);
      continue;
    }
    if (/^return/.test(s)) { if (singleOk()) return true; continue; }
    if (s === 'break;') continue;
    const hm = s.match(/^(DefaultTo\w+)\(/);
    if (hm) {
      if (singleOk()) {
        // DefaultToFood 的 useStyle 条件于 useGulpSound 实参（Item.cs:48554-48561）
        if (hm[1] === 'DefaultToFood') capture(/useGulpSound:\s*true/.test(s) ? 9 : 2);
        else {
          const hv = HELPERS[hm[1]];
          if (hv !== undefined) capture(hv);
        }
      }
      continue;
    }
    // 其余赋值/调用：不影响条件栈;作为未加括号支体语句时消费行首守卫（单语句体）
    singleOk();
  }
  return false;
}

/** per-id useStyle 真值。Item.SetDefaults（Item.cs:48666-48711）为【独占分派】：
 *  IsFood → SetFoodDefaults；否则按 type 区间唯一命中 SetDefaults1(≤1000)/2(≤2001)/
 *  3(≤3000)/4(≤3989)/5(其余)——非顺序多区执行。
 *  ★RB17b note①（2026-09-16）：区内改【全方法体线性执行】（execCaseBody 直跑
 *  from+1..to）——不再只走 switch(type) 块：顶层区间 if（35 支,如 :18300/:18596/
 *  :21236）随条件栈求值执行、顶层落穿尾支（:27621,补集守卫 :22289 假支（2192-2198）
 *  直落或其真支内嵌套 switch break（2203/2204）落穿时可达——2205 系 helper+return,
 *  尾支不可达）按顺序执行、return 语义经条件栈门控后终止整区。
 *  旧 switch-only 版对这些支整块漏提（231 vid 真值被低估为 0,实值 1/9）,
 *  诸件均被确定消费支接管故行为面无感——真值面由此完备。 */
function vanillaUseStyle(vid: number): number {
  if (vid <= 0) return 0;
  let v = 0;
  const capture = (nv: number) => { v = nv; };
  const runRegionLinear = (name: string): boolean => {
    const [, [from, to]] = REGIONS.find(([n]) => n === name)!;
    return execCaseBody(vid, from + 1, to, capture);
  };
  // IsFood 面 = SetFoodDefaults 有该 id 显式 case（ItemID.Sets.IsFood 集的运行时等价域）
  const foodR = REGIONS.find(([n]) => n === 'SetFoodDefaults')![1];
  if (regionHasCase(foodR, vid)) { runRegionLinear('SetFoodDefaults'); return v; }
  const name = vid <= 1000 ? 'SetDefaults1' : vid <= 2001 ? 'SetDefaults2'
    : vid <= 3000 ? 'SetDefaults3' : vid <= 3989 ? 'SetDefaults4' : 'SetDefaults5';
  runRegionLinear(name);
  return v;
}

/** 区内是否存在该 id 的显式 case 标签（顶层 switch 直属） */
function regionHasCase([from, to]: readonly [number, number], vid: number): boolean {
  let i = from;
  while (i <= to) {
    if (!/^\t*switch \(type\)\s*$/.test(LINES[i])) { i++; continue; }
    const { cases, bodyEnd } = switchCases(from, to, i);
    for (const c of cases) if (c.ids.includes(vid)) return true;
    i = bodyEnd + 1;
  }
  return false;
}

// ================= RB17b note① 顶层区间支哨兵（2026-09-16） =================
// 红队定谳：六区体在 switch(type) 之外存在顶层（方法体一级）区间 if 与落穿尾支——
//  · 区间支 35 支（如 Item.cs:18300 `if (type >= 1479 && type <= 1494) { useStyle = 1;
//    ...; return; }`、:18596 1543-1545 漆具、:21236 1977-1986 染发剂 useStyle=9）
//  · 补集守卫 1 支（:22289 `if (type < 2192 || type > 2198)`）+ 顶层落穿尾支
//    （:27621 `useStyle = 1;`——2192-2198 蜡烛族守卫假支直落 + 真支内嵌套 switch
//    `break;` 落穿（2203/2204,createTile 307/308 vanilla.json 独立互证）共用;
//    ★C1 复核勘误:2205 非落穿件——case 2205=DefaultToCapturedCritter(148);return;
//    （Item.cs:22328-22330）,useStyle=1 来自 helper 种子,尾支对其不可达）
// 旧 switch-only 提取器对此整块漏提（231 vid 真值 0 vs 实值 1/9）,因全被确定消费支
// （tile 218 件/paintTool 3 件/hairDye 10 件）接管、不入行为断言域,守卫从未爆红。
// 哨兵：(B) 支表反解钉死+逐支真值锚+区间∩臂可达 DRIFT 对拍;(C) 词法形态哨兵。

type TopBranch = { region: string; line: number; head: string; lo: number | null; hi: number | null; useStyle: number | null; solvable: boolean };

/** 反解区内顶层（方法体一级,2 tab）`if (type…)` 支：谓词可解出连续区间者记 [lo,hi],
 *  并捕获支体直属（相对 depth1）首个 useStyle 直赋值（无则 null）。 */
function topLevelTypeIfs(regionName: string): TopBranch[] {
  const [, [from, to]] = REGIONS.find(([n]) => n === regionName)!;
  const out: TopBranch[] = [];
  let depth = 0;
  for (let k = from + 1; k <= to; k++) {
    const opens = (LINES[k].match(/{/g) ?? []).length;
    const closes = (LINES[k].match(/}/g) ?? []).length;
    const before = depth;
    depth += opens - closes;
    if (before === 1 && /^\t\tif \((.+)\)\s*$/.test(LINES[k])) {
      const head = LINES[k].trim().replace(/^if\s*\(/, '').replace(/\)\s*$/, '').trim();
      let lo: number | null = null, hi: number | null = null;
      let m = head.match(/^type >= (\d+) && type <= (\d+)$/);
      if (m) { lo = +m[1]; hi = +m[2]; }
      if (lo === null) { m = head.match(/^type == (\d+)$/); if (m) { lo = +m[1]; hi = +m[1]; } }
      // 支体 span（头行后的 { 起至配对 }）与支体直属首个 useStyle 直赋
      let d2 = 0, bodyStart = -1, bodyEnd = -1, useStyle: number | null = null;
      for (let j = k; j <= to; j++) {
        d2 += (LINES[j].match(/{/g) ?? []).length - (LINES[j].match(/}/g) ?? []).length;
        if (bodyStart < 0 && d2 > 0) bodyStart = j + 1;
        else if (bodyStart >= 0 && d2 === 0) { bodyEnd = j - 1; break; }
      }
      if (bodyStart >= 0 && bodyEnd >= bodyStart) {
        let rel = 0;
        for (let j = bodyStart; j <= bodyEnd; j++) {
          const rb = rel;
          rel += (LINES[j].match(/{/g) ?? []).length - (LINES[j].match(/}/g) ?? []).length;
          if (rb === 0) {
            const um = LINES[j].trim().match(/^useStyle = (\d+);$/);
            if (um) { useStyle = +um[1]; break; }
          }
        }
      }
      out.push({ region: regionName, line: k + 1, head, lo, hi, useStyle, solvable: lo !== null });
    }
  }
  return out;
}

const RANGE_TABLE: TopBranch[] = REGIONS.flatMap(([n]) => topLevelTypeIfs(n));
// 支数钉死（2026-09-16 源态金标）：SetDefaults2=12 / SetDefaults3=15（13 区间+:22289
// 补集守卫+:27621 前方 2 单点）/ SetDefaults4=9，1·5·SetFoodDefaults=0。
// 带无条件 useStyle 锚的支=27。Item.cs 刷新致数值漂移即红→重走提取审计,禁无脑改钉值。
const RANGE_BRANCH_PIN = 36;
const RANGE_SOLVABLE_PIN = 35;
const RANGE_ANCHORED_PIN = 27;

/** 漆具支标记集（items.ts PAINT_TOOL_TABLE 注册面：1071/1543 刷、1072/1544 滚、
 *  1100/1545 刮——Player.cs PlaceThing 分派 :41152/:41236/:41254,updateUse 漆臂
 *  先于通用门臂接管,其门值无行为义）。 */
const PAINT_TOOL_VIDS = new Set(
  Object.entries(VANILLA_ITEM_KEY_BY_ID)
    .filter(([, k]) => !!ITEM_DEFS[ITEM_BY_KEY[k]]?.paintTool)
    .map(([v]) => Number(v)),
);

// ================= ①门数据 ≡ Item.cs 真值（全量逐 id） =================

const ALL_VIDS = Object.keys(vanillaMeta.items).map(Number).filter((n) => n > 0);

// ================= 臂可达分类（tools/_bj69-nouse-item-audit.mjs 同构,保守口径） =================
// 门只作用于 updateUse「其它物品」臂——被上方/梯 B 确定消费支接管的物品不经门,
// 其门值无行为义,不入断言域;仅「臂可达」(无消费支,或消费支=臂内 critter/mount 子支)
// 的 id 须满足 门数据 ≡ Item.cs 真值。
import { HOOK_ITEMS } from '../src/data/grappleHooks';
import { CRITTER_RELEASE_BY_ITEM } from '../src/data/critters';
import { ITEM_TO_MOUNT } from '../src/entities/Mounts';
import { HAIR_DYE_ITEM_IDS } from '../src/data/vanillaHairDyes';
import { PLACE_TILE_ON_ALT_USE } from '../src/data/items';
import { itemCombat } from '../src/data/vanillaItemCombat';

const GAME_SRC = readFileSync(join(dirname(__dirname), 'src', 'core', 'Game.ts'), 'utf8');
const parseSetInTest = (name: string): Set<number> => {
  const m = GAME_SRC.match(new RegExp(`(?:const|export const) ${name} = new Set\\(\\[([\\s\\S]*?)\\]\\);`));
  if (!m) return new Set();
  return new Set(m[1].replace(/\/\/[^\n]*/g, '').split(',')
    .map((t) => Number(t.trim())).filter((n) => Number.isFinite(n) && n > 0));
};
const TELEPORT_SET = parseSetInTest('TELEPORT_ITEM_VIDS');
const PERMANENT_SET = parseSetInTest('PERMANENT_USE_VIDS');
const FUN_USE_SET = new Set([...parseSetInTest('FUN_USE_VIDS')]);
for (const m of GAME_SRC.matchAll(/else if \(heldDef && \[([\[\]0-9,\s.]+)\]\s*\n?\s*\.includes/g)) {
  for (const n of m[1].match(/\d+/g) ?? []) FUN_USE_SET.add(+n);   // 桶/海绵族内联臂并入特判域
}
const SPECIAL_VID_SET = new Set([43, 29, 109, 1291, 5340, 2610, 4049, 1130, 5438, 5518, 3989, 4271, 4382, 5336, 1844, 1958, 4095]);
for (let v = 4242; v <= 4253; v++) SPECIAL_VID_SET.add(v);

function consumersOf(vid: number): string[] {
  const f = itemFuncOfVid(vid) ?? {};
  const c = itemCombat(vid) ?? {};
  const meta = (vanillaMeta as { items: Record<string, { createTile?: number | null }> }).items[String(vid)] ?? {};
  const cons: string[] = [];
  if ((f.pick ?? 0) > 0 || (f.axe ?? 0) > 0 || (f.hammer ?? 0) > 0) cons.push('tool');
  // ★RB17b note①：漆具支标记（updateUse 漆臂 heldDef?.paintTool 先于通用门臂接管,
  //  其门值无行为义不入臂可达域——1543-1545 曾以「无消费支」误入域,真值勘误后须靠
  //  本支排除,否则主循环误报误杀面）
  if (PAINT_TOOL_VIDS.has(vid)) cons.push('paintTool');
  if (meta.createTile != null || f.createTile != null) cons.push('tile');
  if (f.createWall != null) cons.push('wall');
  if (HOOK_ITEMS[vid]) cons.push('hook');
  if (CRITTER_RELEASE_BY_ITEM[vid] !== undefined) cons.push('critter');
  if (ITEM_TO_MOUNT[String(vid)] !== undefined) cons.push('mount');
  if (HAIR_DYE_ITEM_IDS.includes(vid)) cons.push('hairDye');
  if (TELEPORT_SET.has(vid)) cons.push('teleport');
  if (PERMANENT_SET.has(vid)) cons.push('permanent');
  if (FUN_USE_SET.has(vid)) cons.push('funUse');
  if (SPECIAL_VID_SET.has(vid)) cons.push('specialVid');
  if (PLACE_TILE_ON_ALT_USE.has(vid)) cons.push('placeAltUse');
  if (f.consumable && ((f.healLife ?? 0) > 0 || (f.healMana ?? 0) > 0 || ((f.buffType as number | undefined) ?? 0) > 0)) cons.push('potion');   // ★D6:原版域 json 恒数字
  if ((f.damage ?? 0) > 0 || (f.shoot ?? 0) > 0 || f.melee || f.ranged || f.magic || f.summon
    || (c.damage ?? 0) > 0 || (c.shoot ?? 0) > 0) cons.push('weapon');
  if (f.fishingPole) cons.push('fishingPole');
  return cons;
}
/** 臂可达=无确定消费支,或唯一消费支=本臂内子支（critter/mount——门在其外层） */
function reachesGenericArm(vid: number): boolean {
  const cons = consumersOf(vid);
  return cons.length === 0 || cons.every((c) => c === 'critter' || c === 'mount');
}

describe('BJ69 非使用物门数据 ≡ Item.cs useStyle 真值（SetDefaults1..5+SetFoodDefaults 仿真）', () => {
  it('抽样锚定（手读 Item.cs 复核过的 10 件）', () => {
    // 袋族（无 useStyle,Item.cs:30544 共块） / 魔镜 50=4（:22514 族）/ 可疑眼球 43=4（:1888）/
    // 复原药水 226=9（:4200 组 226/227）/ 驯鹿铃铛 1914=1 / 兔子 1992=1（DefaultToCapturedCritter）/
    // 圣诞装饰 1874=1（组 1874-1905）/ 坐骑鞍 4785=4（组 4785-4787）/ 食物 353=9（SetFoodDefaults）
    expect(vanillaUseStyle(3318)).toBe(0);
    expect(vanillaUseStyle(3861)).toBe(0);
    expect(vanillaUseStyle(3862)).toBe(0);
    expect(vanillaUseStyle(50)).toBe(4);
    expect(vanillaUseStyle(43)).toBe(4);
    expect(vanillaUseStyle(226)).toBe(9);
    expect(vanillaUseStyle(1914)).toBe(1);
    expect(vanillaUseStyle(1992)).toBe(1);
    expect(vanillaUseStyle(1874)).toBe(1);
    expect(vanillaUseStyle(4785)).toBe(4);
    expect(vanillaUseStyle(353)).toBe(9);
    // 门数据与真值同相
    for (const vid of [3318, 3861, 3862, 50, 43, 226, 1914, 1992, 1874, 4785, 353]) {
      expect(heldItemUseStyle(vid) > 0, `vid ${vid} 门相`).toBe(vanillaUseStyle(vid) > 0);
    }
  });

  it('全量臂可达件双向对拍：真值>0 ⟺ 门数据>0（误杀面+伪挥面零漂移）', () => {
    const killed: number[] = [];   // 臂可达 ∧ 真值>0 ∧ 门=0 → 原版挥摆被吞（误杀）
    const faked: number[] = [];    // 臂可达 ∧ 真值=0 ∧ 门>0 → 非使用物被起挥（伪挥）
    let reach = 0;
    for (const vid of ALL_VIDS) {
      if (!reachesGenericArm(vid)) continue;
      reach++;
      const truth = vanillaUseStyle(vid);
      const gate = heldItemUseStyle(vid);
      if (truth > 0 && gate === 0) killed.push(vid);
      if (truth === 0 && gate > 0) faked.push(vid);
    }
    expect(reach, '臂可达件数（保守超集）').toBeGreaterThan(1000);
    expect(killed, `误杀面（真值>0∧门=0）: ${killed.slice(0, 20).join(',')}`).toEqual([]);
    expect(faked, `伪挥面（真值=0∧门>0）: ${faked.slice(0, 20).join(',')}`).toEqual([]);
  });

  it('袋 21 件（ItemID.cs:1215 全集）门数据全 0=左键零动作面', () => {
    expect(BOSS_BAG_IDS.size).toBe(21);
    for (const vid of BOSS_BAG_IDS) {
      expect(heldItemUseStyle(vid), `袋 ${vid} 门数据`).toBe(0);
      expect(vanillaUseStyle(vid), `袋 ${vid} Item.cs 真值`).toBe(0);
    }
  });
});

// ================= ②③行为面（sw-fx21 桩同款,updateUse 直驱） =================

const bagIid = (vid: number): number => {
  const k = VANILLA_ITEM_KEY_BY_ID[vid];
  const found = k ? ITEM_BY_KEY[k] : undefined;
  if (found === undefined) throw new Error(`vid ${vid} 未注册`);
  return found;
};

/** updateUse 可驱动的最小 Game 桩（blue-r2-fixes casterGame / sw-fx21 bagGame 惯例） */
function stubGame(heldVid: number) {
  const g = Object.create(Game.prototype) as unknown as Record<string, unknown>;
  const player = new Player(50 * TILE, 90 * TILE, new Inventory());
  player.inv.add(bagIid(heldVid), 1);
  const sel = player.inv.slots.findIndex((s) => s && s.id === bagIid(heldVid));
  player.inv.selected = Math.max(0, sel);
  const added: unknown[] = [];
  const sfxCalls: string[] = [];
  const record = (k: string) => () => { sfxCalls.push(k); };
  const toasts: string[] = [];
  g.player = player;
  g.world = new World(120, 120, 30, 'bj69');
  g.entities = { critters: [], npcs: [], enemies: [], projectiles: [], add: (e: unknown) => added.push(e) };
  g.input = { mouseDown: true, mouseHeld: true, mouseX: 700, mouseY: 300, rightDown: false, uiBlocking: false, downAction: () => false };
  g.camera = { tileUnder: () => [60, 60], screenToWorld: () => [800, 0], x: 800, y: 0 };
  g.renderer = { canvas: { width: 800, height: 600 }, fullMap: { open: false }, timeUiHover: false, weatherUiHover: false };
  g.smartCursor = { showing: false };
  // ★BJ662（2026-10-12）BJ626 bj545/bj536 壳桩同款：updateUse 头 tickWiresRadial
  //  （BJ572 落线）读 this.wiresRadial——Object.create 壳无构造器字段 →
  //  flowerUpdate(st=undefined) TypeError（BJ646/BJ651 登记存量红,桩仅为通路;
  //  袋/凝胶/条族非 wire 工具走 flowerUpdate 早退支）
  g.wiresRadial = newWiresRadialState();
  g.annotateMode = false;
  g.prevSwingMouse = false;
  g.mining = null;
  g.swingHitSet = new Set<number>();
  g.swingTileCutSet = new Set<number>();
  g.sfx = { play: record('play'), playWav: record('playWav'), playWavFile: record('playWavFile'), playFiles: record('playFiles') };
  g.playSfxFile = record('playSfxFile');
  g.playSfxWav = record('playSfxWav');
  g.cb = { onInventoryChanged: () => {}, onToast: (m: string) => toasts.push(m) };
  return { g, player, added, sfxCalls, toasts, heldSlot: sel };
}

describe('BJ69 行为面：门静默集左键一帧零副作用 / 门数据>0 件照常起挥', () => {
  it('袋 21 件全量（含 3861/3862 注册件）：左键一帧 no-op（无 swing/无音/无消耗/无 useTime/无实体/无 toast）', () => {
    expect([...BOSS_BAG_IDS].filter((v) => !VANILLA_ITEM_KEY_BY_ID[v]), '袋全件须已注册可持用（BJ69 数据管线）').toEqual([]);
    for (const vid of BOSS_BAG_IDS) {
      const { g, player, added, sfxCalls, toasts, heldSlot } = stubGame(vid);
      (g as unknown as { updateUse: (dt: number) => void }).updateUse(1 / 60);
      expect(player.useTime, `${vid} useTime`).toBe(0);
      expect((g as unknown as { swing?: unknown }).swing, `${vid} swing`).toBeUndefined();
      expect(added, `${vid} 实体`).toHaveLength(0);
      expect(sfxCalls, `${vid} 音效`).toHaveLength(0);
      expect(toasts, `${vid} toast`).toHaveLength(0);
      expect(player.inv.slots[heldSlot]?.id, `${vid} 不消耗`).toBe(bagIid(vid));
    }
  });

  it('门静默抽样（真值=0 表/凝胶/条 combos 族）：一帧 no-op（RB15a 袋面的推广面）', () => {
    // ★71/999 等在 1457 系真使用物（func useStyle=1;金币 71-74 数据面 Item.cs:2219-2301
    //  useStyle1+shoot 158/159/160/161,直掷被 IsACoin 门 Player.cs:47510-47513 禁,shoot
    //  仅作金币枪 905 弹药面）——不入静默集;本组逐件先断真值=0（真值面漂移即在此爆红,不静默错杀）
    for (const vid of [15, 16, 17, 18, 23, 3456]) {
      expect(vanillaUseStyle(vid), `vid ${vid} 真值锚定`).toBe(0);
      expect(heldItemUseStyle(vid), `vid ${vid} 门数据`).toBe(0);
      const { g, player, added, sfxCalls, toasts, heldSlot } = stubGame(vid);
      (g as unknown as { updateUse: (dt: number) => void }).updateUse(1 / 60);
      expect(player.useTime, `${vid} useTime`).toBe(0);
      expect((g as unknown as { swing?: unknown }).swing, `${vid} swing`).toBeUndefined();
      expect(added, `${vid} 实体`).toHaveLength(0);
      expect(sfxCalls, `${vid} 音效`).toHaveLength(0);
      expect(toasts, `${vid} toast`).toHaveLength(0);
      expect(player.inv.slots[heldSlot]?.id, `${vid} 不消耗`).toBe(bagIid(vid));
    }
  });

  it('阳性对照（防"全 miss 恒 0"反向陷阱,playbook P3.1）：3213 钱槽发射+音效', () => {
    const { g, added, sfxCalls } = stubGame(3213);
    (g as unknown as { updateUse: (dt: number) => void }).updateUse(1 / 60);
    expect(added.length).toBeGreaterThanOrEqual(1);
    expect(sfxCalls.length).toBeGreaterThanOrEqual(1);
  });

  it('阳性对照（回填面）：1874 圣诞装饰（回填 1）与 1905（表载 1）照常起挥', () => {
    for (const vid of [1874, 1905]) {
      expect(heldItemUseStyle(vid), `${vid} 门数据>0`).toBeGreaterThan(0);
      const { g } = stubGame(vid);
      (g as unknown as { updateUse: (dt: number) => void }).updateUse(1 / 60);
      const swing = (g as unknown as { swing?: { t: number; dur: number } }).swing;
      expect(swing, `${vid} 挥摆在位`).toBeTruthy();
    }
  });
});

// ================= ④结构锁：门表达式在位（防静默回退/删除） =================

describe('BJ69 结构锁', () => {
  it('updateUse「其它物品」臂门表达式在位且消费 heldItemUseStyle（>0 相位）', () => {
    const gameSrc = readFileSync(join(dirname(__dirname), 'src', 'core', 'Game.ts'), 'utf8');
    expect(gameSrc).toMatch(/heldItemUseStyle\(heldDef\.vid \?\? -1\) > 0/);   // ★方案 A 重锚(BJ265)
    // 袋豁免集已退役（推广为数据门,防两表漂移的旧结构锁随之退役）
    expect(gameSrc).not.toContain('BOSS_BAG_NO_USE_VIDS');
    // 左键开包入口回潮禁令延续（§五/RB15a 锁面）
    expect(gameSrc).not.toContain('openBossBag');
  });
});

// ================= RB17b note① 哨兵：区间支反解对拍 + 漆具支标记 =================

describe('RB17b note① 顶层区间支哨兵（提取器覆盖域封口）', () => {
  // 逐支锚 vid = 支内首个不被更早支区间覆盖的 id（支区间现互斥,首 id 即锚）
  const anchored: Array<{ vid: number; useStyle: number; branch: TopBranch }> = [];
  {
    const covered: Array<[number, number]> = [];
    for (const b of RANGE_TABLE) {
      if (b.solvable && b.useStyle !== null && b.lo !== null && b.hi !== null) {
        for (let v = b.lo; v <= b.hi; v++) {
          if (!covered.some(([l, h]) => v >= l && v <= h)) { anchored.push({ vid: v, useStyle: b.useStyle, branch: b }); break; }
        }
      }
      if (b.solvable && b.lo !== null && b.hi !== null) covered.push([b.lo, b.hi]);
    }
  }

  it('区间表钉死（36 支/可解 35/带锚 27;源刷新漂移即红→重走提取审计）', () => {
    expect(RANGE_TABLE.length, `顶层支数漂移: ${RANGE_TABLE.map((b) => `${b.region}:${b.line} ${b.head}`).join(' | ')}`).toBe(RANGE_BRANCH_PIN);
    expect(RANGE_TABLE.filter((b) => b.solvable), '可解区间支数').toHaveLength(RANGE_SOLVABLE_PIN);
    expect(anchored, '带无条件 useStyle 锚的支数').toHaveLength(RANGE_ANCHORED_PIN);
    // 补集守卫支在位（Item.cs:22289——其假支与体内落穿共用 :27621 尾支）
    expect(RANGE_TABLE.some((b) => b.head === 'type < 2192 || type > 2198'), '补集守卫支').toBe(true);
    // ★C1 复核勘误（2026-09-16）：落穿尾支锚=2192（守卫假支直落）与 2203/2204
    // （守卫真支内嵌套 switch `break;`→守卫体尽→落 :27621;Item.cs case 2203/2204
    // :22293-22295 亲读=裸 break,尾支 switch :27629-27634 createTile 307/308,
    // vanilla.json 同值独立互证）。2205 非落穿件——case 2205:22328-22330=
    // `DefaultToCapturedCritter(148); return;`（helper 种子 useStyle=1+createTile 724,
    // 尾支对其不可达）;判别力由 2192/2203/2204 独立承载,值不变。
    expect(vanillaUseStyle(2192), '尾支锚 2192（守卫假支直落）').toBe(1);
    expect(vanillaUseStyle(2203), '尾支落穿锚 2203（嵌套 switch break 落穿）').toBe(1);
    expect(vanillaUseStyle(2204), '尾支落穿锚 2204（同 2203）').toBe(1);
    expect(vanillaUseStyle(2205), 'helper 种子锚 2205（DefaultToCapturedCritter+return;非尾支落穿）').toBe(1);
    // vanilla.json createTile 独立互证（尾支 300+type-2192 面与 helper 724 面分立）
    const metaOf = (v: number): number | null =>
      (vanillaMeta as { items: Record<string, { createTile?: number | null }> }).items[String(v)]?.createTile ?? null;
    expect(metaOf(2192), '2192 createTile=300（尾支 default 臂 :27636）').toBe(300);
    expect(metaOf(2203), '2203 createTile=307（尾支 switch :27629-27631）').toBe(307);
    expect(metaOf(2204), '2204 createTile=308（尾支 switch :27632-27634）').toBe(308);
    expect(metaOf(2205), '2205 createTile=724（DefaultToCapturedCritter :48013;非尾支面）').toBe(724);
  });

  it('逐支真值锚：27 支每支锚 vid 真值 ≡ 支内无条件 useStyle（提取器退回 switch-only 即红）', () => {
    for (const a of anchored) {
      expect(vanillaUseStyle(a.vid), `${a.branch.region}:${a.branch.line} ${a.branch.head} 锚 vid ${a.vid}`).toBe(a.useStyle);
    }
  });

  it('区间∩臂可达件 门数据 ≡ 真值（DRIFT=0;实测 34 件活检查——区间支中无确定消费支的 id 逐件对拍,漆具/染发剂/placeable 等消费支件在域外）', () => {
    let checked = 0;
    const drift: string[] = [];
    for (const b of RANGE_TABLE) {
      if (!b.solvable || b.lo === null || b.hi === null) continue;
      for (let vid = b.lo; vid <= b.hi; vid++) {
        if (!reachesGenericArm(vid)) continue;
        checked++;
        if (heldItemUseStyle(vid) !== vanillaUseStyle(vid)) drift.push(`${b.region}:${b.line} vid ${vid} 门=${heldItemUseStyle(vid)} 真值=${vanillaUseStyle(vid)}`);
      }
    }
    expect(drift, `区间∩臂可达 DRIFT: ${drift.join(' | ')}`).toEqual([]);
  });

  it('词法形态哨兵：useStyle 赋值行全为简单直赋式（防三元/表达式形态静默漏提）;switch(type) 书写形态全量被检测正则覆盖', () => {
    for (const [name, [from, to]] of REGIONS) {
      for (let k = from; k <= to; k++) {
        if (/^\t+useStyle/.test(LINES[k])) {
          expect(LINES[k].trim(), `${name}:${k + 1} 非简单直赋式（提取器只识别 "useStyle = N;"）`).toMatch(/^useStyle = \d+;$/);
        }
      }
    }
    let allForms = 0, detected = 0;
    for (const [, [from, to]] of REGIONS) {
      for (let k = from; k <= to; k++) {
        if (/switch\s*\(\s*type\s*\)/.test(LINES[k].trim())) allForms++;
        if (/^\t*switch \(type\)\s*$/.test(LINES[k])) detected++;
      }
    }
    expect(allForms, 'switch(type) 出现次数（区体内）').toBeGreaterThan(100);
    expect(detected, `switch(type) 书写形态漂移:全 ${allForms} vs 检测正则覆盖 ${detected}`).toBe(allForms);
  });

  it('paintTool 支标记：6 件注册钉死 + 逐件臂可达域排除 + 漆臂先于门臂（标记的行为前提）', () => {
    expect([...PAINT_TOOL_VIDS].sort((a, b) => a - b), '漆具注册集（items.ts PAINT_TOOL_TABLE 经 ITEM_DEFS.paintTool 侧）').toEqual([1071, 1072, 1100, 1543, 1544, 1545]);
    for (const vid of PAINT_TOOL_VIDS) {
      expect(consumersOf(vid), `vid ${vid} 消费支含 paintTool`).toContain('paintTool');
      expect(reachesGenericArm(vid), `vid ${vid} 应被漆臂接管（不入通用臂断言域）`).toBe(false);
    }
    const paintArm = GAME_SRC.indexOf('heldDef?.paintTool && inp.mouseDown');
    const gateArm = GAME_SRC.indexOf('heldItemUseStyle(heldDef.vid ?? -1) > 0');   // ★方案 A 重锚(BJ265)
    expect(paintArm, '漆臂在位（Game.ts updateUse）').toBeGreaterThan(0);
    expect(gateArm, '通用门臂在位').toBeGreaterThan(0);
    expect(paintArm, '漆臂必须先于通用门臂（后撤/删除即红——届时漆具门值变为行为活值）').toBeLessThan(gateArm);
  });
});

// ================= C1 复核封口哨兵（2026-09-16）：else 系形态 + 链语义 =================
// 红蓝定谳：execCaseBody 旧版 `^\}\s*else` 两正则只匹配单行形态,而 1457 Item.cs
// 单行形态=0（六区 5 处 bare else 全独立行,else-if=0）→ 多行 else/else-if 体被
// 【无条件采用】（前支守卫被忽略）。今日六区 5 else 体（:18315 value/:23091
// fishingPole/:25558·25733 placeStyle/:38636 value）均不带 useStyle → 真值零漂
// （修复前后全量对拍 6176 vid diff=0（★2026-09-17 勘误:vid 总数随提取域演进,现行 6176,同 tests/bj69-nouse-gate.test.ts:23 口径））;Item.cs 刷新引入带 useStyle 的 else 支
// 即产假真值——本双哨兵封口：形态清单钉源态,合成体钉链语义。

describe('C1 else 形态/链语义哨兵（提取器覆盖域封口）', () => {
  it('形态哨兵：六区 else 系行形态清单钉死（全多行 bare else+后随 {,无 else-if/单行/无括号形态）', () => {
    let bare = 0, elseIf = 0, singleLine = 0, noBrace = 0, notAfterClose = 0;
    const bareLines: string[] = [];
    for (const [name, [from, to]] of REGIONS) {
      for (let k = from + 1; k <= to; k++) {
        const s = LINES[k].trim();
        if (/^}\s*else/.test(s)) singleLine++;                 // 单行形态（1457=0）
        if (/^else\s+if\b/.test(s)) elseIf++;                  // else-if 头（1457 六区=0）
        if (s === 'else' || /^else\s*\{/.test(s)) {
          bare++;
          bareLines.push(`${name}:${k + 1}`);
          let j = k + 1;
          while (j <= to && !LINES[j].trim()) j++;             // 下一非空行
          if (!/^\{/.test((LINES[j] ?? '').trim())) noBrace++;
          let b2 = k - 1;
          while (b2 > from && !LINES[b2].trim()) b2--;         // 上一非空行
          if (!/\}\s*$/.test(LINES[b2] ?? '')) notAfterClose++;   // else 系行必紧随闭括号（注释行插入=链断裂形态）
        }
      }
    }
    expect(singleLine, '单行 `} else` 形态（1457 Item.cs=0;出现即扩解释器+重走全量对拍）').toBe(0);
    expect(elseIf, 'else if 头（1457 六区=0;出现即走真值全量对拍）').toBe(0);
    expect(noBrace, 'bare else 未后随 `{`（无括号 else 体;F4 后解释器已防御支持,出现仍须重走真值全量对拍）').toBe(0);
    expect(notAfterClose, 'bare else 前非空行非闭括号（注释插入 } 与 else 之间;F4 逐深度链态已支持,出现仍须重走全量对拍）').toBe(0);
    expect(bare, `六区 bare else 总数漂移: ${bareLines.join(',')}`).toBe(5);
  });

  it('链语义哨兵：多行 if/else-if/else 链按分支守卫采用——解释器退回无条件采用/naive 取反即红', () => {
    // 合成体=多行形态（1457 全部 else 系实测形态）;行源注入 execCaseBody（lines 形参）
    const body = [
      '\t\t\tif (type == 10)',
      '\t\t\t{',
      '\t\t\t\tuseStyle = 1;',
      '\t\t\t}',
      '\t\t\telse if (type == 20)',
      '\t\t\t{',
      '\t\t\t\tuseStyle = 5;',
      '\t\t\t}',
      '\t\t\telse',
      '\t\t\t{',
      '\t\t\t\tuseStyle = 9;',
      '\t\t\t}',
    ];
    const run = (vid: number): number => {
      let v = 0;
      execCaseBody(vid, 0, body.length - 1, (n) => { v = n; }, body);
      return v;
    };
    // vid=10=链语义判别子:if 支命中后 else 系体不得采用（旧无条件采用=9;
    //  naive「栈顶取反」末 else 守卫=!(前支守卫)=A∨!B 亦误采=9）
    expect(run(10), 'if 支命中:else 系体不得采用（退回无条件采用/naive 取反即 9）').toBe(1);
    expect(run(20), 'else-if 支:守卫=前支取反∧自身条件').toBe(5);
    expect(run(30), 'else 支:守卫=前序全取反之合取').toBe(9);
    // 不可解条件=乐观真（null 恒不阻塞,两支皆采,末值胜）——既有口径延续钉死
    const unsolvable = [
      '\t\t\tif (Main.expertMode)',
      '\t\t\t{',
      '\t\t\t\tuseStyle = 3;',
      '\t\t\t}',
      '\t\t\telse',
      '\t\t\t{',
      '\t\t\t\tuseStyle = 7;',
      '\t\t\t}',
    ];
    let v2 = 0;
    execCaseBody(1, 0, unsolvable.length - 1, (n) => { v2 = n; }, unsolvable);
    expect(v2, '不可解条件=乐观真双支皆采（null 口径延续）').toBe(7);
  });
});

// ================= F4 嵌套 else 链态哨兵（2026-09-16 红蓝2 定谳,探针实证 divergent） =================
// 定谳：execCaseBody 旧版（单变量 chain+栈帧 saved 懒恢复）在【嵌套混合】构造下
// 外链态被内链覆盖且永不恢复——内层 else 分支出栈帧无 saved,外层 else 头又取消
// 懒恢复→从陈旧内链求守卫（null=乐观真）→ C# 语义错（探针: 嵌套构造 vid=50
// 解释器=9,C#=5;三层嵌套 3/4 cell 错）。红队处方「else 头取消懒恢复时把
// pendingRestore 存入所推帧 saved」经模拟不充分（多层闭括号同拍 pop 串灭该
// saved;无括号 else 支体不入栈=父 else 仍读陈旧链,vid=10 仍 9≠3）→ 按 C# 语义
// 落刀=逐深度链态 chainAt[d]（d 层 else 系头读同层前一兄弟头写入的链态;嵌套构念
// 头写 chainAt[d+1] 天然不污染外层）。修复后全量对拍 6176 vid DIFF=0（★2026-09-17 勘误:现行 6176,同 :23 口径）（六区 5 else
// 体均不带 useStyle 且全扁平,真值面零漂）。本三哨兵钉死三类构造的 C# 真值:
//  · 构造① 嵌套混合（全括号） `if A{if B{X}else{Y}}else{Z}`
//  · 构造② 内层无括号     `if A{if B{X}else Y}else{Z}`
//  · 构造③ 三层嵌套       `if A{if B{if C{X}else{Y}}else{W}}else{Z}`
// C# 语义（标准语言语义,else 绑定最近未配对 if）: A 假→末 else;A 真入体内,
// B/C 同理逐层。vid=10 锚=判决 prescribed 值（A 假→9）。
describe('F4 嵌套 else 链态哨兵（红蓝2 定谳封口）', () => {
  const run = (vid: number, body: readonly string[]): number => {
    let v = 0;
    execCaseBody(vid, 0, body.length - 1, (n) => { v = n; }, body);
    return v;
  };
  const L3 = (indent: number, s: string): string => `${'\t'.repeat(indent)}${s}`;

  it('构造① 嵌套混合（全括号）: vid=10→9 / 25→5 / 30→3 —— 外层 else 守卫须取外层前支之反（陈旧内链即红）', () => {
    // A=`type >= 20`, B=`type == 30`; X=3(A∧B) Y=5(A∧¬B) Z=9(¬A)
    const body: string[] = [
      L3(3, 'if (type >= 20)'),
      L3(3, '{'),
      L3(4, 'if (type == 30)'),
      L3(4, '{'),
      L3(5, 'useStyle = 3;'),
      L3(4, '}'),
      L3(4, 'else'),
      L3(4, '{'),
      L3(5, 'useStyle = 5;'),
      L3(4, '}'),
      L3(3, '}'),
      L3(3, 'else'),
      L3(3, '{'),
      L3(4, 'useStyle = 9;'),
      L3(3, '}'),
    ];
    expect(run(10, body), '¬A 支:外层 else 守卫=外层前支取反（旧版读陈旧内链→乐观真/假阴错支）').toBe(9);
    expect(run(25, body), 'A∧¬B 支:内层 else 命中后,外层 else 体不得再采用（旧版乐观真误采=9）').toBe(5);
    expect(run(30, body), 'A∧B 支:两层 if 全真,else 系全不采用').toBe(3);
  });

  it('构造② 内层无括号 else 体 `if A{if B{X}else Y}else{Z}`: 单语句守卫须施于无括号支体（守卫被弃即红）', () => {
    // 同①条件;Y 无括号单语句——旧版 pendingHead 无 `{` 消费=守卫整弃（Y 无条件采用）
    const body: string[] = [
      L3(3, 'if (type >= 20)'),
      L3(3, '{'),
      L3(4, 'if (type == 30)'),
      L3(4, '{'),
      L3(5, 'useStyle = 3;'),
      L3(4, '}'),
      L3(4, 'else'),
      L3(5, 'useStyle = 5;'),
      L3(3, '}'),
      L3(3, 'else'),
      L3(3, '{'),
      L3(4, 'useStyle = 9;'),
      L3(3, '}'),
    ];
    expect(run(10, body), '¬A 支:外层 else 守卫不受无括号内层影响').toBe(9);
    expect(run(25, body), 'A∧¬B 支:无括号 else 体守卫=¬B∧外层栈（旧版守卫被弃仍误采,外层误采=9）').toBe(5);
    expect(run(30, body), 'A∧B 支:无括号 else 体不得采用（旧版=5）').toBe(3);
  });

  it('构造③ 三层嵌套 `if A{if B{if C{X}else{Y}}else{W}}else{Z}`: 逐层 else 各取本层前支之反（错层读链即红）', () => {
    // A=`type >= 20`, B=`type >= 30`, C=`type >= 40`（区间条件使四支两两可达）; X=3 Y=4 W=7 Z=9
    const body: string[] = [
      L3(3, 'if (type >= 20)'),
      L3(3, '{'),
      L3(4, 'if (type >= 30)'),
      L3(4, '{'),
      L3(5, 'if (type >= 40)'),
      L3(5, '{'),
      L3(6, 'useStyle = 3;'),
      L3(5, '}'),
      L3(5, 'else'),
      L3(5, '{'),
      L3(6, 'useStyle = 4;'),
      L3(5, '}'),
      L3(4, '}'),
      L3(4, 'else'),
      L3(4, '{'),
      L3(5, 'useStyle = 7;'),
      L3(4, '}'),
      L3(3, '}'),
      L3(3, 'else'),
      L3(3, '{'),
      L3(4, 'useStyle = 9;'),
      L3(3, '}'),
    ];
    expect(run(10, body), '¬A 支:最外层 else（旧版错支=9 侥幸同值,错层读链时 25/35 层爆红）').toBe(9);
    expect(run(25, body), 'A∧¬B 支:中层 else=W（旧版内链上浮→乐观真误采 Z=9）').toBe(7);
    expect(run(35, body), 'A∧B∧¬C 支:内层 else=Y（旧版=9）').toBe(4);
    expect(run(45, body), 'A∧B∧C 支:三层 if 全真').toBe(3);
  });
});

// ================= BJ112-c 无括号 if 体嵌套 if 哨兵（2026-09-17 登记遗留清偿） =================
// 普查定谳（2026-09-17 python 全文件扫描）：Terarria1457/Terraria/Item.cs 全文
// 「无括号 if 体首语句=嵌套 if」形态计数=0——多行（if 头行的下一非空非注释行仍是
// if 头）=0、单行 `if(…) if(…)`=0、六区 SetDefaults1..5+SetFoodDefaults 各=0。
// ⇒ 解释器合成修复纯防御（真值面零漂,全量对拍不受扰）;本 describe 三哨兵钉死：
//   · 形态哨兵：六区两形态计数钉 0（Item.cs 刷新引入该形态即红→重走对拍）
//   · 构造④ `if (A) if (B) X;`：X 仅 A∧B 支采用（旧版 pendingHead 被内层 if 头
//     覆写=外层守卫整弃,¬A∧B 支误采即红）
//   · 构造⑤ `if (A) if (B) X; else Y;`：悬空 else 归最近未配对 if（C# 语义）——
//     Y 取 A∧¬B（旧版 else 读内层链态=仅 ¬B,¬A 支误采即红）
describe('BJ112-c 无括号 if 体嵌套 if 哨兵（C# 单语句体语义封口）', () => {
  const run = (vid: number, body: readonly string[]): number => {
    let v = 0;
    execCaseBody(vid, 0, body.length - 1, (n) => { v = n; }, body);
    return v;
  };
  const L3 = (indent: number, s: string): string => `${'\t'.repeat(indent)}${s}`;

  it('形态哨兵：六区「无括号 if 体首语句=嵌套 if」两形态计数=0（回潮即红→重走提取审计）', () => {
    const headRe = /^\s*(\}\s*)?(else\s+)?if\s*\(/;
    const isIfHead = (s: string): boolean => {
      if (!headRe.test(s)) return false;
      if (/\{\s*$/.test(s)) return false;                  // 行尾 `{`=括号体,非本形态
      return s.trimEnd().endsWith(')');                    // ) 后不得有单行体语句
    };
    let multi = 0, single = 0;
    const hits: string[] = [];
    for (const [name, [from, to]] of REGIONS) {
      for (let k = from + 1; k <= to; k++) {
        const t = LINES[k].trim();
        if (/\)\s*if\s*\(/.test(t) && !t.includes('{') && headRe.test(t)) {   // 单行 if(..) if(..)
          single++; hits.push(`${name}:${k + 1} 单行 ${t}`);
        }
        if (isIfHead(LINES[k]) && !t.startsWith('}')) {
          let j = k + 1;
          while (j <= to) {
            const nx = LINES[j].trim();
            if (!nx || nx.startsWith('//')) { j++; continue; }
            if (isIfHead(LINES[j])) { multi++; hits.push(`${name}:${k + 1}→${j + 1} 多行嵌套`); }
            break;
          }
        }
      }
    }
    expect(single, `单行 if(…) if(…) 形态回潮: ${hits.join(' | ')}`).toBe(0);
    expect(multi, `无括号 if 体首语句=嵌套 if 形态回潮: ${hits.join(' | ')}`).toBe(0);
  });

  it('构造④ `if (A) if (B) X;`：X 仅 A∧B 支采用（¬A∧B 支误采=外层守卫被覆写丢弃=红）', () => {
    // A=`type < 20`, B=`type >= 10`——A 假 ∧ B 真的 vid 必须存在（判别子）
    const body: string[] = [
      L3(3, 'if (type < 20)'),
      L3(4, 'if (type >= 10)'),
      L3(5, 'useStyle = 3;'),
    ];
    expect(run(10, body), 'A∧B 支:两层全真,X 采用').toBe(3);
    expect(run(5, body), 'A∧¬B 支:外层真内层假,X 不得采用').toBe(0);
    expect(run(25, body), '¬A∧B 支:X 不得采用（★判别:旧版覆写后仅看 B=true→误采 3=红）').toBe(0);
  });

  it('构造⑤ `if (A) if (B) X; else Y;`：悬空 else 归最近未配对 if（C#）——Y 取 A∧¬B', () => {
    const body: string[] = [
      L3(3, 'if (type >= 20)'),
      L3(4, 'if (type == 30)'),
      L3(5, 'useStyle = 3;'),
      L3(4, 'else'),
      L3(5, 'useStyle = 5;'),
    ];
    expect(run(30, body), 'A∧B 支:X=3,else 不采用').toBe(3);
    expect(run(25, body), 'A∧¬B 支:悬空 else 归内层 if(B),Y=5').toBe(5);
    expect(run(10, body), '¬A 支:整个内层构念不执行（★判别:旧版 else 仅读内层链态 ¬B→误采 5=红）').toBe(0);
  });
});

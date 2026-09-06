// 从 Terarria1458 Item.cs SetDefaults1-5 逐物品提取【功能画像】→ vanilla-itemfunc.json。
// ★2026-08-25 用户令"以 1458 作为最新基准"：源 1456→1458（1458 SetDefaults 数值面
// 零变更——旧件终值应零 diff,新增件=6150-6185 块等 1458 新物品,此前整块漏提）。
// 用途：道具功能全量审计的"原版应有功能"基准（tools/item-audit.mjs 对照）。
// 提取字段（仅记非默认值）：
//   近战/远程/魔法/召唤旗、noMelee、damage、mana（耗魔）
//   工具：pick/axe/hammer（>0 即工具）
//   放置：createTile/createWall/placeStyle
//   消耗：consumable、potion、healLife/healMana、buffType（+buffTime 近似）
//   弹药：ammo/useAmmo/notAmmo、shoot、channel、autoReuse、holdStyle、torch
//   改向：useTurn（=1；全量归档自 extract-itemcombat.mjs 提取库，2026-08-17）
// 注意 case 归属 = 最近一层 switch(type)（嵌套 switch 陷阱同 extract-equip-prefix.mjs）。
// 2026-08-17 useTurn 叠加：全量归档来自 extract-itemcombat.mjs 三通道提取库（显式字面
// + DefaultTo* 辅助函数族 + 区间 if 块；Item.cs:170 默认 false——表内仅记 true=1）。
// 2026-08-25 DefaultTo 武器族展开（1458 Item.cs）：MagicWeapon/RangedWeapon/Bow/
//   Staff/Spear/ThrownWeapon——此前只认显式赋值,这些辅助函数族的 case（整块 615x）
//   全部漏提 → heldUseStyle 回退 useStyle 1（冰川之牙斜挥穿胸,用户实报）。
// 2026-09-03 ★PS-STRUCT placeStyle 条件感知结构层（F1 工具自愈,蓝队定谳）：
//   v1 collectCaseSegments 对「多支共享 case 段（fallthrough 组）」只有【组末支】拿到
//   body 段——①嵌套 switch(type) 组：末支段卷进整个内层 switch → 字段首匹配吃到
//   组锚值（花岗岩 11/大理石 8 家具 + 2642 黑曜石灯 + 3868 奖杯 = 伪值）;②if/else
//   覆写组：非末支段=空白 → 整组缺档（2641/3866/3867）。运行时已由 items.ts
//   SHARED_GROUP_PLACE_STYLE_1457（24 行）无条件纠偏,本批让工具自愈：
//   structuralPlaceStyles() 重建 C# 执行序（fallthrough 组共享 body + 嵌套 switch 孔剥
//   + per-id 归并 + if(type==N)/else 条件感知）,只解 placeStyle 一个字段——其余字段
//   仍走 v1 文本段首匹配（重提会引入超预期 diff,落盘闸门=placeStyle 之外零 diff）。
//   修正面：已有条目伪值覆写 + 无条目最小新增 {placeStyle}（其余字段仍由 items.ts
//   vanilla.json 回填链承载;placeStyle=0 的补齐项经回填门 `!== 0` 为运行时无操作）。
// 2026-09-03 ★F-STRUCT 全字段泛化（PS-STRUCT placeStyle → 全 FIELDS 基态语义）：
//   evalFields(text,id)=基态（Variant=null,普通世界）执行序逐 id 求值,泛化点：
//   ①基态种子=defaultToBase(seg)（DefaultTo* 辅助族隐式值——Variant 支未命中时基态
//     对辅助字段=辅助隐式值,不是 absent）→ 线性执行序扫描覆写;
//   ②无条件赋值全 FIELDS 后写覆盖,autoReuse 布尔 true/false→1/0（1325 :16413 显式
//     false 是提取事实;其余布尔仍只认 true=同 v1 FIELDS 零漂移）;
//   ③`if (type == N)`/`N == type`/不等式/`||`析取连式按 id 判定,命中支覆写未命中走
//     else（5012 shoot 947→948 型"本 id 恒真支"伪值由 kissing 面转正）;
//   ④Variant 条件按基态口径求值：普通世界 ItemVariants.SelectVariant=null
//     （ItemVariants.cs:89-108,登记面仅 25 id 全挂种子条件）⇒ `== X` 恒假/`!= X` 恒真
//     ——544/556/557 的 `!= DisabledBossSummonVariant`（:7874/:8006/:8019）基态必采用
//     （盲剥=boss 召唤物实机回归）;5334 `== EnabledVariant`（:42308）基态不采用
//     （v1 回落曾把 Mechdusa 世界限定召唤面当基态）;
//   ⑤其余不可解条件（num==N/Main.*）整支不采用只走 else（同 v1）。
//   合并语义（对 FUNC 的 diff 规则）：已有条目 struct 有值→覆写、struct 判「基态缺省」
//   （辅助无隐式+基路径无赋值）而 v1 有支内值→删除该键;【不新增】cur 缺的键——缺档面
//   （fallthrough 组非末支/嵌套 case 专属段）仍由 items.ts 纠偏/vanilla.json 回填链承载;
//   无条目仍只 placeStyle 最小新增（金标 24 行面零 diff）;placeStyle 维与旧
//   evalPlaceStyles 金标逐 id 对拍,漂移即 process.exit(1) 拒产。
//   ITEMFUNC_DIFF=<path> 可导出 {fixed,deleted,added} 三账本供审计。
// 2026-09-04 ★SW-V1 DefaultTo* 全族参数化展开（共享算式盲区根治）：
//   defaultToBase 六武器族 → 21 helper 全族（PlaceableTile 双参/Bomb/Solution/Whip/
//   Kite/Vanitypet/CapturedCritter/Torch/MusicBox/Banner/Monolith/SeaShell/GolfBall/
//   GolfClub/LawnMower/Guitar/QuestFish/VoiceOverrideAccessory）+ 实参升级
//   （(ushort) 显式转换/`type` 线性算式 `1086+(type-5594)`/AmmoID.X 枚举——后者复用
//   combat 提取器 AMMO_ID 权威表,新增 export）。四批手工回填面转由解析直出：
//   items.ts PLACE_STYLE_BACKFILL_1458 helper 行/EXTRACT_PATCH 重叠字段/vanillaItemFunc
//   FUNC['5594']['5595']['4049']——金标逐字段对拍全一致（含 musicBoxStyles 逆表 101/
//   101、vanilla-whips.json 18/18）。合并层扩：v1 无条目且 HELPER_SEED 命中（fallthrough
//   组非末支等形态）→ 整条按基态结构值落表（旧口径只 placeStyle 单键最小新增）;
//   种子布尔取消 cancelFalseBooleans（段内无条件 `X=false;` 尾随种子→删键,last-wins
//   保 5526/2611 型 false→true 双赋值;1325 型变体支伪值仍走合并层 1→0 记录）。
//   金标修正面（重产生效时）:4058/4381 useAmmo 1→40（旧 Bow 分支硬编码 1 系笔误,
//   AmmoID.Arrow=40）+4682/4702 ranged 键删除（C# 显式 false,与 combat json 同值）。
// 2026-09-06 ★SW-BK1 createWall 向上归因（共享算式/区间块缺档根治,35 件墙物品）：
//   提取器此前只认 `createWall = (\d+);` 字面——①共享 case 段/嵌套 case 专属段的
//   `createWall = 116 + type - 1948;` 算式（:21139/21428/22090/22370/24086/26651/
//   33328 七处）不命中 → fallthrough 组成员 26 件整缺+组末支 7 件缺 createWall 键;
//   ②default 支内 `if (type >= 2263 && type <= 2264)` 区间块（:22764-22769）整段
//   丢弃 → 2 件整缺。修=evalArithExpr（wallitems 提取器 evalExpr 同构,evalFields
//   fill-when-undefined）+ structuralIfRanges（wallitems 路径 B 同构,仅收 createWall
//   体）。对账面=vanilla-wallitems.json 292 项逐值;重产 diff 恰 35 件新增字段
//   （28 整缺条目 + 7 既有条目补 createWall 键）,其余 3730 条 md5 级零 diff。
import { readFileSync, writeFileSync } from 'node:fs';
// SW-V1 2026-09-04: 增 AMMO_ID——DefaultTo* 参数化展开需解 AmmoID.X 枚举实参
// （RangedWeapon 第二参/Solution 的 AmmoID.Solution;权威表与 combat 提取器同源）。
import { EXTRA_USETURN, AMMO_ID } from './extract-itemcombat.mjs';

const ROOT = '/Users/vinlic/Project/GLM/SandboxWorld';
const OUT = process.env.ITEMFUNC_OUT ?? `${ROOT}/game/src/data/vanilla-itemfunc.json`;
const itemSrc = readFileSync(`${ROOT}/Terarria1458/Terraria/Item.cs`, 'utf8');

function methodBodyOf(src, name) {
  const idx = src.indexOf(name);
  if (idx < 0) return '';
  const start = src.indexOf('{', idx);
  let depth = 0;
  for (let i = start; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) return src.slice(start + 1, i); }
  }
  return '';
}

/** case 段 → itemId: segment（最近一层 switch(type) 归属，嵌套 switch(type) 的内层标签才是物品 id） */
function collectCaseSegments(body, out) {
  const tokRe = /switch\s*\(([^)]*)\)|case (\d+):|default:|[{}]/g;
  const stack = [];
  let depth = 0, m;
  while ((m = tokRe.exec(body))) {
    const t = m[0];
    if (t.startsWith('switch')) {
      stack.push({ isType: /switch\s*\(\s*(?:type|currentItem\.type)\b/.test(t), opened: false, bodyDepth: -1, cur: null, segStart: 0 });
    } else if (t === '{') {
      depth++;
      const top = stack[stack.length - 1];
      if (top && !top.opened) { top.opened = true; top.bodyDepth = depth; top.segStart = m.index + 1; }
    } else if (t === '}') {
      const top = stack[stack.length - 1];
      if (top && top.opened && depth === top.bodyDepth) {
        if (top.isType && top.cur !== null) out.set(top.cur, body.slice(top.segStart, m.index));
        stack.pop();
      }
      depth--;
    } else {
      const top = stack[stack.length - 1];
      if (top && top.opened && top.isType) {
        if (top.cur !== null) out.set(top.cur, body.slice(top.segStart, m.index));
        top.cur = t === 'default:' ? null : +m[2];
        top.segStart = m.index + t.length;
      }
    }
  }
}

function outerCaseSegments(src) {
  const out = new Map();
  for (const n of [1, 2, 3, 4, 5]) {
    const body = methodBodyOf(src, `public void SetDefaults${n}(`)
      || methodBodyOf(src, `private void SetDefaults${n}(`)
      || methodBodyOf(src, `void SetDefaults${n}(`);
    if (body) collectCaseSegments(body, out);
  }
  return out;
}

// ================= ★PS-STRUCT placeStyle 条件感知结构层（2026-09-03） =================
// 只服务 placeStyle 字段；其余字段走 v1 collectCaseSegments 文本段首匹配（零漂移）。

/** 剥掉段内嵌套 switch(type) 块（holes=[start,end) 记于所属 case 段）后的文本 */
function sliceHoles(body, rec) {
  if (!rec.holes.length) return body.slice(rec.start, rec.end);
  let out = '', pos = rec.start;
  for (const [hs, he] of rec.holes) {
    if (hs < pos || he > rec.end) continue;   // 孔不属于本段（理论不可达,防御）
    out += body.slice(pos, hs);
    pos = he;
  }
  return out + body.slice(pos, rec.end);
}

/** 消费一个语句：{…} 块或到分号的裸语句 → 返回结束下标（exclusive） */
function stmtEnd(text, i) {
  if (text[i] === '{') {
    let d = 0;
    for (; i < text.length; i++) {
      if (text[i] === '{') d++;
      else if (text[i] === '}') { d--; if (d === 0) return i + 1; }
    }
    return text.length;
  }
  const semi = text.indexOf(';', i);
  return semi < 0 ? text.length : semi + 1;
}

/** 解析 if (type == N) <stmt> [else <stmt>] → { body, elseBody, end }
 *  body/elseBody 为【源文本】（else-if 链整段交给递归） */
function consumeIf(text, afterHeader) {
  let i = afterHeader;
  while (/\s/.test(text[i] ?? '')) i++;
  if (i >= text.length) return null;
  const bodyStart = text[i] === '{' ? i + 1 : i;
  const bodyEnd = stmtEnd(text, i);
  const body = text[i] === '{' ? text.slice(bodyStart, bodyEnd - 1) : text.slice(i, bodyEnd);
  let j = bodyEnd;
  while (/\s/.test(text[j] ?? '')) j++;
  let elseBody, end = bodyEnd;
  if (text.startsWith('else', j)) {
    let k = j + 4;
    while (/\s/.test(text[k] ?? '')) k++;
    if (text[k] === '{') {
      const eEnd = stmtEnd(text, k);
      elseBody = text.slice(k + 1, eEnd - 1);
      end = eEnd;
    } else {
      // else if … / else 裸语句：整段源文本递归
      const eEnd = text[k] === 'i' ? consumeIf(text, text.indexOf(')', k) + 1).end : stmtEnd(text, k);
      elseBody = text.slice(k, eEnd);
      end = eEnd;
    }
  }
  return { body, elseBody, end };
}

/** 括号感知条件扫描：i 指向 '(' 后首字符 → 返回配对 ')' 之后下标（串感知） */
function scanParen(text, i) {
  const n = text.length;
  let pd = 1;
  for (; i < n; i++) {
    const ch = text[i];
    if (ch === '"' || ch === "'") { const q = ch; i++; while (i < n && text[i] !== q) { if (text[i] === '\\') i++; i++; } continue; }
    if (ch === '(') pd++;
    else if (ch === ')') { pd--; if (pd === 0) return i + 1; }
  }
  return n;
}

/** 段文本 → 该 id 的 placeStyle 终值。
 *  顺序单位扫描（C# 执行序）：无条件赋值【后写覆盖】（★十五批备B 收尾,2026-09-03
 *  改——原"首个生效=v1 首匹配"与 C# 顺序语义反,共享体 placeStyle 双赋值或 if 支后
 *  再有无条件赋值时后写才是终值;线性扫描每次赋值事件都覆写 ps 即执行序）。
 *  条件面感知（★本批扩）：`if (type == N)`/反序 `if (N == type)`（Item.cs:33139-33147
 *  防御锻造炉 3743-3745 三连 if）命中支覆写、未命中走 else 支（else-if 链递归同规）;
 *  【非】type 比较条件（Variant 变体支/区间支）按未命中处理——只走 else 支（基态
 *  画像口径,Variant 支体不入单值面）+整支消耗;switch 块整块跳过（per-id 归并是
 *  psResolveSwitch 孔剥层职能）。算式（20 + type - 2637 等）不解（与 v1 同口径,
 *  交 items.ts vanilla.json 回填链）。 */
function evalPlaceStyle(text, id) {
  let ps;
  const re = /(if|switch)\s*\(|placeStyle\s*=\s*(\d+)\s*;/g;
  let m;
  while ((m = re.exec(text))) {
    if (m[2] !== undefined) { ps = +m[2]; continue; }   // ★后写覆盖（原 if (ps===undefined) 首写钉死）
    if (m[1] === 'switch') {
      let j = re.lastIndex;
      while (j < text.length && /\s/.test(text[j])) j++;
      re.lastIndex = text[j] === '{' ? skipBraced(text, j) : skipSimple(text, j);
      if (re.lastIndex <= j) re.lastIndex = text.length;   // skipBraced 失配防御
      continue;
    }
    const afterHeader = scanParen(text, re.lastIndex);
    const cond = text.slice(re.lastIndex, afterHeader - 1);
    const cm = /^\s*(?:(?:type|currentItem\.type)\s*==\s*(\d+)|(\d+)\s*==\s*(?:type|currentItem\.type))\s*$/.exec(cond);
    const parsed = consumeIf(text, afterHeader);
    if (!parsed) continue;
    re.lastIndex = parsed.end;   // 绝对下标（consumeIf 以同一 text 计位）
    const n = cm ? (+cm[1] || +cm[2]) : -1;   // 非 type 比较（Variant/区间）=未命中
    const branch = n === id ? parsed.body : parsed.elseBody;
    if (branch !== undefined) {
      const v = evalPlaceStyle(branch, id);
      if (v !== undefined) ps = v;   // 条件命中覆写（C# 后写胜）
    }
  }
  return ps;
}

function psRec(sw) {
  let r = sw.cases.get(sw.cur);
  if (!r) { r = { start: sw.segStart, end: 0, holes: [], nested: [] }; sw.cases.set(sw.cur, r); }
  return r;
}

/** 单个 switch(type) 的 per-id placeStyle 解析（close 时调用;子层已解析存 sw.ps） */
function psResolveSwitch(sw, body) {
  sw.ps = new Map();
  const ids = [...sw.cases.keys()].filter((k) => k !== null);
  const stripComment = (s) => s.replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, '');
  // fallthrough 分组：连续 case 标签,中间段全空白 → 共享【末支段】为组 body
  const groups = [];
  let run = [];
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    const rec = sw.cases.get(id);
    run.push(id);
    const empty = stripComment(sliceHoles(body, rec)).trim() === '';
    if (!empty || i === ids.length - 1) { groups.push({ members: run, bodyRec: rec }); run = []; }
  }
  for (const g of groups) {
    const bodyText = sliceHoles(body, g.bodyRec);
    for (const id of g.members) {
      let ps = evalPlaceStyle(bodyText, id);
      for (const child of g.bodyRec.nested) {
        const cps = child.ps?.get(id);
        if (cps !== undefined) ps = cps;   // 嵌套 switch(type) per-id 条目覆盖（执行序在后）
      }
      if (ps !== undefined) sw.ps.set(id, ps);
    }
  }
  // default: 段（key=null）——无条件/区间赋值无法按 id 归属,不解（v1 同口径整段丢弃,
  // 零漂移）;但其内嵌套 switch(type) 的 per-id 条目按 id 归并（显式 case 优先）
  const defRec = sw.cases.get(null);
  if (defRec) {
    for (const child of defRec.nested) {
      for (const [cid, cps] of child.ps ?? []) {
        if (!sw.ps.has(cid)) sw.ps.set(cid, cps);
      }
    }
  }
}

/** 结构层主入口：SetDefaults1-5 → Map(vid → placeStyle 终值) */
function structuralPlaceStyles(src) {
  const out = new Map();
  for (const n of [1, 2, 3, 4, 5]) {
    const body = methodBodyOf(src, `public void SetDefaults${n}(`)
      || methodBodyOf(src, `private void SetDefaults${n}(`)
      || methodBodyOf(src, `void SetDefaults${n}(`);
    if (!body) continue;
    const tokRe = /switch\s*\(([^)]*)\)|case (\d+):|default:|[{}]/g;
    const stack = [];
    let depth = 0, m;
    while ((m = tokRe.exec(body))) {
      const t = m[0];
      if (t.startsWith('switch')) {
        stack.push({ isType: /switch\s*\(\s*(?:type|currentItem\.type)\b/.test(t), opened: false, bodyDepth: -1, tokStart: m.index, cur: null, segStart: 0, cases: new Map() });
      } else if (t === '{') {
        depth++;
        const top = stack[stack.length - 1];
        if (top && !top.opened) { top.opened = true; top.bodyDepth = depth; top.segStart = m.index + 1; }
      } else if (t === '}') {
        const top = stack[stack.length - 1];
        if (top && top.opened && depth === top.bodyDepth) {
          stack.pop();
          depth--;
          if (top.isType) {
            if (top.cur !== null) psRec(top).end = m.index;
            const parent = stack[stack.length - 1];
            if (parent && parent.isType && parent.opened) {
              // ①嵌套 switch(type) 闭合：孔登记 + 子层归并（"保护内层条目"的承载点——
              //   子层 per-id 终值经 parent 解析时归并,不再被 parent 段首匹配冲掉）。
              //   parent.cur === null = default: 段（Item.cs:22374 巨型 default 支内
              //   兄弟嵌套 switch 逐 id 分派,2641-2647 区即此形态）——同样登记,
              //   归并在 psResolveSwitch 的 default 支处理。
              const pr = psRec(parent);
              pr.holes.push([top.tokStart, m.index + 1]);
              pr.nested.push(top);
            }
            psResolveSwitch(top, body);
            if (!stack.some((s) => s.isType && s.opened)) {
              for (const [id, ps] of top.ps) out.set(id, ps);   // 最外层才落总表（后法覆盖前法=v1 同序）
            }
          }
          continue;
        }
        depth--;
      } else {
        const top = stack[stack.length - 1];
        if (top && top.opened && top.isType) {
          if (top.cur !== null) psRec(top).end = m.index;
          top.cur = t === 'default:' ? null : +m[2];
          top.segStart = m.index + t.length;
        }
      }
    }
  }
  return out;
}

const SEGS = outerCaseSegments(itemSrc);

// ================= ★F-STRUCT 全字段基态结构层（2026-09-03,PS-STRUCT → 全 FIELDS 泛化） =================

/** 基态条件判定（Variant=null 口径）→ true=支命中 / false=走 else / undefined=不可解
 *  （整支不采用、只走 else——同 v1 evalPlaceStyle 的非 type 比较口径）。
 *  支持形态：type==N（含反序,与旧口径同式同 bug:+m[1]||+m[2] 对 0 失真——零漂移保留）/
 *  type 不等式（双序）/ 顶层 ||（析取,2895 诱饵 `type == 2895 || type == 2893 ||
 *  type == 2891`）/ 顶层 &&（合取）/ Variant 比较（基态 null ⇒ == 恒假、!= 恒真）。 */
function evalBaseCond(cond, id) {
  const c = cond.replace(/\s+/g, ' ').trim();
  // 顶层布尔连词切分（括号感知;&& 优先级高,先找 ||）
  let pd = 0, op = null, parts = [];
  {
    let start = 0;
    const segs = [];
    for (let i = 0; i < c.length; i++) {
      const ch = c[i];
      if (ch === '(') pd++;
      else if (ch === ')') pd--;
      else if (pd === 0 && (ch === '|' || ch === '&') && c[i + 1] === ch) {
        const o = ch + ch;
        if (op === null) op = o;
        if (o === op) { segs.push(c.slice(start, i)); i++; start = i + 1; }
        else { op = '||'; break; }   // 混连词：按 || 切（&& 归入子项递归）
      }
    }
    if (op === '||') { segs.push(c.slice(start)); parts = segs; }
  }
  if (op === '||') {
    let unknown = false;
    for (const p of parts) {
      const v = evalBaseCond(p, id);
      if (v === true) return true;
      if (v !== false) unknown = true;
    }
    return unknown ? undefined : false;
  }
  if (op === '&&') {
    let unknown = false;
    for (const p of parts) {
      const v = evalBaseCond(p, id);
      if (v === false) return false;
      if (v !== true) unknown = true;
    }
    return unknown ? undefined : true;
  }
  let m = /^\s*(?:(?:type|currentItem\.type)\s*==\s*(\d+)|(\d+)\s*==\s*(?:type|currentItem\.type))\s*$/.exec(c);
  if (m) return (+m[1] || +m[2]) === id;
  m = /^\s*(?:type|currentItem\.type)\s*(<=|>=|<|>)\s*(\d+)\s*$/.exec(c);
  if (m) { const n = +m[2]; return m[1] === '<' ? id < n : m[1] === '<=' ? id <= n : m[1] === '>' ? id > n : id >= n; }
  m = /^\s*(\d+)\s*(<=|>=|<|>)\s*(?:type|currentItem\.type)\s*$/.exec(c);
  if (m) { const n = +m[1]; return m[2] === '<' ? n < id : m[2] === '<=' ? n <= id : m[2] === '>' ? n > id : n >= id; }
  if (/^\s*(?:currentItem\.)?Variant\s*==\s*ItemVariants\.\w+\s*$/.test(c)) return false;
  if (/^\s*(?:currentItem\.)?Variant\s*!=\s*ItemVariants\.\w+\s*$/.test(c)) return true;
  if (/^\s*ItemVariants\.\w+\s*==\s*(?:currentItem\.)?Variant\s*$/.test(c)) return false;
  if (/^\s*ItemVariants\.\w+\s*!=\s*(?:currentItem\.)?Variant\s*$/.test(c)) return true;
  return undefined;
}

let SCAN_SRC = null;
/** 全字段赋值/控制头扫描器：由 FIELDS 表逐字段拼装（备选支与 v1 正则同源=零漂移;
 *  autoReuse 单独扩 (?:true|false)）,命名字组定位字段名。 */
function scanSource() {
  if (SCAN_SRC === null) {
    SCAN_SRC = '(if|switch)\\s*\\('
      + FIELDS.map(([n, re]) => `|(?<F_${n}>${n === 'autoReuse' ? 'autoReuse = (?:true|false);' : re.source})`).join('');
  }
  return SCAN_SRC;
}

/** 段文本 → 该 id 的【基态】全字段终值（执行序）。
 *  种子=defaultToBase(text)（DefaultTo* 辅助族隐式赋值打底）→ 线性扫描覆写：
 *  无条件赋值后写覆盖;if 命中支/else 支按 evalBaseCond 递归求值后并入（后写胜）;
 *  switch 整块跳过（嵌套 switch(type) per-id 归并是 fieldsResolveSwitch 职能）;
 *  注释剥除（// 与 /* *\/——v1 残文层同口径,防注释伪赋值入面）。 */
function evalFields(text, id) {
  const clean = text.replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, '');
  const f = defaultToBase(clean, id);   // SW-V1 2026-09-04: 种子随 id 解算式实参
  const re = new RegExp(scanSource(), 'g');
  let m;
  while ((m = re.exec(clean))) {
    if (m[1] !== undefined) {   // 控制头
      const isSwitch = m[1] === 'switch';
      let j = re.lastIndex;
      while (j < clean.length && /\s/.test(clean[j])) j++;
      if (isSwitch) {
        re.lastIndex = clean[j] === '{' ? skipBraced(clean, j) : skipSimple(clean, j);
        if (re.lastIndex <= j) re.lastIndex = clean.length;
        continue;
      }
      const afterHeader = scanParen(clean, re.lastIndex);
      const cond = clean.slice(re.lastIndex, afterHeader - 1);
      const parsed = consumeIf(clean, afterHeader);
      if (!parsed) { re.lastIndex = afterHeader; continue; }
      re.lastIndex = parsed.end;
      const verdict = evalBaseCond(cond, id);
      const branch = verdict === true ? parsed.body : parsed.elseBody;   // undefined=不可解 → 基态口径走 else
      if (branch) Object.assign(f, evalFields(branch, id));
      continue;
    }
    for (const g in m.groups) {
      if (m.groups[g] === undefined) continue;
      const name = g.slice(2);
      const def = FIELDS.find(([n]) => n === name);
      if (def[2] === 'b') f[name] = name === 'autoReuse' ? (/false/.test(m[0]) ? 0 : 1) : 1;
      else {
        const vm = def[1].exec(m[0]);
        f[name] = def[2] === 'f' ? parseFloat(vm[1]) : parseInt(vm[1], 10);
      }
    }
  }
  // SW-BK1 2026-09-06: createWall 共享算式补提取（fill-when-undefined 零漂移）。
  // FIELDS 字面正则 `\bcreateWall = (\d+);` 不命中 `createWall = 116 + type - 1948;`
  // 共享算式形态（Item.cs:21139/21428/22090/22370/24086/26651/33328 七处 case 体,
  // 共享 fallthrough 组/嵌套 case 专属段）→ 组成员与组末支整键缺失（35 件墙物品缺口,
  // 对账面 = vanilla-wallitems.json 292 项）。fill-when-undefined：字面/种子已值不覆写
  // （既有 257 条 createWall 零漂移,后写序仍由主扫描承担）;末匹配→首匹配回落与
  // lastFieldMatch 同口径（残文=无条件裸语句面,Variant 变体支不入）。
  if (f.createWall === undefined) {
    const em = lastFieldMatch(clean, /\bcreateWall = ([^;]+);/);
    if (em) {
      const wv = evalArithExpr(em[1], id);
      if (wv !== undefined) f.createWall = wv;
    }
  }
  // SW-BK1: useTurn 结构层补提取（同款 fill-when-undefined,布尔语义与 FIELDS 族同构
  // ——只认显式 `useTurn = true;` 取末匹配）。useTurn 此前全靠 EXTRA_USETURN
  // （combat 提取器侧）,其对【嵌套 switch 内 fallthrough 组非末支】漏覆盖（2210-2212/
  // 2432-2433/2789-2790 八件,combat json 同位 null 同根因）→ 本批新建条目缺 useTurn。
  // 对既有条目零漂移：sf 增值走覆写同值门,cur 缺键不新增（createWall 补键规则外）。
  if (f.useTurn === undefined) {
    const um = lastFieldMatch(clean, /(?:^|[^\w.])useTurn = true;/);
    if (um) f.useTurn = 1;
  }
  return f;
}

/** 单个 switch(type) 的 per-id 全字段解析（close 时调用;子层已解析存 sw.fields） */
function fieldsResolveSwitch(sw, body) {
  sw.fields = new Map();
  const ids = [...sw.cases.keys()].filter((k) => k !== null);
  const stripComment = (s) => s.replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, '');
  // fallthrough 分组：连续 case 标签,中间段全空白 → 共享【末支段】为组 body
  const groups = [];
  let run = [];
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    const rec = sw.cases.get(id);
    run.push(id);
    const empty = stripComment(sliceHoles(body, rec)).trim() === '';
    if (!empty || i === ids.length - 1) { groups.push({ members: run, bodyRec: rec }); run = []; }
  }
  for (const g of groups) {
    const bodyText = sliceHoles(body, g.bodyRec);
    for (const id of g.members) {
      // SW-V1 2026-09-04: helper 种子登记（合并层"helper 种子 id 整条落表"判据——
      // fallthrough 组非末支等 v1 段归属扫不到的 DefaultTo* 调用形态）
      if (Object.keys(defaultToBase(bodyText, id)).length) HELPER_SEED.add(id);
      const f = evalFields(bodyText, id);
      for (const child of g.bodyRec.nested) {
        const cf = child.fields?.get(id);
        if (cf) Object.assign(f, cf);   // 嵌套 switch(type) per-id 条目覆盖（执行序在后）
      }
      // 空对象也登记——「基态缺省」是判定结果（合并层的删键规则需要它）,
      // 与 placeStyle 时代「无值=不登记」不同（那里无值即无事可做）
      sw.fields.set(id, f);
    }
  }
  // default: 段（key=null）——无条件/区间赋值无法按 id 归属,不解（v1 同口径整段丢弃）;
  // 但其内嵌套 switch(type) 的 per-id 条目按 id 归并（显式 case 优先）
  const defRec = sw.cases.get(null);
  if (defRec) {
    for (const child of defRec.nested) {
      for (const [cid, cf] of child.fields ?? []) {
        if (!sw.fields.has(cid)) sw.fields.set(cid, cf);
      }
    }
  }
}

/** 结构层主入口（全字段）：SetDefaults1-5 → Map(vid → 基态全字段对象)。
 *  扫描器与 structuralPlaceStyles 逐字节同构（孔剥/嵌套归并/最外层落总表后法覆盖前法）。 */
function structuralFields(src) {
  const out = new Map();
  for (const n of [1, 2, 3, 4, 5]) {
    const body = methodBodyOf(src, `public void SetDefaults${n}(`)
      || methodBodyOf(src, `private void SetDefaults${n}(`)
      || methodBodyOf(src, `void SetDefaults${n}(`);
    if (!body) continue;
    const tokRe = /switch\s*\(([^)]*)\)|case (\d+):|default:|[{}]/g;
    const stack = [];
    let depth = 0, m;
    while ((m = tokRe.exec(body))) {
      const t = m[0];
      if (t.startsWith('switch')) {
        stack.push({ isType: /switch\s*\(\s*(?:type|currentItem\.type)\b/.test(t), opened: false, bodyDepth: -1, tokStart: m.index, cur: null, segStart: 0, cases: new Map() });
      } else if (t === '{') {
        depth++;
        const top = stack[stack.length - 1];
        if (top && !top.opened) { top.opened = true; top.bodyDepth = depth; top.segStart = m.index + 1; }
      } else if (t === '}') {
        const top = stack[stack.length - 1];
        if (top && top.opened && depth === top.bodyDepth) {
          stack.pop();
          depth--;
          if (top.isType) {
            if (top.cur !== null) psRec(top).end = m.index;
            const parent = stack[stack.length - 1];
            if (parent && parent.isType && parent.opened) {
              const pr = psRec(parent);
              pr.holes.push([top.tokStart, m.index + 1]);
              pr.nested.push(top);
            }
            fieldsResolveSwitch(top, body);
            if (!stack.some((s) => s.isType && s.opened)) {
              for (const [id, f] of top.fields) out.set(id, f);   // 最外层才落总表（后法覆盖前法=v1 同序）
            }
          }
          continue;
        }
        depth--;
      } else {
        const top = stack[stack.length - 1];
        if (top && top.opened && top.isType) {
          if (top.cur !== null) psRec(top).end = m.index;
          top.cur = t === 'default:' ? null : +m[2];
          top.segStart = m.index + t.length;
        }
      }
    }
  }
  return out;
}

// ================= ★SW-BK1 if 区间段向上归因（2026-09-06,wallitems 提取器路径 B 同构） =================
// `if (type <cmp> N && type <cmp> M) { … }` 区间块不被任何 case 段归属
// （fieldsResolveSwitch 只分派显式 case,default 段整段丢弃——Item.cs:22764-22769
// default 支内 2263/2264 白/蓝朝佰墙区间块即此形态,createWall 整缺）。
// 平衡花括号取 if 体;【仅收 createWall 体】（区间体常含 createTile 算式/value 等
// FUNC 域外或不可解字段,盲收会超预期扩面——其余字段维持既有口径零漂移）;
// 区间内逐 id evalFields（基态口径,useTurn 仍由 EXTRA_USETURN 后置叠加补齐）。
function structuralIfRanges(src) {
  const out = new Map();
  const rangeRe = /if \(type (>=|>|<=|<) (\d+) && type (>=|>|<=|<) (\d+)\)/g;
  const cmp = (op, a, b) => (op === '>=' ? a >= b : op === '>' ? a > b : op === '<=' ? a <= b : a < b);
  for (const n of [1, 2, 3, 4, 5]) {
    const body = methodBodyOf(src, `public void SetDefaults${n}(`)
      || methodBodyOf(src, `private void SetDefaults${n}(`)
      || methodBodyOf(src, `void SetDefaults${n}(`);
    if (!body) continue;
    let m;
    while ((m = rangeRe.exec(body))) {
      // 平衡花括号取 if 体（{ 起算,净深度归零止——同 wallitems 提取器路径 B）
      const brace = body.indexOf('{', m.index + m[0].length);
      if (brace < 0) continue;
      let d = 0, end = -1;
      for (let i = brace; i < body.length; i++) {
        if (body[i] === '{') d++;
        else if (body[i] === '}') { d--; if (d === 0) { end = i; break; } }
      }
      if (end < 0) continue;
      rangeRe.lastIndex = end + 1;
      const ifBody = body.slice(brace + 1, end);
      if (!/\bcreateWall\s*=/.test(ifBody)) continue;   // SW-BK1: 仅收 createWall 体
      const [lo, hi] = [Number(m[2]), Number(m[4])].sort((a, b) => a - b);
      for (let id = lo; id <= hi; id++) {
        if (!cmp(m[1], id, Number(m[2])) || !cmp(m[3], id, Number(m[4]))) continue;
        const f = evalFields(ifBody, id);
        if (f.createWall !== undefined) out.set(id, f);
      }
    }
  }
  return out;
}


// ================= ★拓扑层残文 + 同字段后写覆盖（十五批备B 收尾,2026-09-03） =================
// 缺陷：v1 `seg.match(re)` 取首匹配——case 段内同字段【无条件】双赋值时 C# 语义=
// 后写生效（实例：496 灵风筝 knockBack 0f→2f 双赋值、498/1989/3977 展示人偶
// createTile 128/269→470/475 后写=1.4 改版终值,items.ts:926-931 曾备案"只抓首值"
// 帽架放成女模特的根因;2209 超级魔药 healMana 300→400 实为 1456→1458 版值变更,
// 见 DELEGATE_EXPANSION 退役注）。
// ★盲取"全段最后命中"是错的：SetDefaults 段内还有【条件面】——①`if (Variant ==
// ItemVariants.WeakerVariant) { damage = 14; }`（112/157/517/683/725/1314/1319/
// 1325/2623/3069 等变体支,基态=拓扑层值,变体值不入单值画像面）;②嵌套 switch(type)
// 他 id 支（3292/3834/3857——本 id 终值在嵌套 case 内,per-id 归并是 PS-STRUCT
// 结构层职能,本文本层不碰）。故后写扫描只对【拓扑层残文】（剥全部 {} 块 + 无括号
// 控制语句体后的裸语句面）做——残文里只剩无条件赋值,线性扫取最后命中=执行序终值。
// 边界：只覆盖同一 case 段（同一工作对象）的无条件赋值序——跨对象继承链
// （DefaultTo* 基座/CopyFrom/委托展开/SetFoodDefaults 合并）语义不变（各链仍
// "基底打底→后段覆写",与本语义同向）。

/** 字符串/注释感知的块级消耗：i 指向 '{' → 返回配对 '}' 之后下标；失败返回 -1 */
function skipBraced(text, i) {
  const n = text.length;
  let d = 0;
  for (; i < n; i++) {
    const ch = text[i];
    if (ch === '"' || ch === "'") {
      const q = ch; i++;
      while (i < n && text[i] !== q) { if (text[i] === '\\') i++; i++; }
      continue;
    }
    if (ch === '/' && text[i + 1] === '/') { while (i < n && text[i] !== '\n') i++; i--; continue; }
    if (ch === '/' && text[i + 1] === '*') { const e = text.indexOf('*/', i + 2); i = e < 0 ? n : e + 1; continue; }
    if (ch === '{') d++;
    else if (ch === '}') { d--; if (d === 0) return i + 1; }
  }
  return -1;
}

/** 段文本 → 拓扑层残文：剥全部 {} 块（含嵌套 switch/条件支体）与无括号
 *  if/else/for/while/foreach/switch/do 的头+单语句体,字符串/注释感知。
 *  残文=该 case 段的【无条件裸语句面】（含 goto case/return 等无害残迹）。 */
function topStatementText(text) {
  let out = '';
  let i = 0;
  const n = text.length;
  const KW = /^(foreach|while|switch|else|if|for|do)\b/;
  while (i < n) {
    const ch = text[i];
    if (ch === '/' && text[i + 1] === '/') { while (i < n && text[i] !== '\n') i++; continue; }
    if (ch === '/' && text[i + 1] === '*') { const e = text.indexOf('*/', i + 2); i = e < 0 ? n : e + 2; continue; }
    if (ch === '"' || ch === "'") {
      const q = ch; i++;
      while (i < n && text[i] !== q) { if (text[i] === '\\') i++; i++; }
      i++; out += ' ';
      continue;
    }
    if (ch === '{') { i = skipBraced(text, i); if (i < 0) break; out += ' '; continue; }
    if (depth0Kw(text, i)) {
      const m = KW.exec(text.slice(i, i + 9));
      if (m) {
        let j = i + m[1].length;
        while (j < n && /\s/.test(text[j])) j++;
        if (text[j] === '(') {
          // 跳过头括号（串感知配对）
          let pd = 0;
          for (; j < n; j++) {
            const c2 = text[j];
            if (c2 === '"' || c2 === "'") { const q = c2; j++; while (j < n && text[j] !== q) { if (text[j] === '\\') j++; j++; } continue; }
            if (c2 === '(') pd++;
            else if (c2 === ')') { pd--; if (pd === 0) { j++; break; } }
          }
          i = j;
          // 头后：{ 块 → 块剥;裸语句 → 单语句剥（括号感知到 ';'）
          while (i < n && /\s/.test(text[i])) i++;
          if (text[i] === '{') { i = skipBraced(text, i); if (i < 0) break; out += ' '; continue; }
          i = skipSimple(text, i);
          out += ' ';
          continue;
        }
        // 无头型（do {…} / else {…} / else 裸语句）：落回主循环逐字符处理
        //（'{' 块剥/下个关键词再判）;此处只防 else-if 链重复计词——i 原位前进 1
        out += text[i]; i++;
        continue;
      }
    }
    out += ch; i++;
  }
  return out;
}

/** 括号感知的单语句消耗：到 pd==0 的 ';'（含）止 */
function skipSimple(text, i) {
  const n = text.length;
  let pd = 0;
  for (; i < n; i++) {
    const ch = text[i];
    if (ch === '"' || ch === "'") { const q = ch; i++; while (i < n && text[i] !== q) { if (text[i] === '\\') i++; i++; } continue; }
    if (ch === '(') pd++;
    else if (ch === ')') pd--;
    else if (ch === ';' && pd === 0) return i + 1;
  }
  return i;
}

/** i 是否处于词首（左邻非词字符）——防 useTurn 内 "for" 等子串误判 */
function depth0Kw(text, i) {
  if (i > 0 && /\w/.test(text[i - 1])) return false;
  return /^(foreach|while|switch|else|if|for|do)\b/.test(text.slice(i, i + 9));
}

const RESIDUE_CACHE = new Map();
function segResidue(seg) {
  let r = RESIDUE_CACHE.get(seg);
  if (r === undefined) { r = topStatementText(seg); RESIDUE_CACHE.set(seg, r); }
  return r;
}

/** 同字段多次【无条件】赋值=后写生效：对拓扑层残文全局扫取【最后】命中。
 *  ★残文无命中 → 回落 v1 整段首匹配：条件面（Variant 变体支/嵌套 switch 他 id 支）
 *  的提取结果与本批前【逐字节相同】（旧口径原样保留）——本批只改"拓扑层出现
 *  同字段多次无条件赋值"这一类的取值（首→后写）,其余一概不动（零超界 diff 闸门）：
 *  · 544/556/557/5334 的 useStyle=4/consumable=1 在 `if (Variant != Disabled…) {…}`
 *    内（对基态恒真）——盲剥会整键丢失（boss 召唤物不再 consumable=实机回归）,
 *    回落面保住旧值;
 *  · 3292 妙语悠悠球 damage/shoot/knockBack 旧值系嵌套 switch case 3278 首匹配伪值,
 *    真值在嵌套 case 3292 内——文本层不碰（同 PS-STRUCT 前的 placeStyle 旧账,
 *    per-id 归并属结构层后续扩展,本批登记不动）。 */
function lastFieldMatch(seg, re) {
  const residue = segResidue(seg);
  const gre = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
  let m, last = null;
  while ((m = gre.exec(residue))) last = m;
  if (last) return last;
  return seg.match(re);
}

// 字段正则表：[输出名, 正则, 类型]
const FIELDS = [
  ['melee', /melee = true;/, 'b'],
  ['ranged', /ranged = true;/, 'b'],
  ['magic', /magic = true;/, 'b'],
  ['summon', /summon = true;/, 'b'],
  ['noMelee', /noMelee = true;/, 'b'],
  ['consumable', /consumable = true;/, 'b'],
  ['potion', /potion = true;/, 'b'],
  ['channel', /channel = true;/, 'b'],
  ['autoReuse', /autoReuse = true;/, 'b'],
  ['torch', /torch = true;/, 'b'],
  ['expert', /expert = true;/, 'b'],
  ['questItem', /questItem = true;/, 'b'],
  ['damage', /\bdamage = (\d+);/, 'n'],
  ['mana', /\bmana = (\d+);/, 'n'],
  ['pick', /\bpick = (\d+);/, 'n'],
  ['axe', /\baxe = (\d+);/, 'n'],
  ['hammer', /\bhammer = (\d+);/, 'n'],
  ['createTile', /\bcreateTile = (\d+);/, 'n'],
  ['createWall', /\bcreateWall = (\d+);/, 'n'],
  ['placeStyle', /\bplaceStyle = (\d+);/, 'n'],
  ['healLife', /\bhealLife = (\d+);/, 'n'],
  ['healMana', /\bhealMana = (\d+);/, 'n'],
  ['buffType', /\bbuffType = (-?\d+);/, 'n'],
  ['buffTime', /\bbuffTime = (\d+);/, 'n'],
  ['ammo', /\bammo = (\d+);/, 'n'],
  ['useAmmo', /\buseAmmo = (\d+);/, 'n'],
  ['notAmmo', /notAmmo = true;/, 'b'],
  // SW-AA1 2026-09-04（红队 F2）：noUseGraphic case 体显式 true 纳入提取——此前
  //  仅 DefaultTo* helper 种子（:47782/:47823/:47836/:48011/:48036）隐式落键,
  //  case 体显式 `noUseGraphic = true;`（4682 :38562/4702 :38651/2436-2438 等
  //  ~206 件）漏提。BASE_BOOLEANS 同步登记（种子 × 显式 false 取消协同——
  //  1457/1458 SetDefaults 域现无显式 false,唯一 `noUseGraphic = false;` 在
  //  ResetStats :48994 域外,登记零行为差）。
  ['noUseGraphic', /noUseGraphic = true;/, 'b'],
  ['shoot', /\bshoot = (-?\d+);/, 'n'],
  ['holdStyle', /\bholdStyle = (\d+);/, 'n'],
  ['useStyle', /\buseStyle = (\d+);/, 'n'],
  ['knockBack', /\bknockBack = ([\d.]+)f;/, 'f'],
  ['fishingPole', /\bfishingPole = (\d+);/, 'n'],
  ['bait', /\bbait = (\d+);/, 'n'],
];

const FUNC = {};
// SW-V1 2026-09-04: DefaultTo* 种子 id 集（fieldsResolveSwitch 填充）——合并层对
// 「v1 无条目」的 id 按基态结构值整条落表（旧口径只 placeStyle 最小新增）。
const HELPER_SEED = new Set();
// ================= ★SW-V1 2026-09-04 DefaultTo* 全族参数化展开（盲区根治批） =================
// 此前 defaultToBase 只认武器族六 helper 且实参只认数字字面——Item.cs 的共享算式
// helper（PlaceableTile 双参/Bomb/Solution/Whip/Kite/Vanitypet/CapturedCritter/
// Torch/MusicBox/Banner/Monolith/SeaShell/GolfBall/GolfClub/LawnMower/Guitar/
// QuestFish/VoiceOverrideAccessory）整族漏提,四批内容靠手工回填表承载
// （items.ts PLACE_STYLE_BACKFILL_1458 / vanillaItemCombat.ts EXTRACT_PATCH /
//   vanillaItemFunc.ts FUNC 手补）。展开语义逐条亲读 1457 Item.cs helper 函数体
// （:47754-48660;1458 同位逐字节同文已 diff 确认）,金标=手工回填表逐字段对拍。
//
// 只记 FUNC 域字段（FIELDS 列 + 既有 noUseGraphic 惯例）;不在 FUNC 域的
// width/height/useTime/useAnimation/shootSpeed/UseSound/value/rare/mountType/
// headSlot/bodySlot/legSlot/accessory/vanity/flame/noWet/makeNPC/tileBoost
// 仍不在本表面（combat/items 各自权威面承载）。

/** 括号感知顶层逗号分割（helper 实参串 → 实参文本数组） */
function splitArgs(text) {
  const out = [];
  let d = 0, cur = '';
  for (const ch of text) {
    if (ch === '(') d++;
    else if (ch === ')') d--;
    if (ch === ',' && d === 0) { out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim() !== '') out.push(cur);
  return out;
}

/** helper 实参求值：剥显式转换 (ushort)/(short)/(sbyte)/(uint)/(int)、剥 float 后缀 f、
 *  `type` 线性算式按当前 id 求值（Item.cs 共享算式仅 数字/+/－/括号 与 type,如
 *  `1086 + (type - 5594)`(:44027)/`type - 4367 + 766`(:37245)）;形参名/具名参数/
 *  AmmoID 枚举等不可解 → undefined。 */
function evalHelperArg(expr, id) {
  if (expr === undefined) return undefined;
  let s = expr.replace(/\(\s*(?:ushort|short|sbyte|uint|int)\s*\)/g, '').replace(/\s+/g, '');
  if (/^[-+]?\d+$/.test(s)) return parseInt(s, 10);
  if (/^[-+]?\d+\.\d+f$/.test(s) || /^[-+]?\d+f$/.test(s) || /^[-+]?\d+\.\d+$/.test(s)) return parseFloat(s);
  if (!/\btype\b/.test(s)) return undefined;
  if (!/^[\d()+-]+$/.test(s.replace(/\btype\b/g, ''))) return undefined;
  return Function(`"use strict";return (${s.replace(/\btype\b/g, String(id))});`)();
}

/** ammo 形参：数字/算式 或 AmmoID.X 枚举（AMMO_ID 权威表,缺项 -1 兜底同 combat 提取器） */
function evalAmmoArg(expr, id) {
  if (expr === undefined) return undefined;
  const em = /AmmoID\.(\w+)/.exec(expr);
  if (em) return AMMO_ID[em[1]] ?? -1;
  return evalHelperArg(expr, id);
}

// SW-BK1 2026-09-06: createWall 共享算式求值（extract-wallitems.mjs evalExpr 同构移植）。
// 剥 (ushort)/(int) 显式转换、type 代入 id,只解纯算术（数字/+-*/()/空格）;不可解返回
// undefined（与 wallitems 提取器 throw 不同——itemfunc 全字段面远宽于 createWall,
// 未知形态拒值不拒产,由 diff 闸门兜底）。
function evalArithExpr(expr, id) {
  if (expr === undefined) return undefined;
  const js = expr
    .replace(/\(ushort\)/g, '')
    .replace(/\(int\)/g, '')
    .replace(/\btype\b/g, `(${id})`)
    .replace(/\s+/g, '');
  if (!/^[-+*/()0-9]+$/.test(js)) return undefined;
  return Math.trunc(Function(`"use strict"; return (${js});`)());
}

/** 段内首个 `DefaultTo<name>( … )` 调用的实参串（括号配对,非首 `)` 截断）。
 *  同名 helper 在同一 case 段重复调用不存在（全源审计）;text 须已剥注释
 *  （defaultToBase 入口统一 strip,evalFields 传入的 clean 已剥）。 */
function callOf(text, name) {
  const re = new RegExp(`\\bDefaultTo${name}\\s*\\(`, 'g');
  let m;
  while ((m = re.exec(text))) {
    let d = 1, j = m.index + m[0].length;
    for (; j < text.length; j++) {
      const ch = text[j];
      if (ch === '(') d++;
      else if (ch === ')') { d--; if (d === 0) break; }
    }
    return text.slice(m.index + m[0].length, j);
  }
  return undefined;
}

/** 布尔实参（hasAutoReuse: true 具名/位置 true）→ 1;false/缺席 → undefined（缺省） */
function boolArg(expr) {
  return expr !== undefined && /\btrue\b/.test(expr) ? 1 : undefined;
}

/** SW-V1: 种子布尔取消——case 段拓扑层残文（无条件语句面,剥条件块,同
 *  lastFieldMatch 口径）里该字段【最后一次】显式布尔赋值为 false 时,取消
 *  DefaultTo* 种子的 true。只作用于种子（helper 隐式值）,不动 FIELDS 显式面——
 *  5526/2611 型 `autoReuse = false;…autoReuse = true;` 双赋值由 last-wins 保留
 *  true（与 combat 提取器同口径）;1325 型「变体支内 true(v1 段回落伪值)+基态显式
 *  false」不经此处（无种子）,由 F-STRUCT 合并层 1→0 记录（显式 false=提取事实）。
 *  实证面（1457 Item.cs）:4682/4702 回力镖 ranged=false(:38561/:38650)、
 *  5324/5329/5330 掘块权杖 consumable=false(:42257)、5481 复刻祭坛 consumable=
 *  false(:43196)、5629 星星炮 ranged=false(:44242)、case(:35612) autoReuse=false、
 *  case(:43121) useTurn=false。false 在条件块内的不取消（残文已剥块,基态口径）。 */
const BASE_BOOLEANS = ['melee', 'ranged', 'magic', 'summon', 'noMelee', 'consumable', 'autoReuse',
  'channel', 'torch', 'potion', 'notAmmo', 'useTurn', 'noUseGraphic'];   // SW-AA1 2026-09-04（红队 F2）协同登记
function cancelFalseBooleans(f, text) {
  if (!text) return;
  const residue = segResidue(text);
  for (const k of BASE_BOOLEANS) {
    if (f[k] === undefined) continue;
    const re = new RegExp(`(?:^|[^\\w.])${k} = (true|false);`, 'g');
    let m, last = null;
    while ((m = re.exec(residue))) last = m[1];
    if (last === 'false') delete f[k];
  }
}

/** DefaultTo* 全族基座（case 段内辅助调用 → 基础字段;case 显式赋值随后在
 *  FIELDS pass 覆盖——显式=终值,种子先行=「先 DefaultTo* 后覆盖」源序常态）。
 *  武器族六分支语义与旧版逐字段等价,仅扩实参面（AmmoID 枚举/线性算式）:
 *  · MagicWeapon(p,t,v[,autoReuse]) → useStyle5/magic/noMelee/shoot
 *  · RangedWeapon(p,ammo,t,v[,autoReuse]) → useStyle5/ranged/noMelee/shoot/useAmmo
 *  · Bow(t,v[,autoReuse]) = RangedWeapon(1,Arrow=40,…)（★旧版 useAmmo 硬编码 1
 *    系笔误——1457 Item.cs:48427 `DefaultToRangedWeapon(1, AmmoID.Arrow,…)`,
 *    AmmoID.Arrow=40;金标 vanillaItemCombat EXTRACT_PATCH '4058'/'4381' useAmmo 40）
 *  · Staff(p,v,t,mana) = MagicWeapon(…,autoReuse:true)+mana（:48016 委托链）
 *  · Spear(p,v,t) → useStyle5/melee+noMelee+noUseGraphic/shoot
 *  · ThrownWeapon(p,t,v[,autoReuse]) → useStyle1/ranged/noMelee/consumable/shoot
 *  新增族（helper 体逐行抄,行号=1457）:
 *  · PlaceableTile(tile[,style=0]) :48494-48509 → createTile/placeStyle/useStyle1/
 *    useTurn1/autoReuse/consumable（长手写已存量条目 :35986 case 4783 同值互证）
 *  · PlaceableWall(wall) :48405-48416 → createWall/useStyle1/useTurn1/autoReuse/consumable
 *  · Bomb(proj,speed) :47771-47783 → useStyle1/shoot/consumable/noMelee/noUseGraphic
 *  · Solution(pid) :47800-47810 → shoot=pid-145/ammo=AmmoID.Solution=780/consumable
 *  · Whip(p,dmg,kb,spd[,anim]) :47811-47827 → useStyle1/damage/knockBack/shoot/
 *    noMelee/summon/noUseGraphic(:47824;SW-X1 2026-09-04 补,18 鞭重产物缺) +
 *    显式 autoReuse=false→0（体首行 :47813;1325 显式 false=提取事实同款）
 *  · Kite(p) :47829-47840 = ThrownWeapon(p,15,8f) 后取反 consumable/ranged(:47834-47835)
 *    +noUseGraphic/createTile 723 → shoot/useStyle1/noMelee/noUseGraphic/createTile
 *  · Vanitypet(p,buff) :47937-47950 → damage0/useStyle1/noMelee/buffType/shoot
 *  · CapturedCritter(npc) :48001-48014 → useStyle1/useTurn1/autoReuse/consumable/
 *    createTile724/noUseGraphic
 *  · Torch(style[,allowWater]) :48471-48487 → holdStyle1/autoReuse/consumable/
 *    createTile4/placeStyle/useStyle1/useTurn1
 *  · MusicBox(style) :48638-48652 → createTile139/placeStyle/useStyle1/useTurn1/
 *    autoReuse/consumable
 *  · Banner([style=0]) :47754-47760 = PlaceableTile(91,style)+width/height
 *  · Monolith(tile[,style=0]) :47762-47769 = PlaceableTile(tile,style)
 *  · SeaShell() :47967-47999 → createTile324/useStyle1/autoReuse/consumable +
 *    嵌套 switch(type) 逐 id placeStyle(:47975-47996;default 支只赋 value)
 *  · GolfBall(p) :35445-35460 → shoot/useStyle1/noMelee/noUseGraphic
 *  · GolfClub(w,h) :48518-48530 → channel/useStyle8/holdStyle4/shoot722/noMelee
 *  · LawnMower(w,h) :48532-48541 → useStyle11/holdStyle1/autoReuse
 *  · Guitar() :48628-48636 → autoReuse/holdStyle5/useStyle12
 *  · QuestFish() :27652-27657 → questItem
 *  · VoiceOverrideAccessory(id) :47786-47798 → useStyle4
 *  无 FUNC 域字段不展开（全族清单收口）:Minecart(:48398 mountType)/Headgear(:48594
 *  headSlot)/Body(:48601 bodySlot)/Legs(:48608 legSlot)/Accessory(:48615 accessory)/
 *  InfoAccessory(:48622 accessory+hasVanityEffects)。Food/HealingPotion 走
 *  SetFoodDefaults 专道(:851 区块)不在此层。 */
const STRIP_CACHE = new Map();
function stripCommentsCached(text) {
  let r = STRIP_CACHE.get(text);
  if (r === undefined) {
    r = text.replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, '');
    if (STRIP_CACHE.size < 4096) STRIP_CACHE.set(text, r);
  }
  return r;
}

function defaultToBase(seg, id) {
  const f = {};
  // 注释只剥一次（20+ callOf 复用同一净文本;RESIDUE_CACHE 同思路防重剥）
  const segClean = stripCommentsCached(seg);
  let m;
  // —— 武器族（既有;SW-V1 扩实参面） ——
  if ((m = callOf(segClean, 'MagicWeapon')) !== undefined) {
    const a = splitArgs(m);
    const proj = evalHelperArg(a[0], id);
    if (proj !== undefined) {
      f.shoot = proj; f.useStyle = 5; f.magic = 1; f.noMelee = 1;
      const au = boolArg(a[3]); if (au) f.autoReuse = au;
    }
  }
  if ((m = callOf(segClean, 'RangedWeapon')) !== undefined) {
    const a = splitArgs(m);
    const proj = evalHelperArg(a[0], id), ammo = evalAmmoArg(a[1], id);
    if (proj !== undefined && ammo !== undefined) {
      f.shoot = proj; f.useAmmo = ammo; f.useStyle = 5; f.ranged = 1; f.noMelee = 1;
      const au = boolArg(a[4]); if (au) f.autoReuse = au;
    }
  }
  if ((m = callOf(segClean, 'Bow')) !== undefined) {
    const a = splitArgs(m);
    if (evalHelperArg(a[0], id) !== undefined) {
      f.shoot = 1; f.useAmmo = AMMO_ID.Arrow ?? 40; f.useStyle = 5; f.ranged = 1; f.noMelee = 1;
      const au = boolArg(a[2]); if (au) f.autoReuse = au;
    }
  }
  if ((m = callOf(segClean, 'Staff')) !== undefined) {
    const a = splitArgs(m);
    const proj = evalHelperArg(a[0], id), mana = evalHelperArg(a[3], id);
    if (proj !== undefined && mana !== undefined) {
      f.shoot = proj; f.useStyle = 5; f.magic = 1; f.noMelee = 1; f.autoReuse = 1; f.mana = mana;
    }
  }
  if ((m = callOf(segClean, 'Spear')) !== undefined) {
    const a = splitArgs(m);
    const proj = evalHelperArg(a[0], id);
    if (proj !== undefined) { f.shoot = proj; f.useStyle = 5; f.melee = 1; f.noMelee = 1; f.noUseGraphic = 1; }
  }
  if ((m = callOf(segClean, 'ThrownWeapon')) !== undefined) {
    const a = splitArgs(m);
    const proj = evalHelperArg(a[0], id);
    if (proj !== undefined) {
      f.shoot = proj; f.useStyle = 1; f.ranged = 1; f.noMelee = 1; f.consumable = 1;
      const au = boolArg(a[3]); if (au) f.autoReuse = au;
    }
  }
  // —— SW-V1 2026-09-04 新增族 ——
  if ((m = callOf(segClean, 'PlaceableTile')) !== undefined) {
    const a = splitArgs(m);
    const tile = evalHelperArg(a[0], id);
    if (tile !== undefined) {
      const st = a.length > 1 ? evalHelperArg(a[1], id) : 0;
      if (st !== undefined) {
        f.createTile = tile; f.placeStyle = st;
        f.useStyle = 1; f.useTurn = 1; f.autoReuse = 1; f.consumable = 1;
      }
    }
  }
  if ((m = callOf(segClean, 'PlaceableWall')) !== undefined) {
    const a = splitArgs(m);
    const wall = evalHelperArg(a[0], id);
    if (wall !== undefined) {
      f.createWall = wall; f.useStyle = 1; f.useTurn = 1; f.autoReuse = 1; f.consumable = 1;
    }
  }
  if ((m = callOf(segClean, 'Bomb')) !== undefined) {
    const a = splitArgs(m);
    const proj = evalHelperArg(a[0], id);
    if (proj !== undefined) {
      f.useStyle = 1; f.shoot = proj; f.consumable = 1; f.noMelee = 1; f.noUseGraphic = 1;
    }
  }
  if ((m = callOf(segClean, 'Solution')) !== undefined) {
    const a = splitArgs(m);
    const pid = evalHelperArg(a[0], id);
    if (pid !== undefined) {
      f.shoot = pid - 145; f.ammo = AMMO_ID.Solution ?? 780; f.consumable = 1;
    }
  }
  if ((m = callOf(segClean, 'Whip')) !== undefined) {
    const a = splitArgs(m);
    const proj = evalHelperArg(a[0], id);
    if (proj !== undefined) {
      f.useStyle = 1; f.autoReuse = 0;
      const dmg = evalHelperArg(a[1], id); if (dmg !== undefined) f.damage = dmg;
      const kb = evalHelperArg(a[2], id); if (kb !== undefined) f.knockBack = kb;
      // SW-X1 2026-09-04（L-2①）：体首段 noUseGraphic = true（Item.cs:47824,DefaultToWhip
      // 内第 10 行）——18 鞭重产物缺此键（使用期间不绘物品贴图,与 Kite/GolfBall 同）
      f.shoot = proj; f.noMelee = 1; f.summon = 1; f.noUseGraphic = 1;
    }
  }
  if ((m = callOf(segClean, 'Kite')) !== undefined) {
    const a = splitArgs(m);
    const proj = evalHelperArg(a[0], id);
    if (proj !== undefined) {
      f.shoot = proj; f.useStyle = 1; f.noMelee = 1; f.noUseGraphic = 1; f.createTile = 723;
    }
  }
  if ((m = callOf(segClean, 'Vanitypet')) !== undefined) {
    const a = splitArgs(m);
    const proj = evalHelperArg(a[0], id), buff = evalHelperArg(a[1], id);
    if (proj !== undefined && buff !== undefined) {
      f.damage = 0; f.useStyle = 1; f.noMelee = 1; f.buffType = buff; f.shoot = proj;
    }
  }
  if ((m = callOf(segClean, 'CapturedCritter')) !== undefined) {
    const a = splitArgs(m);
    if (evalHelperArg(a[0], id) !== undefined) {
      f.useStyle = 1; f.useTurn = 1; f.autoReuse = 1; f.consumable = 1; f.createTile = 724; f.noUseGraphic = 1;
    }
  }
  if ((m = callOf(segClean, 'Torch')) !== undefined) {
    const a = splitArgs(m);
    const st = evalHelperArg(a[0], id);
    if (st !== undefined) {
      f.holdStyle = 1; f.autoReuse = 1; f.consumable = 1; f.createTile = 4; f.placeStyle = st;
      f.useStyle = 1; f.useTurn = 1;
    }
  }
  if ((m = callOf(segClean, 'MusicBox')) !== undefined) {
    const a = splitArgs(m);
    const st = evalHelperArg(a[0], id);
    if (st !== undefined) {
      f.useStyle = 1; f.useTurn = 1; f.autoReuse = 1; f.consumable = 1; f.createTile = 139; f.placeStyle = st;
    }
  }
  if ((m = callOf(segClean, 'Banner')) !== undefined) {
    const a = splitArgs(m);
    const st = a.length ? evalHelperArg(a[0], id) : 0;
    if (st !== undefined) {
      f.createTile = 91; f.placeStyle = st; f.useStyle = 1; f.useTurn = 1; f.autoReuse = 1; f.consumable = 1;
    }
  }
  if ((m = callOf(segClean, 'Monolith')) !== undefined) {
    const a = splitArgs(m);
    const tile = evalHelperArg(a[0], id);
    if (tile !== undefined) {
      const st = a.length > 1 ? evalHelperArg(a[1], id) : 0;
      if (st !== undefined) {
        f.createTile = tile; f.placeStyle = st; f.useStyle = 1; f.useTurn = 1; f.autoReuse = 1; f.consumable = 1;
      }
    }
  }
  if (callOf(segClean, 'SeaShell') !== undefined) {
    // 嵌套 switch(type) 逐 id placeStyle（helper 体 :47975-47996;default 支不赋 placeStyle）
    const PS = { 4071: 12, 4072: 6, 4073: 9, 2626: 3 };
    f.useStyle = 1; f.autoReuse = 1; f.consumable = 1; f.createTile = 324;
    if (PS[id] !== undefined) f.placeStyle = PS[id];
  }
  if ((m = callOf(segClean, 'GolfBall')) !== undefined) {
    const a = splitArgs(m);
    const proj = evalHelperArg(a[0], id);
    if (proj !== undefined) { f.shoot = proj; f.useStyle = 1; f.noMelee = 1; f.noUseGraphic = 1; }
  }
  if ((m = callOf(segClean, 'GolfClub')) !== undefined) {
    const a = splitArgs(m);
    if (evalHelperArg(a[0], id) !== undefined) {
      f.channel = 1; f.useStyle = 8; f.holdStyle = 4; f.shoot = 722; f.noMelee = 1;
    }
  }
  if ((m = callOf(segClean, 'LawnMower')) !== undefined) {
    const a = splitArgs(m);
    if (evalHelperArg(a[0], id) !== undefined) {
      f.useStyle = 11; f.holdStyle = 1; f.autoReuse = 1;
    }
  }
  if (callOf(segClean, 'Guitar') !== undefined) {
    f.autoReuse = 1; f.holdStyle = 5; f.useStyle = 12;
  }
  if (callOf(segClean, 'QuestFish') !== undefined) {
    f.questItem = 1;
  }
  if (callOf(segClean, 'VoiceOverrideAccessory') !== undefined) {
    f.useStyle = 4;
  }
  cancelFalseBooleans(f, segClean);   // SW-V1: 种子布尔被段内无条件 false 尾随→取消（见函数注）
  return f;
}
for (const [id, seg] of SEGS) {
  const f = defaultToBase(seg, id);   // SW-V1 2026-09-04: 种子随 id 解算式实参（种子布尔取消在 defaultToBase 尾）
  for (const [name, re, type] of FIELDS) {
    const m = lastFieldMatch(seg, re);   // ★后写生效（首匹配→末匹配,见 lastFieldMatch 注）
    if (!m) continue;
    f[name] = type === 'b' ? 1 : type === 'f' ? parseFloat(m[1]) : parseInt(m[1], 10);
  }
  if (Object.keys(f).length) FUNC[id] = f;
}
// ★F-STRUCT 全字段基态修正（在 FIELDS 之后、手补丁之前——手补丁/食物/useTurn 链不受影响）。
// 合并语义（对 FUNC 的 diff 规则）：
//   · 已有条目：struct 有值 → 覆写（伪值纠偏）;struct 判「基态缺省」（辅助无隐式+基路径
//     无赋值）而 v1 有支内值 → 删除该键（autoReuse 缺省 false=键删除等价;数值缺省=无键）;
//     【不新增】cur 缺的键——缺档面（fallthrough 组非末支/嵌套 case 专属段）仍由 items.ts
//     运行时纠偏 / vanilla.json 回填链承载（防超预期 diff 与未审消费面漂移）;
//   · 无条目：仅 placeStyle 最小新增（PS-STRUCT v2 口径延续=金标 24 行面零 diff）;
//   · 清空条目：EXTRA_USETURN 命中则保 {useTurn:1}（useTurn 通道时序不变）,否则整条回收
//     （v1 对空段从不产条目,回收=维持「仅记非默认值」形态）;
//   · placeStyle 金标自检：泛化层 placeStyle 映射必须与旧 evalPlaceStyle 逐 id 全等,
//     漂移即拒产（exit 1）——①placeStyle 维零 diff 的机器闸门。
{
  const PS_OLD = structuralPlaceStyles(itemSrc);
  const STRUCT = structuralFields(itemSrc);
  // SW-BK1 2026-09-06: if 区间段归因面（2263/2264 default 支区间块;仅收 createWall 体）
  const RANGE = structuralIfRanges(itemSrc);
  let psDrift = 0;
  for (const [id, ps] of PS_OLD) {
    if (STRUCT.get(id)?.placeStyle !== ps) { console.error(`F-STRUCT placeStyle 漂移 ${id}: ${STRUCT.get(id)?.placeStyle} != ${ps}`); psDrift++; }
  }
  for (const [id, f] of STRUCT) {
    // SW-V1 2026-09-04: DefaultTo* 种子 placeStyle 不在 PS_OLD 面（helper 形参赋值
    // 是本批新解析面）——helper 种子 id 豁免"PS_OLD 缺值"比对;PS_OLD 有值时仍由
    // 上一循环全等把关（显式赋值覆写种子的 id 两法同值,不会走到豁免）。
    if (f.placeStyle !== undefined && !HELPER_SEED.has(Number(id)) && PS_OLD.get(id) !== f.placeStyle) { console.error(`F-STRUCT placeStyle 新增漂移 ${id}: ${f.placeStyle} != ${PS_OLD.get(id)}`); psDrift++; }
  }
  if (psDrift) { console.error(`F-STRUCT: placeStyle 金标漂移 ${psDrift} 处 — 拒绝产出`); process.exit(1); }
  // SW-BK1: 统一归并面 = STRUCT ∪ RANGE（显式 case 值 per-key 优先——RANGE 只补缺档,
  // 同 wallitems 提取器 path A 先于 path B 的首值优先序）
  const SF = new Map();
  for (const [id, sf0] of STRUCT) SF.set(id, RANGE.has(id) ? { ...RANGE.get(id), ...sf0 } : sf0);
  for (const [id, rf] of RANGE) if (!SF.has(id)) SF.set(id, rf);
  let fix = 0, del = 0, add = 0;
  const fixed = [], deleted = [], added = [];
  for (const [id, sf] of SF) {
    const cur = FUNC[id];
    if (cur) {
      for (const k of Object.keys(cur)) {
        if (sf[k] !== undefined) {
          if (cur[k] !== sf[k]) { fixed.push(`${id}.${k} ${cur[k]}->${sf[k]}`); cur[k] = sf[k]; fix++; }
        } else {
          deleted.push(`${id}.${k}(${cur[k]})`); delete cur[k]; del++;
        }
      }
      // SW-BK1: createWall 补键（仅此字段——其余字段维持「不新增 cur 缺的键」零漂移
      // 纪律）。7 件组末支既有条目（1957/2014/2160/2213/2434/2791/3762）由共享算式
      // 求值补上（Item.cs:21139 等七处,与 vanilla-wallitems.json 逐值对账）。
      if (cur.createWall === undefined && sf.createWall !== undefined) {
        cur.createWall = sf.createWall; fixed.push(`${id}.createWall +${sf.createWall}`); fix++;
      }
      if (!Object.keys(cur).length) {
        if (EXTRA_USETURN.get(Number(id)) === true) cur.useTurn = 1;
        else delete FUNC[id];
      }
    } else if (HELPER_SEED.has(Number(id))) {
      // SW-V1 2026-09-04: DefaultTo* 种子 id（fallthrough 组非末支等形态）——整条按
      // 基态结构值落表,与组末支的 v1 条目同口径（不再是 placeStyle 单键最小新增）。
      // 金标=vanillaItemFunc FUNC['5594']/['5595'] 与 EXTRACT_PATCH 重叠字段逐字段对拍。
      FUNC[id] = { ...sf };
      added.push(`${id}:${JSON.stringify(sf)}`); add++;
    } else if (sf.createWall !== undefined) {
      // SW-BK1 2026-09-06: createWall 缺档整条落表（共享 fallthrough 组非末支/嵌套
      // case 专属段/区间件——与组末支 v1 条目同口径;useTurn 由 EXTRA_USETURN 后置
      // 叠加补齐）。28 件整缺:1948-1956/2008-2013/2158-2159/2210-2212/2263-2264/
      // 2432-2433/2789-2790/3760-3761。
      FUNC[id] = { ...sf };
      added.push(`${id}:${JSON.stringify(sf)}`); add++;
    } else if (sf.placeStyle !== undefined) {
      FUNC[id] = { placeStyle: sf.placeStyle }; added.push(`${id}:${sf.placeStyle}`); add++;
    }
  }
  console.error(`F-STRUCT: 伪值覆写 ${fix} [${fixed.join(', ')}]`);
  console.error(`F-STRUCT: 支内伪键删除 ${del} [${deleted.join(', ')}]`);
  console.error(`F-STRUCT: 缺档补齐 ${add} 件 [${added.join(', ')}]`);
  if (process.env.ITEMFUNC_DIFF) writeFileSync(process.env.ITEMFUNC_DIFF, JSON.stringify({ fixed, deleted, added }, null, 1));
}
// 钓竿区段补丁：2290-2296 族在 case 段外的 type 区间块赋值（最近 switch 归属扫不到），
// 按源码实表补齐（Item.cs:23005-23040 前向扫描实证）。
for (const [id, pow] of Object.entries({ 2291: 15, 2293: 20, 2292: 30, 2295: 35, 2296: 40, 2294: 50 })) {
  FUNC[id] = { ...(FUNC[id] ?? {}), fishingPole: pow };
}
// 嵌套块首匹配错位补丁（collectCaseSegments 是文本段正则——嵌套 switch/`int num` 分支
// 里的同字段多赋值取首匹配；以下逐 case 按源码校对，2026-08-17 与提交态对账固化）：
//  · 2674-2676 诱饵三连（Item.cs:25851-25870 嵌套 switch：2675=30 / 2676=50 / default 2674=15，
//    首匹配把 2676 吃成 2675 的 30）
//  · 2001 蠕虫笼族（:21313-21350 `int num = type - 1994` 逐分支：num=7→25，
//    首匹配吃到 num=0 的 5）
//  · 2422 熔线钓钩（SetDefaults2 `if (type >= 2421 && type <= 2422)` 区间块，case 标签外
//    ——同 2291 族漏提形态；:23048-23066 `else` 分支 fishingPole 45（1405 同位 :25413 同读
//    45）。此前提交态手记 25 与两版反编译均不符，2026-08-17 按 1456 最终态校正；
//    melee/autoReuse 为旧手记误加，源块未设，随校正摘除）
for (const [id, patch] of Object.entries({
  2674: { bait: 15, consumable: 1 },
  2676: { bait: 50 },
  2001: { bait: 25 },
  2422: { fishingPole: 45 },
})) {
  FUNC[id] = { ...(FUNC[id] ?? {}), ...patch };
}
// SetDefaults 委托展开补丁（2026-08-25 r33 蓝队）：`SetDefaults3(N)`/`SetDefaults1(N)` 形态
// 的 case 段本体只有 type/glowMask/shoot 覆写，工具力/伤害面全在【被委托基底】的 case 段——
// 文本段正则解不开跨 case 继承，此前六件月主锯钻只提到 {shoot:N}（itemFuncTool 判空 →
// 不进工具分支 → combatWeapon 落 'shot' 兜底把持械弹当直飞箭弹）、九件月主挥砍件整条缺失
// （combat+func 双缺 → 左键纯摆动零伤零挖；red-team-r33 §三 P0-①②）。
// C# 语义 = 先跑完基底 case 全部赋值再执行本 case 覆写（type/shoot/glowMask），终值 =
// 基底终态 + 本段覆写。逐件按源码固化（值=基底 case 直赋实值，非推断）：
//  · 月主锯钻（1456 Item.cs :26571/:26577/:26598/:26604 + :31037/:31043；1457/1458 同位
//    :26572/:26578/:26599/:26605 + :31061/:31067，两版 diff=0 已对账）：
//    2778←2773+shoot429 / 2783←2773+431 / 3463←2773+610（axe27/dmg80/kb4）
//    2779←2774+shoot430 / 2784←2774+432 / 3464←2774+609（pick225/dmg50/kb0.5）
//  · 月主挥砍斧/锤/镐（:26566/:26583/:26588 + :31032/:31049/:31054）：
//    2777·2782·3462←2772（axe27/dmg100/kb6/autoReuse）/ 2780·2785·3465←2775
//    （hammer100/dmg110/kb7/useTurn）/ 2781·2786·3466←2776（pick225/dmg80/kb5.5/useTurn）
//  · 2209 超级魔药 healMana=400 手补【已退役】（2026-09-03 十五批备B 收尾）：提取器
//    源面切 1458 后 case 2209 段自然产出 healMana=400（Terarria1458 Item.cs:22349）,
//    手补为纯 no-op——历史"300"系 1456 值（Terarria1456 Item.cs:22323 `healMana =
//    300;`）,当年"case 1933 段 healLife/healMana 双赋值首匹配"归因系误诊（实为
//    1456→1458 版值变更）。退役已验：去补重产与在库 json 逐字节一致。
const DELEGATE_EXPANSION = {
  2778: { melee: 1, noMelee: 1, channel: 1, damage: 80, axe: 27, useStyle: 5, knockBack: 4, shoot: 429 },
  2783: { melee: 1, noMelee: 1, channel: 1, damage: 80, axe: 27, useStyle: 5, knockBack: 4, shoot: 431 },
  3463: { melee: 1, noMelee: 1, channel: 1, damage: 80, axe: 27, useStyle: 5, knockBack: 4, shoot: 610 },
  2779: { melee: 1, noMelee: 1, channel: 1, damage: 50, pick: 225, useStyle: 5, knockBack: 0.5, shoot: 430 },
  2784: { melee: 1, noMelee: 1, channel: 1, damage: 50, pick: 225, useStyle: 5, knockBack: 0.5, shoot: 432 },
  3464: { melee: 1, noMelee: 1, channel: 1, damage: 50, pick: 225, useStyle: 5, knockBack: 0.5, shoot: 609 },
  2777: { melee: 1, autoReuse: 1, damage: 100, axe: 27, useStyle: 1, knockBack: 6 },
  2782: { melee: 1, autoReuse: 1, damage: 100, axe: 27, useStyle: 1, knockBack: 6 },
  3462: { melee: 1, autoReuse: 1, damage: 100, axe: 27, useStyle: 1, knockBack: 6 },
  2780: { melee: 1, autoReuse: 1, damage: 110, hammer: 100, useStyle: 1, knockBack: 7, useTurn: 1 },
  2785: { melee: 1, autoReuse: 1, damage: 110, hammer: 100, useStyle: 1, knockBack: 7, useTurn: 1 },
  3465: { melee: 1, autoReuse: 1, damage: 110, hammer: 100, useStyle: 1, knockBack: 7, useTurn: 1 },
  2781: { melee: 1, autoReuse: 1, damage: 80, pick: 225, useStyle: 1, knockBack: 5.5, useTurn: 1 },
  2786: { melee: 1, autoReuse: 1, damage: 80, pick: 225, useStyle: 1, knockBack: 5.5, useTurn: 1 },
  3466: { melee: 1, autoReuse: 1, damage: 80, pick: 225, useStyle: 1, knockBack: 5.5, useTurn: 1 },
  // 2209 已退役（自然产出 healMana=400,见上方退役注）——留空位防序号误读
};
for (const [id, expansion] of Object.entries(DELEGATE_EXPANSION)) {
  // 委托语义：基底字段打底、本 case 显式字段覆盖——现有条目（如六锯钻的 {shoot:N}）
  // 即"显式覆写"，展开值与之同键同值，直接整体赋终态。
  FUNC[id] = { ...(FUNC[id] ?? {}), ...expansion };
}

// ---- SetFoodDefaults（Item.cs:47653）：食物族走 SetDefaults 的 IsFood 分支直转此方法，
// SetDefaults1-5 扫不到——85 个 case 全靠此 switch 补。逐 case 解析
// DefaultToFood(w,h,buff,dur[,useGulpSound]) → buffType/buffTime/useStyle(2 咀嚼 | 9 仰饮)
// /consumable（DefaultToFood :48155 实体）；DefaultToHealingPotion（case 1912）→ 治疗。
// case 内显式赋值可覆盖（967/969 强制 useStyle=9；353 清酒 Ale holdStyle/ammo/notAmmo）。
{
  const foodSegs = new Map();
  const foodBody = methodBodyOf(itemSrc, 'private void SetFoodDefaults(');
  if (foodBody) collectCaseSegments(foodBody, foodSegs);
  const foodFunc = {};
  for (const [id, seg] of foodSegs) {
    const f = {};
    const dm = seg.match(/DefaultToFood\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)([^)]*)\)/);
    if (dm) {
      f.buffType = +dm[3];
      f.buffTime = +dm[4];
      // DefaultToFood：useGulpSound=true → useStyle 9（Item2/Item3 音效差异不在此表）
      f.useStyle = /useGulpSound\s*:\s*true/.test(dm[5]) ? 9 : 2;
      f.consumable = 1;
    }
    const dh = seg.match(/DefaultToHealingPotion\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
    if (dh) {
      f.healLife = +dh[3];
      f.useStyle = 9;
      f.consumable = 1;
      f.potion = 1;
    }
    if (!Object.keys(f).length) continue;
    // case 段内显式赋值（仅 useStyle 允许覆盖解析值；其余字段并集）
    // ★后写生效同主线（lastFieldMatch 注）——SetFoodDefaults case 段同字段双赋值
    for (const [name, re, type] of FIELDS) {
      if (f[name] !== undefined && name !== 'useStyle') continue;
      const m = lastFieldMatch(seg, re);
      if (!m) continue;
      f[name] = type === 'b' ? 1 : type === 'f' ? parseFloat(m[1]) : parseInt(m[1], 10);
    }
    foodFunc[id] = f;
  }
  for (const [id, f] of Object.entries(foodFunc)) {
    FUNC[id] = { ...(FUNC[id] ?? {}), ...f };
  }
  console.error(`foodfunc: ${Object.keys(foodFunc).length} 件（SetFoodDefaults）`);
}
// useTurn 全量叠加（只在已有条目上补键，不新增 id）：EXTRA_USETURN 含 SetDefaults1-5
// case 显式 + DefaultToPlaceableTile/Wall/Torch/Food/HealingPotion/CapturedCritter/MusicBox
// 等辅助函数族 + 区间 if 块 + 委托继承 + SetFoodDefaults 食物族
{
  let n = 0;
  for (const [id, f] of Object.entries(FUNC)) {
    if (EXTRA_USETURN.get(Number(id)) === true) { f.useTurn = 1; n++; }
  }
  console.error(`useTurn=1: ${n} 件（EXTRA_USETURN 全量 ${EXTRA_USETURN.size}）`);
}
writeFileSync(OUT, JSON.stringify(FUNC));
console.error(`itemfunc: ${Object.keys(FUNC).length} 件`);
const stats = {};
for (const f of Object.values(FUNC)) {
  for (const k of Object.keys(f)) stats[k] = (stats[k] ?? 0) + 1;
}
console.error(JSON.stringify(stats));

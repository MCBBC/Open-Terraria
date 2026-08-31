// 从 Terarria1456 Projectile.cs SetDefaults 提取投射物数据。
// 注意：与 Item.cs 不同，Projectile.cs 的 SetDefaults(Type) 用的是
// `if (type == N) {...} else if (type == M) {...}` 链（约 436 行起），
// 不是 switch-case —— 之前按 switch 解析提取到 0 条就是这个原因。
// 深度 1 赋值捕获；输出 src/data/vanilla-projectiles.json
import { readFileSync, writeFileSync, writeSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const ROOT = '/Users/vinlic/Project/GLM/SandboxWorld';
// 源版本可选(recon-item-1456-1457.mjs 双实例分别取 1456/1457;缺省 1456 = 既有产物基线)
// ★2026-08-23 基准切换 1457：缺省源版本 1456→1457（裸跑不再把 1457 专属字段打回 1456;
// 旧 1456 档仍可 SW_ITEM_VER=1456 显式取）
export const SRC_VER = process.env.SW_ITEM_VER ?? '1457';
const src = readFileSync(`${ROOT}/Terarria${SRC_VER}/Terraria/Projectile.cs`, 'utf8');

// ---- SetDefaults(int Type) 方法体 ----
const fnIdx = src.indexOf('void SetDefaults(int Type');
if (fnIdx < 0) throw new Error('SetDefaults not found');
const start = src.indexOf('{', fnIdx);
let depth = 0, end = start;
for (let i = start; i < src.length; i++) {
  if (src[i] === '{') depth++;
  else if (src[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
}
const body = src.slice(start + 1, end);

// ---- else-if 链通配拆分:纯 type 布尔式逐 id 求值,先匹配者生效 ----
// 1456 SetDefaults 是互斥 else-if 链,条件形态多样(单值/区间/复合 OR/括号混排,
// 如 `(type >= 360 && type <= 366) || type == 381 || type == 760`)——正则枚举
// 永远追不完(链锤 947||948 复合块曾漏提 → Mace 分类落入 shot 兜底"射出锤子")。
// 语义模型:仅【顶层链】互斥(每 id 吃第一个命中块);块内嵌套的纯 type if
// (如 986-993 块内 `if (type >= 987 && type <= 993) { light = 1f; }`)随外块
// 对该 id 求值后一并并入;非纯 type 条件(Main.expertMode 等)不可静态求值,跳过。
const MAX_ID = 1140; // 1457 新增 25 弹(1111-1135,ProjectileID.Count 1136)——登记面含新弹 SetDefaults
/** 平衡括号取 if 条件串;返回 { cond, condEnd } 或 null */
function readCond(text, ifParenAt) {
  let d = 0;
  for (let i = ifParenAt; i < text.length; i++) {
    if (text[i] === '(') d++;
    else if (text[i] === ')') { d--; if (d === 0) return { cond: text.slice(ifParenAt, i + 1), condEnd: i + 1 }; }
  }
  return null;
}
/** 条件纯度:只含 小写 type/数字/比较/逻辑/括号/空白(大写 Type 初始化段跳过) */
function tryCompile(cond) {
  if (/\bType\b/.test(cond)) return null;
  const stripped = cond.replace(/\btype\b/g, '');
  if (!/^[\s\d()&|=<>!*]+$/.test(stripped)) return null;
  try { return new Function('type', `return (${cond});`); } catch { return null; }
}
/** 平衡花括号取块体;返回 { text, end } 或 null(end = 块尾 } 的下一位) */
function readBlock(text, from) {
  const braceAt = text.indexOf('{', from);
  if (braceAt < 0 || text.slice(from, braceAt).trim() !== '') return null;
  let d = 0;
  for (let i = braceAt; i < text.length; i++) {
    if (text[i] === '{') d++;
    else if (text[i] === '}') { d--; if (d === 0) return { text: text.slice(braceAt + 1, i), end: i + 1 }; }
  }
  return null;
}
/** 块内收集:id 视角的有效行 = 语句层行 + 嵌套纯 type if(对该 id 为真)的递归行
 *  ★三轮蓝队 F4（2026-08-31）修正：语句层还含 `switch (type)` 分派（663 族
 *  SetDefaults :7132-7157 三档盒覆写等）——旧实现整块照收全部 case 体,
 *  lastMatch 恒取末 case 行 ⇒ 三个 id 全被写成 667 的 28×60。现对【纯 type】
 *  switch 逐 id 求值:命中 case 体并入、其余丢弃（含 default）。非纯表达式
 *  switch 维持旧行为照收并登记。 */
function expandTypeSwitchLines(block, id) {
  // 找第一个语句层 switch；无 → 原文返回（递归基,先于任何递归调用防同串自旋）
  const swRe = /switch\s*\(/g;
  let m;
  while ((m = swRe.exec(block))) {
    // switch 头须位于块语句层（其前括号深度为 0）
    let d0 = 0;
    for (let i = 0; i < m.index; i++) {
      if (block[i] === '(' || block[i] === '{') d0++;
      else if (block[i] === ')' || block[i] === '}') d0--;
    }
    if (d0 !== 0) continue;
    const cond = readCond(block, m.index + m[0].length - 1);
    if (!cond) return block.slice(0, m.index).split('\n').map((l) => l.trim());
    const body = readBlock(block, cond.condEnd);
    if (!body) return block.slice(0, m.index).split('\n').map((l) => l.trim());

    const out = [...expandTypeSwitchLines(block.slice(0, m.index), id)];
    if (!tryCompile(cond.cond)) {
      // 非纯 type switch：不可静态求值,保守沿用旧行为=整个 body 照收
      out.push(...body.text.split('\n').map((l) => l.trim()));
    } else {
      // 拆 case 标签（case N 连排且之间无实体语句时共享一体=C# 穿透仅空标脚）；
      // 有体的组遇新标签即开新组。命中体并入、其余丢弃（default 同法并入尾组）。
      const caseRe = /\b(?:case\s+(-?\d+)\s*:|default\s*:)/g;
      const defaultSentinel = Symbol('default');   // default 只在无任何 case 命中时生效(C# 跳转),此保守实现仅记录不并入
      const groups = [];          // { ids:Set, text }——default 以 -Infinity 假值入组首标签位?不,default 仅在无穿透依赖时并入尾组文本前
      let curIds = null;
      let curStart = null;
      let cs;
      const isEmptySeg = (t) => t.replace(/[\s;}|]|\/\/[^\n]*|\/\*[\s\S]*?\*\//g, '') === '';
      const pushGroup = (endAt) => {
        if (curIds !== null && curStart !== null) {
          groups.push({ ids: curIds, text: body.text.slice(curStart, endAt) });
        }
      };
      while ((cs = caseRe.exec(body.text))) {
        if (cs[1] !== undefined) {
          const v = Number(cs[1]);
          const prevEmpty = curStart === null || isEmptySeg(body.text.slice(curStart, cs.index));
          if (!prevEmpty) {
            pushGroup(cs.index);
            curIds = new Set();
          } else if (curIds === null) {
            curIds = new Set();
          } else {
            curIds = new Set(curIds);   // 复制防跨组串写
          }
          curIds.add(v);
          curStart = caseRe.lastIndex;
        } else {
          // default：并入当前组文本域（default 与 case 同体)或自成一组
          if (curIds === null || !isEmptySeg(body.text.slice(curStart ?? caseRe.lastIndex, cs.index))) {
            pushGroup(cs.index);
            curIds = new Set();
          }
          curIds.add(defaultSentinel);
          curStart = caseRe.lastIndex;
        }
      }
      pushGroup(body.text.length);
      for (const g of groups) {
        if (g.ids.has(id)) out.push(...g.text.split('\n').map((l) => l.trim()));   // default 哨兵≠数字 id,天然不命中
      }
    }
    out.push(...expandTypeSwitchLines(block.slice(body.end), id));
    return out;
  }
  return block.split('\n').map((l) => l.trim());
}

/** 块内收集:id 视角的有效行 = 语句层行 + 嵌套纯 type if(对该 id 为真)的递归行 */
function collectLinesForId(block, id, depth = 0) {
  const out = [];
  const re = /(?:else\s+)?if\s*\(/g;
  let cursor = 0;
  let m;
  while ((m = re.exec(block))) {
    // 条件前的语句层文本行并入（★F4:语句层的 switch(type) 在此展开逐 id 求值）
    out.push(...expandTypeSwitchLines(block.slice(cursor, m.index), id));
    const c = readCond(block, m.index + m[0].length - 1);
    if (!c) break;
    const b = readBlock(block, c.condEnd);
    if (!b) break;
    const fn = tryCompile(c.cond);
    if (fn) {
      let hit = false;
      try { hit = !!fn(id); } catch { hit = false; }
      if (hit) out.push(...collectLinesForId(b.text, id, depth + 1));
    }
    // 非纯条件(Main.expertMode 等)不可静态判定,整块跳过(记录在案的限制)
    cursor = b.end;
    re.lastIndex = cursor;
    if (depth > 4) break;
  }
  out.push(...expandTypeSwitchLines(block.slice(cursor), id));
  return out;
}
const blocks = [];
{
  // 顶层链:if 关键字必须位于方法体语句层(其前的花括号深度为 0)
  const chainRe = /(?:else\s+)?if\s*\(/g;
  const seen = new Set();
  let m;
  while ((m = chainRe.exec(body))) {
    let d0 = 0;
    for (let i = 0; i < m.index; i++) {
      if (body[i] === '{') d0++;
      else if (body[i] === '}') d0--;
    }
    if (d0 !== 0) continue; // 嵌套 if 由 collectLinesForId 处理
    const c = readCond(body, m.index + m[0].length - 1);
    if (!c) break;
    const fn = tryCompile(c.cond);
    const blk = readBlock(body, c.condEnd);
    if (!blk) { chainRe.lastIndex = c.condEnd; continue; }
    const block = blk.text;
    if (fn) {
      for (let id = 0; id <= MAX_ID; id++) {
        let hit = false;
        try { hit = !!fn(id); } catch { hit = false; }
        if (hit && !seen.has(id)) {
          seen.add(id);
          blocks.push({ id, block });
        }
      }
    }
    chainRe.lastIndex = c.condEnd;
  }
}
if (blocks.length < 500) throw new Error(`链块过少: ${blocks.length}，疑似源码结构变化`);

// ---- 深度 1 赋值（块内语句深度 0） ----
const depth1Lines = (block) => {
  const out = [];
  let d = 0;
  for (const raw of block.split('\n')) {
    const opens = (raw.match(/\{/g) || []).length;
    const closes = (raw.match(/\}/g) || []).length;
    if (d === 0 && opens === 0) out.push(raw.trim());
    d += opens - closes;
    if (d < 0) d = 0;
  }
  return out;
};

// armorPenetration:Projectile.cs:260 弹幕自带穿甲(SetDefaults 逐型直写,如 85=15/917=50;
// StrikeNPC :12068 num3 = 玩家 GetArmorPenetration + 弹幕 armorPenetration)。
// 条件档(Main.remixWorld 148=20)非纯 type 条件,按既有限制跳过(登记)
const NUM_FIELDS = ['aiStyle', 'width', 'height', 'penetrate', 'timeLeft', 'damage', 'light', 'scale', 'extraUpdates', 'armorPenetration'];
const BOOL_FIELDS = ['friendly', 'melee', 'ranged', 'magic', 'minion', 'hostile', 'tileCollide', 'ignoreWater', 'pierce'];
// 同块同字段重复赋值取【最后一条】(C# 顺序执行语义/仓库"取最终态"约定——
// 96 火焰 `scale = 0.9f; scale = 1.3f;` 曾被首匹配读成 0.9,与提交产物漂移)
const lastMatch = (ls, re) => {
  let hit = null;
  for (const l of ls) if (re.test(l)) hit = l;
  return hit;
};

// ---- DefaultTo* 辅助方法展开（1456 惯例：DefaultToSpear()/DefaultToYoyo()/DefaultToFlail() 等
//      内部设 aiStyle 19/99/15 —— 长矛/悠悠球/连枷不在链内直写 aiStyle，必须展开才有值） ----
const helper = {};
for (const hm of src.matchAll(/public void (DefaultTo\w+)\(\)\s*\{/g)) {
  const hs = src.indexOf('{', hm.index);
  let d = 0, he = hs;
  for (let i = hs; i < src.length; i++) {
    if (src[i] === '{') d++;
    else if (src[i] === '}') { d--; if (d === 0) { he = i; break; } }
  }
  const rec = {};
  const hlines = depth1Lines(src.slice(hs + 1, he));
  for (const f of NUM_FIELDS) {
    const line = lastMatch(hlines, new RegExp(`^${f} = -?[\\d.]+f?;`));
    if (line) rec[f] = parseFloat(line.match(/-?[\d.]+/)[0]);
  }
  for (const f of BOOL_FIELDS) {
    if (hlines.some((l) => l === `${f} = true;`)) rec[f] = true;
    else if (hlines.some((l) => l === `${f} = false;`)) rec[f] = false;
  }
  helper[hm[1]] = rec;
}
// 展开顺序内的行序列（DefaultTo* 调用与直写赋值按出现顺序合并，后设覆盖）
const data = {};
for (const { id, block } of blocks) {
  // 语句层行 + 嵌套纯 type if 对本 id 的递归行(顶层链互斥已在此前择块)
  const lines = collectLinesForId(block, id);
  const rec = {};
  const apply = (ls) => {
    for (const f of NUM_FIELDS) {
      const line = lastMatch(ls, new RegExp(`^${f} = -?[\\d.]+f?;`));
      if (line) rec[f] = parseFloat(line.match(/-?[\d.]+/)[0]);
    }
    for (const f of BOOL_FIELDS) {
      if (ls.some((l) => l === `${f} = true;`)) rec[f] = true;
      else if (ls.some((l) => l === `${f} = false;`)) rec[f] = false;
    }
  };
  for (const raw of lines) {
    const call = raw.match(/^(DefaultTo\w+)\(\);$/);
    if (call && helper[call[1]]) {
      // 展开辅助方法赋值（与直写同字段语义）
      const h = helper[call[1]];
      for (const f of NUM_FIELDS) if (h[f] !== undefined) rec[f] = h[f];
      for (const f of BOOL_FIELDS) if (h[f] !== undefined) rec[f] = h[f];
    }
  }
  apply(lines);
  if (Object.keys(rec).length) data[id] = { ...(data[id] || {}), ...rec }; // 区间与单值重叠时合并（后设覆盖）
}

// 库模式出口(recon-item-1456-1457.mjs 三方对账用);写盘仅 CLI 直跑时执行,
// 被 import 时不落盘(否则 1457 实例会覆写 1456 基线产物)
export const PROJ_DATA = data;
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  // --dump:全量数据出 stdout 不落盘(recon 双版本对账用;vitest 模块运行器按路径
  //  缓存忽略 query-string,库模式双实例不可靠——子进程各带 env 最稳)。
  //  ★writeSync 直写 fd 1:process.exit/大载荷走管道时异步 write 会在 64KB 截断
  if (process.argv.includes('--dump')) {
    const s = JSON.stringify({ src: SRC_VER, projectiles: data, count: Object.keys(data).length });
    writeSync(1, s);
    process.exit(0);
  }
  writeFileSync(`${ROOT}/game/src/data/vanilla-projectiles.json`, JSON.stringify(data));
  console.error(`共 ${Object.keys(data).length} 投射物（源 Terarria${SRC_VER}）`);
  console.error('手里剑(3):', JSON.stringify(data['3']));
  console.error('回旋镖(6):', JSON.stringify(data['6']));
  console.error('手雷(28):', JSON.stringify(data['28']));
  console.error('长矛(23):', JSON.stringify(data['23']));
  console.error('悠悠球(546):', JSON.stringify(data['546']));
}

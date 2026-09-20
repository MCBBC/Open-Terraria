// 宠物投射物 AI 参数提取器：Terarria1457/Terraria/Projectile.cs →
// ★BJ212 2026-09-20 重锚 1457（BJ183 登记债清偿）：1457 AI_026/AI_067 局部号重排
// 全数重推（AI_026 飞行段 num41..53→num42..54；地面段 num181/182→num184/185、
// num91→num92、num100/101→num101/102、num111→num112、num93/94→num94/95；
// AI_067 num34→num50；ST11 num82/85/86→num83/86/87；ST90 num820/821/822→num790/791/792；
// ST124 num964/967→num918/921、y11→y10、vector150→vector149），1458 交叉对拍三方法体
// 逐字节全等零增量。数据面定谳：1456 锚产物与 1457 重推产物【逐值零差】（79 款共同
// 条目），仅 meta.source/行号坐标换锚；703 line 66784（1456 旧坐标）→ 71188（1457 真
// 坐标）系 fx48 层遗留的版本混锚，本刀顺手归一。
// game/src/data/vanilla-petai.json（PetFollower 按 aiStyle 家族分派的参数源）。
//
// 数据来源三段：
//   ① vanilla-pets.json 的 proj id 全集（唯一化）＋ vanilla-projectiles.json 的 aiStyle
//   ② Projectile.cs 的宠物 AI 方法体（AI_026 / AI_067_FreakingPirates / AI_144_DD2Pet
//      + AI() 内 aiStyle 11/90/124 内联分支）——参数带行号落盘
//   ③ Main.cs projFrames 表 + ProjectileID.cs 常量名
//
// 提取策略（与 extract-projectiles.mjs 同款语义模型）：
//   - 家族分类的飞行子型用"方法体顶层 if 分支扫描"实提（AI_026 里逐款专属分支
//     凡 depth-1 出现 tileCollide = false 即无重力悬停族）；
//   - 逐款数值用锚点定位 + 正则解析实提（idleRange/accel/maxSpeed/catchUpRange 等
//     全部可机械解析的都解析）；
//   - 少数完全定制的分支体（Wisp 控制偏移、DD2 宠 bob、764 星透明度脉冲等）以
//     常量表给出，但每个值都用 anchorAssert 校验源码对应行仍含锚文本——源码漂移
//     即报错退出，防止"表与源码静默失配"。
//
// ★era guard（BJ212 落闸，四要素习语见 docs/era-guard-family.md）：
//   ① SW_ITEM_VER 缺省 1457（显式值白名单 1456/1457/1458，盘上无对应反编译目录即拒）；
//   ② 输出通道三分离：缺省=干跑零写盘 / SW_OUT=<dir>=沙箱输出 <dir>/vanilla-petai.json /
//     --write-real=写真库 game/src/data/vanilla-petai.json；SW_OUT 与 --write-real 双旗
//     互斥拒跑；SW_ITEM_VER≠1457 时 --write-real 拒跑（旧基线重放禁写真库——BJ191
//     preflight 写真实 json / itemrare 1456 裸跑洗 6147-6195 同族 footgun）；
//   ③ 锚断言 fail-loud：anchorAssert/firstIn/FLY_SPEED_ANCHOR 全数硬校验（本文件既有机制）；
//   ④ 判别力自证：tests/extract-petai-era-guard.test.ts（干跑零写盘/双旗互斥/旧基线
//     禁写真库/锚中毒 fail-loud 变异）。
// 输出：src/data/vanilla-petai.json
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';

const ROOT = '/Users/vinlic/Project/GLM/SandboxWorld';

// ================= era guard：源版本 fail-closed + 输出通道三分离 =================
// 白名单 1457/1458：本器锚点是版本特化（1457 局部号重排后 1456 旧号正则全数失配,
// 见 BJ183/BJ212）——1456 重放须整套旧锚集,已随重锚退役,不在白名单。1458 三方法体
// 与 1457 逐字节全等（BJ212 实证）,保留作增量对拍面。
const VER = process.env.SW_ITEM_VER ?? '1457';
const VER_ALLOWED = new Set(['1457', '1458']);
if (!VER_ALLOWED.has(VER) || !existsSync(`${ROOT}/Terarria${VER}/Terraria/Projectile.cs`)) {
  console.error(`[extract-petai] 拒绝运行：SW_ITEM_VER="${VER}" 非法（白名单 ${[...VER_ALLOWED].join('/')}，且需存在 Terarria${VER}/ 反编译目录）。`);
  if (VER === '1456') console.error('  1456 锚集已随 BJ212 重锚退役（1457 局部号重排致旧正则全数失配）；1456 对拍用 /tmp 时代快照或读 BJ183 定谳（数据面零欠账已证）。');
  process.exit(1);
}
const WRITE_REAL = process.argv.includes('--write-real');
const SW_OUT = process.env.SW_OUT;
if (SW_OUT !== undefined && SW_OUT !== '' && WRITE_REAL) {
  console.error('[extract-petai] 拒绝运行：SW_OUT 与 --write-real 双旗互斥（输出通道必须唯一）。');
  console.error('  处置：沙箱对拍用 SW_OUT=<dir>；确认定谳后更新现库用 --write-real（且 SW_ITEM_VER=1457）。');
  process.exit(1);
}
if (WRITE_REAL && VER !== '1457') {
  console.error(`[extract-petai] 拒绝写真库：SW_ITEM_VER=${VER}≠1457（旧基线重放禁写 game/src/data/vanilla-petai.json）。`);
  console.error('  处置：1456/1458 重放对拍请走 SW_OUT 沙箱；确要回写 1457 终值请去掉 SW_ITEM_VER 显式注入（缺省即 1457）。');
  process.exit(1);
}
const OUT_JSON = WRITE_REAL ? `${ROOT}/game/src/data/vanilla-petai.json`
  : (SW_OUT ? `${SW_OUT.replace(/\/+$/, '')}/vanilla-petai.json` : null);

const projSrc = readFileSync(`${ROOT}/Terarria${VER}/Terraria/Projectile.cs`, 'utf8');
const mainSrc = readFileSync(`${ROOT}/Terarria${VER}/Terraria/Main.cs`, 'utf8');
const idSrc = readFileSync(`${ROOT}/Terarria${VER}/Terraria.ID/ProjectileID.cs`, 'utf8');
const petsTable = JSON.parse(readFileSync(`${ROOT}/game/src/data/vanilla-pets.json`, 'utf8'));
const projTable = JSON.parse(readFileSync(`${ROOT}/game/src/data/vanilla-projectiles.json`, 'utf8'));

const projLines = projSrc.split('\n');
/** 行号(1基) → 源码行 */
const lineAt = (n) => projLines[n - 1] ?? '';
/** 文本内偏移 → 1基行号 */
const lineNoOf = (text, idx) => text.slice(0, idx).split('\n').length;

/** 平衡花括号取方法/分支体。from = 签名或 if 条件所在起点 */
function braceBody(src, from) {
  const open = src.indexOf('{', from);
  if (open < 0) return null;
  let d = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') d++;
    else if (src[i] === '}') { d--; if (d === 0) return { text: src.slice(open + 1, i), open }; }
  }
  return null;
}
/** 块内偏移 → 绝对行号定位器：blockStartLine = 块首字符在源码中的行号(1基) */
const locator = (block, blockStartLine) => (idx) => blockStartLine - 1 + lineNoOf(block, idx);
/** 平衡括号取 if 条件串 */
function readCond(src, parenAt) {
  let d = 0;
  for (let i = parenAt; i < src.length; i++) {
    if (src[i] === '(') d++;
    else if (src[i] === ')') { d--; if (d === 0) return { cond: src.slice(parenAt, i + 1), end: i + 1 }; }
  }
  return null;
}
/** 条件纯度：仅 type/数字/比较/逻辑/括号（AI_026 内 flag 变量与 ai 槽条件不可静态求值） */
function tryCompileTypeCond(cond) {
  const stripped = cond.replace(/\btype\b/g, '');
  if (!/^[\s\d()&|=<>!]+$/.test(stripped)) return null;
  try { return new Function('type', `return (${cond});`); } catch { return null; }
}
/** 块内 depth-1 行（花括号深度 0 的语句层） */
function depth1Lines(block) {
  const out = [];
  let d = 0;
  for (const raw of block.split('\n')) {
    const opens = (raw.match(/\{/g) || []).length;
    const closes = (raw.match(/\}/g) || []).length;
    if (d === 0) out.push(raw.trim());
    d += opens - closes;
    if (d < 0) d = 0;
  }
  return out;
}
/** 锚点校验：源码 line 行（1基）必须含 text——参数表的防漂移闸门 */
function anchorAssert(line, text, what) {
  const actual = lineAt(line);
  if (!actual.includes(text)) {
    throw new Error(`锚点失配 [${what}] Projectile.cs:${line} 期望含 "${text}" 实为 "${actual.trim()}"`);
  }
}
/** 块内首个匹配（line = projSrc 绝对行号） */
function firstIn(block, loc, re, what) {
  const m = re.exec(block);
  if (!m) throw new Error(`未找到 [${what}]`);
  return { value: m, line: loc(m.index) };
}
/** 块内全部匹配（lines = 绝对行号数组） */
function allIn(block, loc, re) {
  const out = [];
  let m;
  while ((m = re.exec(block))) { out.push({ value: m, line: loc(m.index) }); re.lastIndex = m.index + 1; }
  return out;
}

// ================= ① 宠物 proj id 全集 + aiStyle =================
const petProjIds = [...new Set(Object.values(petsTable).map((e) => e.proj))].sort((a, b) => a - b);
const aiStyleOf = (id) => projTable[String(id)]?.aiStyle;

// ================= ③ projFrames + 常量名 =================
const framesOf = {};
for (const m of mainSrc.matchAll(/projFrames\[(\d+)\] = (\d+);/g)) framesOf[+m[1]] = +m[2];
const nameOf = {};
for (const m of idSrc.matchAll(/public const short (\w+) = (\d+);/g)) {
  if (!(+m[2] in nameOf)) nameOf[+m[2]] = m[1];
}

// ================= ② 方法体定位 =================
const methodAt = (sig) => {
  const i = projSrc.indexOf(sig);
  if (i < 0) throw new Error(`方法未找到: ${sig}`);
  const b = braceBody(projSrc, i);
  return { text: b.text, sigLine: lineNoOf(projSrc, i), loc: locator(b.text, lineNoOf(projSrc, b.open + 1)) };
};
const AI026 = methodAt('private void AI_026()');
const AI067 = methodAt('private void AI_067_FreakingPirates()');
const AI144 = methodAt('private void AI_144_DD2Pet()');
/** AI() 内联 aiStyle 分支（`else if (aiStyle == N) { ... }`） */
const inlineBranch = (n) => {
  const re = new RegExp(`else if \\(aiStyle == ${n}\\)`);
  const m = re.exec(projSrc);
  if (!m) throw new Error(`aiStyle ${n} 分支未找到`);
  const b = braceBody(projSrc, m.index);
  return { text: b.text, sigLine: lineNoOf(projSrc, m.index), loc: locator(b.text, lineNoOf(projSrc, b.open + 1)) };
};
const ST11 = inlineBranch(11);
const ST90 = inlineBranch(90);
const ST124 = inlineBranch(124);

// ================= AI_026 顶层分支扫描：飞行子型判定 =================
// 语义：AI_026 前段的逐款专属分支凡 depth-1 出现 `tileCollide = false;` 即无重力
// 悬停（飞行环绕族）；其余 aiStyle 26 成员落入尾段地面行走+跳跃分支。
const flying26 = new Set();
{
  const body = AI026.text;
  const re = /\bif\s*\(/g;
  let m;
  while ((m = re.exec(body))) {
    let d0 = 0;
    for (let i = 0; i < m.index; i++) {
      if (body[i] === '{') d0++;
      else if (body[i] === '}') d0--;
    }
    if (d0 !== 0) continue; // 仅方法体语句层的 if（else-if 链的嵌套 if 不算）
    const c = readCond(body, m.index + m[0].length - 1);
    if (!c) break;
    const b = braceBody(body, c.end);
    if (!b) { re.lastIndex = c.end; continue; }
    const fn = tryCompileTypeCond(c.cond);
    if (fn) {
      const hits = petProjIds.filter((id) => { try { return !!fn(id); } catch { return false; } });
      if (hits.length && depth1Lines(b.text).includes('tileCollide = false;')) {
        hits.forEach((id) => flying26.add(id));
      }
    }
    re.lastIndex = c.end;
  }
  // ★fx48 定谳（sw-fx48-boss-pets.test.ts B1，2026-09-12）：885/889 虽有专属早退块
  //   （1457 :61087-61245，tileCollide=false 悬停式逼近后 return）被本扫描判 fly，
  //   但 fx48 按 ground 族建模入表（idleRange 95 = :59152-59168 case 组；速度/追赶
  //   不吃组 = 缺省臂不落字段）——归 ground，勿回改。
  flying26.delete(885);
  flying26.delete(889);
}

// ================= AI_026 地面族参数（锚点解析） =================
const L = {}; // 参数行号登记
const g = {};
{
  // idleRange 头 + 逐款覆盖
  const head = firstIn(AI026.text, AI026.loc, /int num = 85;/, 'idleRange 默认');
  g.idleRange = 85; L.idleRange = head.line;
  const idleOv = {};
  // 960 ChesterPet：`else if (type == 960 && !flag11) { num = 10; }`（:56039-56041
  // 后缀条件正则盲区——曾漏提回退默认 85）
  {
    const m = /else if \(type == (\d+) && !flag11\)\s*\{\s*num = (\d+);/.exec(AI026.text);
    if (!m) throw new Error('AI_026 idleRange 后缀组（960）未找到');
    idleOv[+m[1]] = +m[2];
  }
  for (const { value } of allIn(AI026.text, AI026.loc, /if \(type == (\d+)\)\s*\{\s*num = (\d+);/g)) {
    idleOv[+value[1]] = +value[2];
  }
  for (const { value } of allIn(AI026.text, AI026.loc, /((?:case \d+:\s*)+)num = (\d+);/g)) {
    for (const id of [...value[1].matchAll(/case (\d+):/g)].map((x) => +x[1])) idleOv[id] = +value[2];
  }
  g.idleOverrides = idleOv;
  // accel/maxSpeed 头（num184/num185 相邻两行；1456 旧号 num181/num182）
  const a0 = firstIn(AI026.text, AI026.loc, /float num184 = ([\d.]+)f;\n\s*float num185 = ([\d.]+)f;/, 'accel/maxSpeed 默认');
  g.accel = parseFloat(a0.value[1]); g.maxSpeed = parseFloat(a0.value[2]);
  L.accel = a0.line; L.maxSpeed = a0.line + 1;
  const spdOv = {};
  for (const { value } of allIn(AI026.text, AI026.loc, /if \(type == (\d+)\)\s*\{\s*num185 = ([\d.]+)f;\s*num184 = ([\d.]+)f;/g)) {
    spdOv[+value[1]] = { maxSpeed: parseFloat(value[2]), accel: parseFloat(value[3]) };
  }
  for (const { value } of allIn(AI026.text, AI026.loc, /if \(type == (\d+)\)\s*\{\s*num184 = ([\d.]+)f;\s*num185 = ([\d.]+)f;/g)) {
    spdOv[+value[1]] = { accel: parseFloat(value[2]), maxSpeed: parseFloat(value[3]) };
  }
  // 步速大组（((flag10 || type == 266) | flag7) || type == 816 || ... || type == 1096）→ 6 / 0.2
  {
    const m = /if \(\(\(flag10 \|\| type == 266\) \| flag7\) \|\| type == 816[\s\S]{0,700}?type == 1096\)\s*\{\s*num185 = 6f;\s*num184 = 0\.2f;/.exec(AI026.text);
    if (!m) throw new Error('AI_026 步速大组未找到');
    for (const id of [...m[0].matchAll(/type == (\d+)/g)].map((x) => +x[1])) spdOv[id] = { maxSpeed: 6, accel: 0.2 };
    L.speedGroup = AI026.loc(m.index);
  }
  // 875 VoltBunny 独立档
  {
    const m = /if \(type == 875\)\s*\{\s*num185 = 7f;\s*num184 = 0\.25f;/.exec(AI026.text);
    if (!m) throw new Error('AI_026 875 步速档未找到');
    spdOv[875] = { maxSpeed: 7, accel: 0.25 };
  }
  g.speedOverrides = spdOv;
  // catchUpRange 头 + 逐款/switch 覆盖（1456 旧号 num91）
  const c0 = firstIn(AI026.text, AI026.loc, /int num92 = (\d+);/, 'catchUpRange 默认');
  g.catchUpRange = +c0.value[1]; L.catchUpRange = c0.line;
  const cuOv = {};
  for (const { value } of allIn(AI026.text, AI026.loc, /if \(type == (\d+)\)\s*\{\s*num92 = (\d+);/g)) cuOv[+value[1]] = +value[2];
  for (const { value } of allIn(AI026.text, AI026.loc, /((?:case \d+:\s*)+)num92 = (\d+);/g)) {
    for (const id of [...value[1].matchAll(/case (\d+):/g)].map((x) => +x[1])) cuOv[id] = +value[2];
  }
  g.catchUpOverrides = cuOv;
  // ★fx48 定谳（B1）：899 的 `case 821: case 899: num92 = 500;`（1457 :61263-61265）
  //   = 缺省值 500 → 不落冗余字段（821 条目先于 fx48 存在,照旧保留 500）
  delete cuOv[899];
  // 追赶飞行档（ai[0]!=0 分支）：num101 加速度 / num102 落地距 / num112 速度（1456 旧号 num100/101/111）
  const f0 = firstIn(AI026.text, AI026.loc, /float num101 = ([\d.]+)f;\n\s*int num102 = (\d+);/, 'flyAccel/landRange 默认');
  g.flyAccel = parseFloat(f0.value[1]); g.landRange = +f0.value[2];
  L.flyAccel = f0.line; L.landRange = f0.line + 1;
  const s0 = firstIn(AI026.text, AI026.loc, /float num112 = ([\d.]+)f;/, 'flySpeed 默认');
  g.flySpeed = parseFloat(s0.value[1]); L.flySpeed = s0.line;
  const flyOv = {};
  for (const { value } of allIn(AI026.text, AI026.loc, /if \(type == (\d+)\)\s*\{\s*num112 = ([\d.]+)f;/g)) {
    flyOv[+value[1]] = { ...(flyOv[+value[1]] || {}), flySpeed: parseFloat(value[2]) };
  }
  for (const { value } of allIn(AI026.text, AI026.loc, /if \(type == (\d+)\)\s*\{\s*num101 = ([\d.]+)f;\s*num112 = ([\d.]+)f;/g)) {
    flyOv[+value[1]] = { ...(flyOv[+value[1]] || {}), flyAccel: parseFloat(value[2]), flySpeed: parseFloat(value[3]) };
  }
  {
    const m = /if \(flag10 \|\| type == 816 [\s\S]{0,700}?type == 1096\)\s*\{\s*num101 = 0\.4f;\s*num112 = 12f;/.exec(AI026.text);
    if (!m) throw new Error('AI_026 追赶飞行大组未找到');
    for (const id of [...m[0].matchAll(/type == (\d+)/g)].map((x) => +x[1])) {
      flyOv[id] = { ...(flyOv[id] || {}), flyAccel: 0.4, flySpeed: 12 };
    }
  }
  {
    const m = /if \(flag10 \|\| type == 816 \|\| type == 821 \|\| type == 825 \|\| type == 854 \|\| type == 858 \|\| type == 859 \|\| type == 860\)\s*\{\s*num101 = 0\.5f;\s*num102 = 100;/.exec(AI026.text);
    if (!m) throw new Error('AI_026 追赶降落大组未找到');
    for (const id of [...m[0].matchAll(/type == (\d+)/g)].map((x) => +x[1])) {
      flyOv[id] = { ...(flyOv[id] || {}), landRange: 100 };
    }
  }
  for (const { value } of allIn(AI026.text, AI026.loc, /if \(type == (\d+)\)\s*\{\s*num102 = (\d+);/g)) {
    flyOv[+value[1]] = { ...(flyOv[+value[1]] || {}), landRange: +value[2] };
  }
  // 875 VoltBunny：num101/num102 连写（1456 :57461-57465 `num100 = 2f; num101 = 100`——
  // 曾因正则只认 num101 首句漏提，运行时回退默认 200）
  {
    const m = /if \(type == (\d+)\)\s*\{\s*num101 = ([\d.]+)f;\s*num102 = (\d+);/.exec(AI026.text);
    if (!m) throw new Error('AI_026 landRange 连写组（875）未找到');
    flyOv[+m[1]] = { ...(flyOv[+m[1]] || {}), landRange: +m[3] };
  }
  g.flyOverrides = flyOv;
  // 跳跃梯（前方挡墙时按头顶净空取档；AI_026 地面段 :59299-59315）
  g.jumpLadder = [-5.1, -7.1, -11.1, -10.1, -9.1];
  L.jumpLadder = [];
  for (const txt of ['velocity.Y = -5.1f;', 'velocity.Y = -7.1f;', 'velocity.Y = -11.1f;', 'velocity.Y = -10.1f;', 'velocity.Y = -9.1f;']) {
    const idx = AI026.text.indexOf(txt);
    if (idx < 0) throw new Error(`AI_026 跳跃梯档未找到: ${txt}`);
    L.jumpLadder.push(AI026.loc(idx));
  }
  // 重力/终端速度（AI_026 尾段逐款帧块通用档 velocity.Y += 0.4f / > 10f）
  const gi = AI026.text.indexOf('velocity.Y += 0.4f;');
  if (gi < 0) throw new Error('AI_026 重力档未找到');
  L.gravity = AI026.loc(gi);
  g.gravity = 0.4; g.fallCap = 10;
  // 瞬移阈值 + 纵向追赶门（1456 旧号 num93/num94）
  const ti = AI026.text.indexOf('num95 > 2000f');
  if (ti < 0) throw new Error('AI_026 瞬移阈值未找到');
  L.teleport = AI026.loc(ti);
  g.teleport = 2000;
  const vi = AI026.text.indexOf('Math.Abs(num94) > 300f');
  if (vi < 0) throw new Error('AI_026 纵向追赶门未找到');
  L.catchUpVert = AI026.loc(vi);
  g.catchUpVert = 300;
}

// ================= AI_026 飞行环绕族（198 组共享体）参数 =================
const fly26 = { teleport: 2000, jitter: 10, hoverX: -60, hoverY: -60, near: 100, brake: 50 };
{
  // 共享分支头（fx48 见证锚 :60398；886/892/894/901 的 rec.line 指此）
  const h = /if \(type == 198 \|\| type == 380 \|\| type == 774 \|\| type == 815 \|\| type == 817 \|\| type == 886 \|\| type == 892 \|\| type == 894 \|\| type == 901 \|\| type == 1046\)/.exec(AI026.text);
  if (!h) throw new Error('AI_026 飞行共享分支头未找到');
  fly26.headLine = AI026.loc(h.index);
  const idx = AI026.text.indexOf('float num47 = 2000f;');
  if (idx < 0) throw new Error('AI_026 飞行瞬移阈值未找到');
  fly26.teleportLine = AI026.loc(idx);
  const ox = AI026.text.indexOf('num48 += (float)(60 * -Main.player[owner].direction);');
  if (ox < 0) throw new Error('AI_026 飞行悬停 X 偏移未找到');
  fly26.hoverXLine = AI026.loc(ox);
  const oy = AI026.text.indexOf('num49 -= 60f;');
  if (oy < 0) throw new Error('AI_026 飞行悬停 Y 偏移未找到');
  fly26.hoverYLine = AI026.loc(oy);
}
// 逐款速度/加速度（num42 加速度 / num54 速度；1456 旧号 num41/num53）——锚点校验。
// 815/817 用条件式速度档 `num54 = (!(num52 < num45) ? 10f : 6f)`（远/近双档，取远档）
// ★fx48 补提（sw-fx48-boss-pets.test.ts B2）：892/894/901 远/近双档
//   `num54 = ((!(num52 < num45)) ? 12f : 9f)`（:60463-60466 远档 12/近档 9，farDist=num45=400）
const flySpeedOv = {
  198: { speed: 14, accel: 0.4 },  // BabyHornet（组默认 14f）
  380: { speed: 6, accel: 0.3 },   // ZephyrFish
  815: { speed: 10, accel: 0.4 },  // LilHarpy（<400 取 6、远档 10，取远档）
  817: { speed: 10, accel: 0.4 },  // GlitteryButterfly（同上）
  774: { speed: 5, accel: 0.3 },   // SharkPup
  1046: { speed: 8, accel: 0.3 },  // Pufferfish（≥400 取 8）
  892: { speed: 9, accel: 0.4, farSpeed: 12, farDist: 400 },  // DukeFishronPet
  894: { speed: 9, accel: 0.4, farSpeed: 12, farDist: 400 },  // MoonLordPet
  901: { speed: 9, accel: 0.4, farSpeed: 12, farDist: 400 },  // DD2BetsyPet
};
const FLY_SPEED_ANCHOR = {
  198: /float num54 = 14f;/,
  380: /if \(type == 380\)\s*\{\s*num54 = 6f;/,
  815: /if \(type == 815 \|\| type == 817\)\s*\{\s*num54 = \(\(!\(num52 < num45\)\) \? 10f : 6f\);/,
  817: /if \(type == 815 \|\| type == 817\)\s*\{\s*num54 = \(\(!\(num52 < num45\)\) \? 10f : 6f\);/,
  774: /if \(type == 774\)\s*\{\s*num54 = 5f;/,
  1046: /if \(type == 1046\)\s*\{\s*num54 = 5f;\s*if \(num52 >= num45\)\s*\{\s*num54 = 8f;/,
  892: /if \(type == 892 \|\| type == 894 \|\| type == 901\)\s*\{\s*if \(num52 < num46\)\s*\{\s*num54 = 6f;\s*\}\s*num54 = \(\(!\(num52 < num45\)\) \? 12f : 9f\);/,
  894: /if \(type == 892 \|\| type == 894 \|\| type == 901\)\s*\{\s*if \(num52 < num46\)\s*\{\s*num54 = 6f;\s*\}\s*num54 = \(\(!\(num52 < num45\)\) \? 12f : 9f\);/,
  901: /if \(type == 892 \|\| type == 894 \|\| type == 901\)\s*\{\s*if \(num52 < num46\)\s*\{\s*num54 = 6f;\s*\}\s*num54 = \(\(!\(num52 < num45\)\) \? 12f : 9f\);/,
};
// 892/894 跳过随机抖动（:60430-60432 `if (type != 892 && type != 894)` 守卫臂外仍
// 加 60*-dir/-60f 悬停偏移）——fx48 定谳 jitter=0，901 不在守卫摘除面照常抖动
if (!/if \(type != 892 && type != 894\)\s*\{\s*num49 \+= \(float\)Main\.rand\.Next\(-10, 21\);/.test(AI026.text)) {
  throw new Error('AI_026 892/894 抖动守卫臂锚点未找到');
}
for (const [id] of Object.entries(flySpeedOv)) {
  if (!FLY_SPEED_ANCHOR[id].test(AI026.text)) {
    throw new Error(`AI_026 飞行成员 ${id} 速度档锚点未找到`);
  }
}
// 独立悬停分支体（175/197/199/211）：共享"悬停玩家 + 加速趋近 + 超距瞬移"骨架，
// 差异只在速度/刹车位——锚点校验分支头后以常量表登记
const flySolo = {
  175: { hoverX: 0, hoverY: 0, speed: 7, accel: 0.1, farAccel: 0.2, near: 300, brake: 150, brakeMode: 'clamp', teleport: 2000, line: 0 },
  197: { hoverX: 0, hoverY: 0, speed: 3, farSpeed: 14, farDist: 500, accel: 0.1, farAccel: 0.2, near: 300, brake: 150, brakeMode: 'clamp', teleport: 2000, line: 0 },
  199: { hoverX: -2, hoverY: -60, brakeMode: 'direct', speed: 4, farSpeed: 10, farDist: 350, accel: 0.1, farAccel: 0.2, near: 200, brake: 4, teleport: 2000, line: 0 },
  211: { hoverX: 0, hoverY: -60, speed: 5, accel: 0.2, near: 10, brake: 5, brakeMode: 'direct', teleport: 1000, line: 0 },
};
for (const [id] of Object.entries(flySolo)) {
  // 定位到"运动分支"而非前面的 timeLeft 存续块：取后续 600 字符内含
  // tileCollide = false 的那个 if (type == N) 出现点
  const re = new RegExp(`if \\(type == ${id}\\)`, 'g');
  let m;
  let found = -1;
  while ((m = re.exec(AI026.text))) {
    if (AI026.text.slice(m.index, m.index + 600).includes('tileCollide = false;')) { found = m.index; break; }
    re.lastIndex = m.index + 1;
  }
  if (found < 0) throw new Error(`AI_026 飞行独立分支 ${id} 未找到`);
  flySolo[id].line = AI026.loc(found);
}

// ================= aiStyle 11（ShadowOrb 18 光宠）：环绕保持距 =================
// 1457 局部号：num82→num83（速度）/num85→num86（瞬移）/num86→num87（保持距）/num84→num85（上下偏移）
const st11 = { holdDist: 70, orbitSpeed: 3, teleport: 800, lines: {} };
{
  st11.lines.speed = firstIn(ST11.text, ST11.loc, /float num83 = 3f;/, 'aiStyle11 速度').line;
  st11.lines.teleport = firstIn(ST11.text, ST11.loc, /int num86 = 800;/, 'aiStyle11 瞬移').line;
  st11.lines.holdDist = firstIn(ST11.text, ST11.loc, /int num87 = 70;/, 'aiStyle11 保持距').line;
  // 上下键 ±40 偏移（ownerRef 无控制态，运行时未建模——登记 PetFollower 注释）
  st11.lines.upDown = firstIn(ST11.text, ST11.loc, /num85 = Main\.player\[owner\]\.position\.Y - 40f/, 'aiStyle11 上下偏移').line;
}

// ================= aiStyle 90（MagicLantern 492 光宠）：肩后锚点 + 速度斜坡 =================
// 1457 局部号：num820→num790（瞬移）/num821→num791（速度插值）/num822→num792（基速）
const st90 = { hoverX: 40, hoverY: -40, speedBase: 4, rampDist: 200, ramp: 0.1, speedLerp: 3, teleport: 1000, lines: {} };
{
  st90.lines.hoverX = firstIn(ST90.text, ST90.loc, /vector96\.X \+= 40 \* direction;/, 'aiStyle90 悬停 X').line;
  st90.lines.speedBase = firstIn(ST90.text, ST90.loc, /float num792 = 4f;/, 'aiStyle90 基速').line;
  st90.lines.speedLerp = firstIn(ST90.text, ST90.loc, /float num791 = 3f;/, 'aiStyle90 速度插值').line;
  st90.lines.teleport = firstIn(ST90.text, ST90.loc, /if \(num790 > 1000f\)/, 'aiStyle90 瞬移').line;
}

// ================= aiStyle 124（SuspiciousTentacle 650 / GlommerPet 957） =================
// 1457 局部号：num964→num918（悬停 X）/y11→y10（悬停 Y）/num967→num921（吸附距）/
// vector150→vector149（速度系数）
const st124Base = { hoverX: 30, hoverY: -20, snap: 4, velLerp: 0.1, teleport: 1000, lines: {} };
{
  st124Base.lines.hoverX = firstIn(ST124.text, ST124.loc, /float num918 = 30f;/, 'aiStyle124 悬停 X').line;
  st124Base.lines.snap = firstIn(ST124.text, ST124.loc, /float num921 = 4f;/, 'aiStyle124 吸附距').line;
  st124Base.lines.velLerp = firstIn(ST124.text, ST124.loc, /velocity = vector149 \* 0\.1f;/, 'aiStyle124 速度系数').line;
}
// ★fx48 补提（sw-fx48-boss-pets.test.ts B3，:35700/:35709/:35714/:35723 逐型锚）：
//   888/895/896/898 悬停偏移逐型覆盖（1.4.5 boss 宠四款；条件臂 ownedProjectileCounts
//   反向偏移不建模——建模基础分支，与 957 同口径）
const st124Overrides = {
  957: { hoverX: -40, hoverY: -40, line: 0 },
  888: { hoverX: 30, hoverY: -50, line: 0 },
  895: { hoverX: -36, hoverY: -50, line: 0 },
  896: { hoverX: 30, hoverY: -60, line: 0 },
  898: { hoverX: -30, hoverY: -50, line: 0 },
};
{
  const m = /if \(type == 957\)\s*\{\s*num918 = -40f;\s*y10 = -40f;/.exec(ST124.text);
  if (!m) throw new Error('aiStyle124 957 悬停档未找到');
  st124Overrides[957].line = ST124.loc(m.index);
  const m888 = /if \(type == 888\)\s*\{\s*num918 = 30f;\s*y10 = -50f;/.exec(ST124.text);
  if (!m888) throw new Error('aiStyle124 888 悬停档未找到');
  st124Overrides[888].line = ST124.loc(m888.index);
  const m895 = /if \(type == 895\)\s*\{\s*num918 = -36f;\s*y10 = -50f;/.exec(ST124.text);
  if (!m895) throw new Error('aiStyle124 895 悬停档未找到');
  st124Overrides[895].line = ST124.loc(m895.index);
  const m896 = /if \(type == 896\)\s*\{\s*num918 = 30f;\s*y10 = -60f;/.exec(ST124.text);
  if (!m896) throw new Error('aiStyle124 896 悬停档未找到');
  st124Overrides[896].line = ST124.loc(m896.index);
  const m898 = /if \(type == 898\)\s*\{\s*num918 = -30f;\s*y10 = -50f;/.exec(ST124.text);
  if (!m898) throw new Error('aiStyle124 898 悬停档未找到');
  st124Overrides[898].line = ST124.loc(m898.index);
}

// ================= AI_144_DD2Pet（701/702/764/1050） =================
const ai144Base = { hoverX: 30, hoverY: -20, snap: 4, velLerp: 0.1, teleport: 1000, idleRate: 6, moveRate: 4, lines: {} };
{
  ai144Base.lines.hover = firstIn(AI144.text, AI144.loc, /Vector2 vector = new Vector2\(player\.direction \* 30, -20f\);/, 'AI_144 悬停偏移').line;
  ai144Base.lines.snap = firstIn(AI144.text, AI144.loc, /float num = 4f;/, 'AI_144 吸附距').line;
  ai144Base.lines.velLerp = firstIn(AI144.text, AI144.loc, /float num7 = 0\.1f;/, 'AI_144 速度系数').line;
  ai144Base.lines.teleport = firstIn(AI144.text, AI144.loc, /if \(num12 > 1000f\)/, 'AI_144 瞬移').line;
  ai144Base.lines.idleRate = firstIn(AI144.text, AI144.loc, /int num2 = 6;/, 'AI_144 待机帧率').line;
}
const ai144Overrides = {
  702: { snap: 6, idleRate: 10, bob: 2, bobPeriod: 120, line: 0 },              // DD2PetGhost
  764: { velLerp: 0.025, line: 0 },                                             // UpbeatStar（透明度脉冲未建模）
  1050: { hoverX: -30, snap: 3, idleRate: 5, moveRate: 3, frameTo: 2, line: 0 }, // AxeFairyPet（vector.X *= -1；砍树行为未建模）
  // ★fx48 补提（sw-fx2-buff-gap 勘误钉值 + sw-fx48-boss-pets）：DD2PetGato
  //   case 703（1457 :71188）：cos(PI/30) bob 2/周期 60 + idleRate 4/moveRate 2/snap 3；
  //   frameTo=4（num4 帧钳）按 fx48 追加语义落 frames 之后（见 fx48 层）
  703: { snap: 3, idleRate: 4, moveRate: 2, bob: 2, bobPeriod: 60, line: 0 },
};
{
  let m = /case 702:\s*\{[\s\S]{0,400}?num = 6f;/.exec(AI144.text);
  if (!m) throw new Error('AI_144 702 档未找到');
  ai144Overrides[702].line = AI144.loc(m.index);
  m = /case 764:\s*\{[\s\S]{0,400}?num7 = 0\.025f;/.exec(AI144.text);
  if (!m) throw new Error('AI_144 764 档未找到');
  ai144Overrides[764].line = AI144.loc(m.index);
  m = /case 1050:[\s\S]{0,400}?vector\.X \*= -1f;/.exec(AI144.text);
  if (!m) throw new Error('AI_144 1050 档未找到');
  ai144Overrides[1050].line = AI144.loc(m.index);
  m = /case 703:[\s\S]{0,300}?Math\.Cos\(localAI\[0\] \* \(MathF\.PI \/ 30f\)\) \* 2f;\s*num2 = 4;\s*num3 = 2;\s*num = 3f;\s*num4 = 4;/.exec(AI144.text);
  if (!m) throw new Error('AI_144 703 档未找到');
  ai144Overrides[703].line = AI144.loc(m.index);
}

// ================= AI_067（aiStyle 67 滚地族：500/653/1018/1056/1090） =================
const ai67 = {
  accel: 0.5, maxSpeed: 4,            // num50/num52（1456 旧号 num34/num36；追击档仅 minion 用——宠物 flag12=false 无索敌）
  gravity: 0.4, fallCap: 10, teleport: 2000,
  flyAccel: 0.2, flySpeed: 10,        // num18/num19 追赶飞行（1457 未重排）
  catchUpRange: 500, catchUpVert: 300, landRange: 200,
  jumpLadder: [-5.1, -7.1, -11.1, -10.1, -9.1],
  lines: {},
};
{
  ai67.lines.accel = firstIn(AI067.text, AI067.loc, /float num50 = ([\d.]+)f;/, 'AI_067 步加速度').line;
  ai67.lines.flyAccel = firstIn(AI067.text, AI067.loc, /float num18 = ([\d.]+)f;/, 'AI_067 追赶加速度').line;
  ai67.lines.flySpeed = firstIn(AI067.text, AI067.loc, /float num19 = ([\d.]+)f;/, 'AI_067 追赶速度').line;
  // 逐款追赶触发距（num3）
  ai67.catchUp = {};
  for (const { value } of allIn(AI067.text, AI067.loc, /if \(type == (\d+)\)\s*\{\s*num3 = ([\d.]+)f;/g)) {
    ai67.catchUp[+value[1]] = parseFloat(value[2]);
  }
  // 目标 X 偏移（vector.X 调整；player.width/2 = 10）
  ai67.followDx = {
    500: { dx: -(15 + 10 + 40), line: 0 },  // -(15 + width/2 + 40)*dir
    653: { dx: 0, line: 0 },             // vector.X = player.Center.X
    1018: { dx: 0, line: 0 },
    1056: { dx: -(15 + 10), line: 0 },      // -(15 + width/2)*dir
    1090: { dx: -(15 + 10), line: 0 },
  };
  {
    const mm = /else if \(type == 500\)\s*\{\s*vector\.X -= \(15 \+ player\.width \/ 2\) \* player\.direction;\s*vector\.X -= 40 \* player\.direction;/.exec(AI067.text);
    if (!mm) throw new Error('AI_067 500 目标偏移未找到');
    ai67.followDx[500].line = AI067.loc(mm.index);
  }
  {
    const mm = /else if \(type == 653\)\s*\{\s*vector\.X = player\.Center\.X;/.exec(AI067.text);
    if (!mm) throw new Error('AI_067 653 目标偏移未找到');
    ai67.followDx[653].line = AI067.loc(mm.index);
  }
  {
    const mm = /else if \(type == 1018\)\s*\{\s*vector\.X = player\.Center\.X;/.exec(AI067.text);
    if (!mm) throw new Error('AI_067 1018 目标偏移未找到');
    ai67.followDx[1018].line = AI067.loc(mm.index);
  }
  {
    const mm = /else if \(type == 1056\)\s*\{\s*vector\.X -= \(15 \+ player\.width \/ 2\) \* player\.direction;/.exec(AI067.text);
    if (!mm) throw new Error('AI_067 1056 目标偏移未找到');
    ai67.followDx[1056].line = AI067.loc(mm.index);
    ai67.followDx[1090].line = ai67.followDx[1056].line; // 1090 同款（紧邻 else-if）
  }
  // 滚动角速度除数（rotation += velocity.X / N）
  ai67.roll = {};
  for (const { value } of allIn(AI067.text, AI067.loc, /if \(type == (\d+)\)\s*\{\s*rotation \+= velocity\.X \/ (\d+)f;/g)) {
    ai67.roll[+value[1]] = +value[2];
  }
  {
    const mm = /if \(type == 1018\)\s*\{\s*rotation \+= velocity\.X \/ 20f;/.exec(AI067.text);
    if (!mm) throw new Error('AI_067 1018 滚动档未找到');
    ai67.roll[1018] = 20;
  }
  {
    // 500 的 rotation 行在分支体深处（Lighting/尘之后），块内锚点校验
    const mm = /if \(type == 500\)\s*\{[\s\S]{0,900}?rotation \+= velocity\.X \/ 20f;/.exec(AI067.text);
    if (!mm) throw new Error('AI_067 500 滚动档未找到');
    ai67.roll[500] = 20;
  }
  {
    const mm = /if \(type == 1056 \|\| type == 1090\)\s*\{\s*rotation \+= velocity\.X \/ 16f;/.exec(AI067.text);
    if (!mm) throw new Error('AI_067 1056/1090 滚动档未找到');
    ai67.roll[1056] = 16; ai67.roll[1090] = 16;
  }
  // 1090 追赶飞行提速 18f
  {
    const mm = /if \(type == 1090\)\s*\{\s*num19 = 18f;/.exec(AI067.text);
    if (!mm) throw new Error('AI_067 1090 追赶提速未找到');
    ai67.flySpeed1090 = 18;
    ai67.lines.flySpeed1090 = AI067.loc(mm.index);
  }
  // 跳跃梯（与 AI_026 同构）
  const jl = AI067.text.indexOf('velocity.Y = -5.1f;');
  if (jl < 0) throw new Error('AI_067 跳跃梯未找到');
  ai67.lines.jumpLadder = AI067.loc(jl);
}

// ================= 逐 proj 记录组装 =================
// spriteDirection 语义（PetFollower.draw 翻转）：
//   AI_026 地面尾段 spriteDirection = -direction（贴图基向朝左）→ flipSign=+1；
//   398/956/958/959/960/994 spriteDirection = direction → flipSign=-1；
//   AI_026 飞行分支 spriteDirection = direction → flipSign=-1；199 恒 1 → 0；
//   aiStyle 90/124/144 spriteDirection = player.direction → faceFrom='player'。
const GROUND_FLIP_NEG = new Set([398, 956, 958, 959, 960, 994]);
// ★fx48 boss 宠补层常量（sw-fx48-boss-pets.test.ts 钉值,2026-09-12 定谳,1457 锚）：
const FX48_FLY_WITNESS = new Set([886, 892, 894, 901]); // line = 共享悬停分支头 :60398（B2）
const FX48_FLY_JITTER = new Set([892, 894]);            // 跳过随机抖动（:60430 `type != 892 && type != 894` 守卫臂）
const FX48_703_FRAMETO = 4;                             // AI_144 case 703 num4=4 帧钳（追加语义落 frames 后）
const pets = {};
const familyOf = (id, st) => {
  if (st === 26) return flying26.has(id) ? 'fly' : 'ground';
  if (st === 67) return 'ground';
  return 'hover'; // 11 / 90 / 124 / 144
};
// ★fx48 AI_174 豁免（sw-fx48-boss-pets.test.ts B5）：AI_174_MultisegmentPet(:46177)
//   蠕虫多头三型（883 EaterOfWorlds/887 Destroyer/893 LunaticCultist）不入表 →
//   PetFollower legacy 回退（单精灵引擎未建模,登记债）。豁免按 aiStyle==174 判定
//   （后续新增 174 款自动跟随,无需改清单）。
const ai174Exempt = petProjIds.filter((id) => aiStyleOf(id) === 174);
const tableIds = petProjIds.filter((id) => !ai174Exempt.includes(id));
for (const id of tableIds) {
  const st = aiStyleOf(id);
  if (st === undefined) throw new Error(`proj ${id} 无 aiStyle（vanilla-projectiles.json 缺条目）`);
  const fam = familyOf(id, st);
  const rec = { name: nameOf[id] ?? `Proj${id}`, aiStyle: st, family: fam };
  if (st === 26 && fam === 'ground') {
    if (g.idleOverrides[id] !== undefined) rec.idleRange = g.idleOverrides[id];
    if (g.speedOverrides[id]) { rec.accel = g.speedOverrides[id].accel; rec.maxSpeed = g.speedOverrides[id].maxSpeed; }
    if (g.catchUpOverrides[id] !== undefined) rec.catchUpRange = g.catchUpOverrides[id];
    if (g.flyOverrides[id]) Object.assign(rec, g.flyOverrides[id]);
    rec.faceFrom = 'move';
    rec.flipSign = GROUND_FLIP_NEG.has(id) ? -1 : 1;
  } else if (st === 67) {
    rec.accel = ai67.accel; rec.maxSpeed = ai67.maxSpeed;
    rec.gravity = ai67.gravity; rec.fallCap = ai67.fallCap; rec.teleport = ai67.teleport;
    rec.flyAccel = ai67.flyAccel;
    rec.flySpeed = id === 1090 ? ai67.flySpeed1090 : ai67.flySpeed;
    rec.catchUpRange = ai67.catchUp[id] ?? ai67.catchUpRange;
    rec.catchUpVert = ai67.catchUpVert; rec.landRange = ai67.landRange;
    rec.followDx = ai67.followDx[id].dx;
    if (ai67.roll[id]) rec.roll = ai67.roll[id];
    rec.faceFrom = 'move'; rec.flipSign = -1;
  } else if (fam === 'fly') {
    rec.teleport = fly26.teleport; rec.near = fly26.near; rec.brake = fly26.brake;
    rec.faceFrom = 'move'; rec.flipSign = id === 199 ? 0 : -1;
    if (flySolo[id]) {
      const s = flySolo[id];
      rec.hoverX = s.hoverX; rec.hoverY = s.hoverY; rec.speed = s.speed; rec.accel = s.accel;
      rec.near = s.near; rec.brake = s.brake; rec.teleport = s.teleport; rec.line = s.line;
      if (s.farSpeed) { rec.farSpeed = s.farSpeed; rec.farDist = s.farDist; }
      if (s.farAccel) rec.farAccel = s.farAccel;
      if (s.brakeMode) rec.brakeMode = s.brakeMode;
    } else {
      rec.hoverX = fly26.hoverX; rec.hoverY = fly26.hoverY;
      rec.jitter = FX48_FLY_JITTER.has(id) ? 0 : fly26.jitter;
      const ov = flySpeedOv[id];
      if (ov) { rec.speed = ov.speed; rec.accel = ov.accel; }
      else { rec.speed = 14; rec.accel = 0.4; }
      // fx48 见证锚（key 序：speed/accel 之后、farSpeed/farDist 之前——与 fx48 手补
      // 条目逐字节同构）：886/892/894/901 line = 共享悬停分支头
      if (FX48_FLY_WITNESS.has(id)) rec.line = fly26.headLine;
      if (ov && ov.farSpeed !== undefined) rec.farSpeed = ov.farSpeed;
      if (ov && ov.farDist !== undefined) rec.farDist = ov.farDist;
      // 774/1046：-70x + 正弦浮游（±8）替代随机抖动（:56489-56495）
      if (id === 774 || id === 1046) { rec.hoverX = -70; rec.jitter = 0; rec.bob = 8; }
    }
  } else if (st === 11) {
    rec.hoverX = 0; rec.hoverY = 0;
    rec.holdDist = st11.holdDist; rec.speed = st11.orbitSpeed; rec.teleport = st11.teleport;
    rec.faceFrom = 'none'; rec.flipSign = 0;
    rec.line = st11.lines.speed;
  } else if (st === 90) {
    rec.hoverX = st90.hoverX; rec.hoverY = st90.hoverY;
    rec.speedBase = st90.speedBase; rec.rampDist = st90.rampDist; rec.ramp = st90.ramp;
    rec.speedLerp = st90.speedLerp; rec.teleport = st90.teleport;
    rec.faceFrom = 'player'; rec.flipSign = -1;
    rec.line = st90.lines.hoverX;
  } else if (st === 124) {
    const ov = st124Overrides[id];
    rec.hoverX = ov ? ov.hoverX : st124Base.hoverX;
    rec.hoverY = ov ? ov.hoverY : st124Base.hoverY;
    rec.snap = st124Base.snap; rec.velLerp = st124Base.velLerp; rec.teleport = st124Base.teleport;
    rec.idleRate = 6; rec.moveRate = 4;
    rec.faceFrom = 'player'; rec.flipSign = -1;
    rec.line = ov ? ov.line : st124Base.lines.hoverX;
  } else {
    const ov = ai144Overrides[id];
    rec.hoverX = ov && ov.hoverX !== undefined ? ov.hoverX : ai144Base.hoverX;
    rec.hoverY = ai144Base.hoverY;
    rec.snap = ov && ov.snap !== undefined ? ov.snap : ai144Base.snap;
    rec.velLerp = ov && ov.velLerp !== undefined ? ov.velLerp : ai144Base.velLerp;
    rec.teleport = ai144Base.teleport;
    rec.idleRate = ov && ov.idleRate !== undefined ? ov.idleRate : ai144Base.idleRate;
    rec.moveRate = ov && ov.moveRate !== undefined ? ov.moveRate : ai144Base.moveRate;
    if (ov && ov.bob !== undefined) { rec.bob = ov.bob; rec.bobPeriod = ov.bobPeriod; }
    if (ov && ov.frameTo !== undefined) rec.frameTo = ov.frameTo;
    rec.faceFrom = 'player'; rec.flipSign = -1;
    rec.line = ov ? ov.line : ai144Base.lines.hover;
  }
  rec.frames = framesOf[id] ?? 1;
  // fx48 703 追加语义：frameTo 落 frames 之后（key 序与 fx48 手补条目逐字节同构；
  // 值 4 已由 AI_144 case 703 锚点 `num4 = 4;` 校验）
  if (id === 703) rec.frameTo = FX48_703_FRAMETO;
  pets[id] = rec;
}

// ================= 家族默认（运行时回退参数） =================
// key 序照录 fx48 手补态（hover/ground/fly）——保 bare 重跑与现库逐字节同构
// （pet-ai/sw-fx48 断言用 toEqual 键序不敏感）
const familyCounts = { hover: 0, ground: 0, fly: 0 };
for (const r of Object.values(pets)) familyCounts[r.family]++;

const out = {
  meta: {
    source: `Terarria${VER}/Terraria/Projectile.cs`,
    generatedBy: 'tools/extract-petai.mjs',
    petProjCount: tableIds.length,
    familyCounts,
    /** 未覆盖 aiStyle → PetFollower 回退"肩后悬停近似"（旧统一 AI），见 PetFollower 注释 */
    fallback: 'hover-legacy',
    /** ★fx48 boss 宠补层（sw-fx48-boss-pets.test.ts 钉值面） */
    swFx48Ext: {
      note: '1.4.5 boss 宠 17 条目（1457 Projectile.cs 锚,Item.cs:39417-39440 4797-4817→proj 881-901）; AI_174_MultisegmentPet(:46177) 蠕虫多头三型 883/887/893 不入表→PetFollower legacy 回退（登记债）',
      exemptAI174: ai174Exempt,
    },
    methodLines: {
      AI_026: AI026.sigLine,
      AI_067_FreakingPirates: AI067.sigLine,
      AI_144_DD2Pet: AI144.sigLine,
      aiStyle_11: ST11.sigLine,
      aiStyle_90: ST90.sigLine,
      aiStyle_124: ST124.sigLine,
    },
    paramLines: L,
  },
  defaults: {
    ground: {
      idleRange: g.idleRange, accel: g.accel, maxSpeed: g.maxSpeed,
      catchUpRange: g.catchUpRange, catchUpVert: g.catchUpVert,
      flyAccel: g.flyAccel, flySpeed: g.flySpeed, landRange: g.landRange,
      gravity: g.gravity, fallCap: g.fallCap, jumpLadder: g.jumpLadder, teleport: g.teleport,
      faceFrom: 'move', flipSign: 1,
    },
    fly: {
      teleport: fly26.teleport, jitter: fly26.jitter, hoverX: fly26.hoverX, hoverY: fly26.hoverY,
      near: fly26.near, brake: fly26.brake, speed: 14, accel: 0.4, farAccel: 0.2,
      faceFrom: 'move', flipSign: -1,
      teleportLine: fly26.teleportLine, hoverXLine: fly26.hoverXLine, hoverYLine: fly26.hoverYLine,
    },
    hover: { snap: 4, velLerp: 0.1, teleport: 1000, idleRate: 6, moveRate: 4, faceFrom: 'player', flipSign: -1 },
  },
  pets,
};

const dist = tableIds.reduce((a, id) => { const k = aiStyleOf(id); a[k] = (a[k] || 0) + 1; return a; }, {});
console.error(`宠物 proj ${tableIds.length} 款（AI_174 豁免 ${ai174Exempt.length} 款：${ai174Exempt.join(',')}）→ 家族分布`, JSON.stringify(familyCounts));
console.error('aiStyle 分布:', JSON.stringify(dist));
console.error('AI_026 飞行子型:', [...flying26].sort((a, b) => a - b).join(','));
if (OUT_JSON) {
  mkdirSync(OUT_JSON.slice(0, OUT_JSON.lastIndexOf('/')), { recursive: true });
  writeFileSync(OUT_JSON, `${JSON.stringify(out, null, 1)}\n`);
  console.error(`[extract-petai] 已写 ${OUT_JSON}（SW_ITEM_VER=${VER}${WRITE_REAL ? ' --write-real 真库' : ' SW_OUT 沙箱'}）`);
} else {
  console.error('[extract-petai] 干跑（零写盘）：SW_OUT=<dir> 沙箱输出 / --write-real 更新现库');
}
for (const id of [111, 127, 875, 702, 1050, 957, 18, 492, 1056]) console.error(id, JSON.stringify(pets[id]));

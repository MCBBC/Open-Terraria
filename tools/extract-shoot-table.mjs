// R26 权威武器发射参数表提取器(对抗第五批·武器效果对齐专项)。
// 输出 game/tools/golden/vanilla-shoot-table.json —— 后续 R27-R31 各轮发射数量/散角/
// 节拍审计的对拍金参考。
//
// 提取面(基准 Terarria1458,数值对照 Terarria1457,差异写 diff1457 字段):
//   A. Item.cs SetDefaults 主 switch(+SetDefaults1..5 分段 switch、贯穿组、嵌套
//      switch(type)/if(type==N) 二次覆盖、DefaultTo* 辅助函数内联语义):
//      shoot/shootSpeed/useTime/useAnimation/autoReuse/channel/magic/melee/ranged/summon/
//      noMelee/noUseGraphic/consumable/useStyle/reuseDelay/damage/knockBack/crit/scale/mana
//      + UseSound(SoundID.ItemN → "Item_N",含 DefaultToStaff=Item_43 等隐式来源)。
//   B. Player.cs ItemCheck_Shoot(:47461-50298)per-item 顶层 if 分支:
//      projToShoot 重定向(if 块内仅 `projToShoot = N;`)→ overrideShoot;
//      NewProjectile 调用数/循环上界/rand 散角行 → shots/spreadRaw;复杂式存 raw 片段并标
//      needsManual(decompiler 噪声:num\d+ 变量名不解析只存原文)。
//   C. ItemID.Sets / ProjectileID.Sets 中影响发射流的 bool 集(CreateBoolSet 解析):
//      ShootsOnUseRelease(按住不出手,松手才发)、gunProj(gunProj 重置伤害/击退/弹速)、
//      ProjectileID.Sets.NoMeleeSpeedVelocityScaling(melee 弹速不除 meleeSpeed)。
//
// 解析骨架(方法体切片/switch 拆分/贯穿组/嵌套覆盖求值)沿用 tools/extract-itemcombat.mjs
// 的成熟实现(2026-08-17 三通道版),按本表字段集裁剪;两文件字段重叠处以本表为准——
// ★2026-08 审计发现 vanilla-itemcombat.json 对部分 id 存在组串扰记录(如 776 镐/1336 金瀑
// 曾互串),本工具的 NUM/BOOL 字段集更窄 + overrideShoot 显式通道,不继承其异常。
//
// 运行:node tools/extract-shoot-table.mjs            # 写 golden/vanilla-shoot-table.json
//       node tools/extract-shoot-table.mjs --audit    # 只打印统计,不写文件
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const AUDIT = process.argv.includes('--audit');
const VER = process.env.SW_SHOOT_VER ?? '1458';   // 变更面权威
const BASE = process.env.SW_SHOOT_BASE ?? '1457'; // 数值基准(差异标注)

const readSrc = (ver, file) => readFileSync(join(ROOT, `Terarria${ver}`, file), 'utf8');

// ---------- 通用切片 ----------
function methodBody(src, sig) {
  const idx = src.indexOf(sig);
  if (idx < 0) return '';
  const start = src.indexOf('{', idx);
  let depth = 0;
  for (let i = start; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) return src.slice(start + 1, i); }
  }
  return '';
}
function lineOf(src, needle) {
  const idx = src.indexOf(needle);
  if (idx < 0) return -1;
  return src.slice(0, idx).split('\n').length;
}

// ---------- Item.cs SetDefaults 解析 ----------
const NUM_FIELDS = ['damage', 'knockBack', 'useTime', 'useAnimation', 'shoot', 'shootSpeed',
  'mana', 'reuseDelay', 'crit', 'scale'];
const BOOL_FIELDS = ['autoReuse', 'channel', 'magic', 'melee', 'ranged', 'summon',
  'noMelee', 'noUseGraphic', 'consumable', 'shootsEveryUse'];

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
    let d0 = 0;
    for (let i = 0; i < m.index; i++) {
      if (body[i] === '{') d0++;
      else if (body[i] === '}') d0--;
    }
    spans.push({ start: m.index, open, close, depth: d0 });
  }
  return spans;
}
function parseSwitchCases(body) {
  const out = [];
  const spans = switchSpans(body);
  const isNestedCase = (pos) => {
    let inner = null;
    for (const s of spans) {
      if (s.open < pos && pos < s.close && (!inner || s.open > inner.open)) inner = s;
    }
    return !!inner && inner.depth > 0;
  };
  // `default: if (type < A || type > B) { break; } goto case N;` 反编译惯用法
  // (悠悠球族 3315-3317 → goto case 3262,Item.cs:30033-30041)——区间 id 并入 N 的组
  const gotoExtra = new Map(); // targetId -> [ids...]
  const gm = /default:\s*if \(type < (\d+) \|\| type > (\d+)\)\s*\{\s*break;\s*\}\s*goto case (\d+);/g;
  let gmm;
  while ((gmm = gm.exec(body))) {
    const lo = +gmm[1], hi = +gmm[2], tgt = +gmm[3];
    if (!isNestedCase(gmm.index)) {
      const ids = [];
      for (let i = lo; i <= hi; i++) ids.push(i);
      if (!gotoExtra.has(tgt)) gotoExtra.set(tgt, []);
      gotoExtra.get(tgt).push(...ids);
    }
  }
  const caseRe = /\bcase (\d+):/g;
  const marks = [];
  let m;
  while ((m = caseRe.exec(body))) if (!isNestedCase(m.index)) marks.push([+m[1], m.index]);
  // ★`default:` 臂是块边界(反编译把 default 体排在末组数值 case 之后,
  //   不截断会让 default 的深度 1 赋值串进前一组——悠悠球 3292 曾被
  //   default 的 kb=4/damage=15 覆盖真值 kb=3.5/115)
  const defMarks = [];
  const defRe = /\bdefault\s*:/g;
  while ((m = defRe.exec(body))) if (!isNestedCase(m.index)) defMarks.push(m.index);
  const nextBarrierAfter = (pos) => {
    let best = -1;
    for (const d of defMarks) if (d > pos && (best < 0 || d < best)) best = d;
    return best;
  };
  let k = 0;
  while (k < marks.length) {
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
    for (const gid of group) {
      if (gotoExtra.has(gid)) group.push(...gotoExtra.get(gid));
    }
    const start = body.indexOf(':', marks[k][1]) + 1;
    const barrier = nextBarrierAfter(marks[k][1]);
    if (barrier >= 0 && barrier < end) end = barrier;
    out.push({ ids: group, block: body.slice(start, end) });
    k++;
  }
  return out;
}
function nestedTypeIfCases(block) {
  const out = [];
  const re = /(?:else\s+)?if\s*\(/g;
  let m;
  while ((m = re.exec(block))) {
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
    const defPos = [...inner.matchAll(/\bdefault\s*:/g)].map((x) => x.index);
    for (let j = 0; j < marks2.length; j++) {
      const s2 = inner.indexOf(':', marks2[j][1]) + 1;
      let e2 = j + 1 < marks2.length ? marks2[j + 1][1] : inner.length;
      const db = defPos.find((d) => d > marks2[j][1] && d < e2); // default 臂截断(防串值)
      if (db !== undefined) e2 = db;
      out.push({ id: marks2[j][0], block: inner.slice(s2, e2) });
    }
    // 内层 default 的 goto-case 区间同样并入(嵌套形态)
  }
  return out;
}
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
const stripOuterBrace = (block) => {
  const open = block.indexOf('{');
  if (open < 0) return block;
  if (block.slice(0, open).trim() !== '') return block;
  let depth = 0;
  for (let i = open; i < block.length; i++) {
    if (block[i] === '{') depth++;
    else if (block[i] === '}') { depth--; if (depth === 0) return block.slice(open + 1, i); }
  }
  return block;
};

// AmmoID.* 枚举(与 extract-itemcombat.mjs 同表;AmmoID.cs:112-146)
const AMMO_ID = {
  None: 0, Gel: 23, Arrow: 40, Coin: 71, FallenStar: 75, Bullet: 97, Sand: 169,
  Dart: 283, Rocket: 771, Solution: 780, Flare: 931, Snowball: 949, StyngerBolt: 1261,
  CandyCorn: 1783, JackOLantern: 1785, Stake: 1836, NailFriendly: 3108, Acorn: 27,
};

/** DefaultTo* 辅助函数语义(1458 Item.cs 行号):
 *  DefaultToMagicWeapon :48433 / DefaultToRangedWeapon :48445 / DefaultToThrownWeapon :48458 /
 *  DefaultToBow :48425(Item_5) / DefaultToStaff :48016(Item_43,内部调 MagicWeapon) /
 *  DefaultToSpear :48025(style5/noMelee/noUseGraphic/melee,Item_1) /
 *  DefaultToWhip :47811 / DefaultToBomb :47771 */
function applyHelper(rec, call) {
  const m = call.match(/DefaultTo(\w+)\s*\(([^)]*)\)/);
  if (!m) return;
  const name = m[1];
  // 位置参数切分:数字字面量/AmmoID 符号/bool 具名参数(hasAutoReuse:true)各归其位
  const rawArgs = [];
  let depthP = 0, curTok = '';
  for (const ch of m[2]) {
    if (ch === ',' && depthP === 0) { rawArgs.push(curTok.trim()); curTok = ''; continue; }
    if (ch === '(' || ch === '{') depthP++;
    else if (ch === ')' || ch === '}') depthP--;
    curTok += ch;
  }
  if (curTok.trim()) rawArgs.push(curTok.trim());
  const args = rawArgs.map((t) => {
    const am = t.match(/^AmmoID\.(\w+)$/);
    if (am) return AMMO_ID[am[1]] ?? -1;
    const named = t.match(/\w+:(true|false)/);
    if (named) return named[1] === 'true' ? 1 : 0;
    const n = parseFloat(t);
    return Number.isFinite(n) ? n : t;
  });
  const B = (i, dflt = false) => (args[i] ? args[i] !== 0 : dflt);
  switch (name) {
    case 'MagicWeapon':
      rec.autoReuse = !!args[3];
      rec.useStyle = 5; rec.useAnimation = args[1]; rec.useTime = args[1];
      rec.shoot = args[0]; rec.shootSpeed = args[2];
      rec.noMelee = true; rec.magic = true;
      break;
    case 'RangedWeapon':
      rec.autoReuse = !!args[4];
      rec.useStyle = 5; rec.useAnimation = args[2]; rec.useTime = args[2];
      rec.shoot = args[0]; rec.useAmmo = args[1]; rec.shootSpeed = args[3];
      rec.noMelee = true; rec.ranged = true;
      break;
    case 'ThrownWeapon':
      rec.autoReuse = !!args[4];
      rec.useStyle = 1; rec.useAnimation = args[2]; rec.useTime = args[2];
      rec.shoot = args[0]; rec.shootSpeed = args[3];
      rec.noMelee = true; rec.ranged = true; rec.consumable = true;
      break;
    case 'Bow': // DefaultToBow(time, vel, autoReuse) → RangedWeapon(1, Arrow, …)+Item_5
      applyHelper(rec, `DefaultToRangedWeapon(1, 40, ${args[0]}, ${args[1]}, ${B(2)})`);
      rec.useSound = rec.useSound ?? 'Item_5';
      break;
    case 'Staff': // DefaultToStaff(proj, speed, time, mana) → MagicWeapon(auto:true)+mana+w/h+Item_43
      applyHelper(rec, `DefaultToMagicWeapon(${args[0]}, ${args[2]}, ${args[1]}, true)`);
      rec.mana = args[3];
      rec.useSound = rec.useSound ?? 'Item_43';
      break;
    case 'Spear':
      rec.useStyle = 5; rec.useAnimation = args[2]; rec.useTime = args[2];
      rec.shootSpeed = args[1]; rec.shoot = args[0];
      rec.noMelee = true; rec.noUseGraphic = true; rec.melee = true;
      rec.useSound = rec.useSound ?? 'Item_1';
      break;
    default:
      break; // Whip/Bomb/Kite 等非直射族不在本表核心字段内,显式忽略
  }
}

/** 单版本 SetDefaults 全量提取 → Map<id, rec> */
function extractSetDefaults(ver) {
  const src = readSrc(ver, 'Terraria/Item.cs');
  const bodies = [
    methodBody(src, 'void SetDefaults(int Type'),
    ...[1, 2, 3, 4, 5].map((n) => methodBody(src, `void SetDefaults${n}(int type)`)),
  ].filter(Boolean);
  const table = new Map(); // id -> rec(后写者胜)
  const TRACE = process.env.SW_SHOOT_TRACE_ID ? +process.env.SW_SHOOT_TRACE_ID : null;
  const soundOf = () => undefined;
  const applyBlock = (rec, block, id) => {
    for (let l of depth1Lines(block)) {
      if (/DefaultTo\w+\s*\(/.test(l)) { applyHelper(rec, l); continue; }
      const compound = l.match(/^\(?(\w+) = (\w+) = (-?\d+(?:\.\d+)?f?)\);?$/);
      if (compound && NUM_FIELDS.includes(compound[1]) && NUM_FIELDS.includes(compound[2])) {
        rec[compound[1]] = parseFloat(compound[3]);
        rec[compound[2]] = parseFloat(compound[3]);
        continue;
      }
      const num = l.match(/^(\w+) = (.+);$/);
      if (num && NUM_FIELDS.includes(num[1])) {
        // 反编译 float 字面量尾缀 `12f`/`6f` 剥离(数字后紧贴的 f),再剥 (int) 强转
        let expr = num[2].replace(/(?<=\d)f(?![\w])/g, '').replace(/\(int\)/g, '').trim();
        // 字段别名拷贝(`useTime = useAnimation;` 形态,如 case 1226)
        if (NUM_FIELDS.includes(expr) && rec[expr] !== undefined) {
          rec[num[1]] = rec[expr];
          continue;
        }
        if (/^[\s\d.+\-*/()]*$/.test(expr.replace(/\btype\b/g, ''))) {
          let v;
          try { v = new Function('type', `return (${expr});`)(id); } catch { v = NaN; }
          if (Number.isFinite(v)) { rec[num[1]] = Math.round(v * 1000) / 1000; continue; }
        }
        continue; // 不可求值表达式(含未知变量)→ 留空,由 branches/raw 补
      }
      const b = l.match(/^(\w+) = (true|false);/);
      if (b && BOOL_FIELDS.includes(b[1])) { rec[b[1]] = b[2] === 'true'; continue; }
      const snd = l.match(/^UseSound = SoundID\.(\w+);/);
      if (snd) { rec.useSound = snd[1].startsWith('Item') ? `Item_${snd[1].slice(4)}` : snd[1]; continue; }
      if (l.match(/^UseSound = null;/)) { rec.useSound = null; continue; }
      const st = l.match(/^useStyle = (\d+);/);
      if (st) { rec.useStyle = +st[1]; }
    }
  };
  for (const body of bodies) {
    for (const c of parseSwitchCases(body)) {
      const blk = stripOuterBrace(c.block);
      // 委托继承:`SetDefaults3(2773); type=2778; …` 形态(嵌套 switch 内常见,
      // 如 2778-2786 弹药变体)——先克隆被引 id 当前记录,再叠加本块覆盖
      // 委托继承:`SetDefaults3(2773); type=2778; …` 形态(变体族常见)——
      // ★只认块首的委托模式(委托调用必须是块内第一条语句);块中部出现的
      // SetDefaults 引用属兄弟结构,禁止乱认爹(2026-08 审计:全块扫描曾把
      // 盔甲 2772 的记录串给 544 等无关 id)
      const delHead = blk.match(/^\s*SetDefaults(\d)\((\d+)\);/);
      for (const id of c.ids) {
        const inherited = delHead ? { ...(table.get(+delHead[2]) ?? {}) } : {};
        const rec = {};
        applyBlock(rec, blk, id);
        if (TRACE === id) console.error('[main-group]', JSON.stringify(rec).slice(0, 200), 'inh=', delHead && delHead[2]);
        if (Object.keys(rec).length === 0 && !delHead) continue;
        table.set(id, { ...inherited, ...(table.get(id) ?? {}), ...rec, __id: id });
      }
      // 嵌套二次覆盖(switch(type) / if(type==N))
      for (const n of [...nestedSwitchCases(blk), ...nestedTypeIfCases(blk)]) {
        const ndelHead = n.block.match(/^\s*SetDefaults(\d)\((\d+)\);/);
        const inherited = ndelHead ? { ...(table.get(+ndelHead[2]) ?? {}) } : {};
        const sub = {};
        applyBlock(sub, n.block, n.id);
        if (TRACE === n.id) console.error('[nested]', JSON.stringify(sub).slice(0, 200), 'blk=', n.block.replace(/\s+/g, ' ').slice(0, 120), 'inh=', ndelHead && ndelHead[2]);
        if (Object.keys(sub).length === 0 && !ndelHead) continue;
        table.set(n.id, { ...inherited, ...(table.get(n.id) ?? {}), ...sub, __id: n.id });
      }
    }
  }
  return { table, lineHint: lineOf(src, 'void SetDefaults(int Type') };
}

// ---------- Player.cs ItemCheck_Shoot per-item 分支 ----------
/** 顶层语句切分:逐个 `if (...) {...}`(含 else 链归并到块尾),只处理方法体深度 0 */
function topLevelIfSegments(body) {
  const segs = [];
  const re = /(?:^|\n)\t*(?:else\s+)?if\s*\(/g;
  let m;
  while ((m = re.exec(body))) {
    const begin = m.index + m[0].indexOf('if');
    // 深度门:if 关键字必须处于深度 0(排除嵌套块内的 if——它们已含在所属块 raw 里)
    let d0 = 0;
    for (let i = 0; i < begin; i++) {
      if (body[i] === '{') d0++;
      else if (body[i] === '}') d0--;
    }
    if (d0 !== 0) continue;
    const condOpen = body.indexOf('(', begin);
    let d = 0, condClose = -1;
    for (let i = condOpen; i < body.length; i++) {
      if (body[i] === '(') d++;
      else if (body[i] === ')') { d--; if (d === 0) { condClose = i; break; } }
    }
    if (condClose < 0) continue;
    const braceAt = body.indexOf('{', condClose);
    const tail = braceAt < 0 ? '' : body.slice(condClose + 1, braceAt).trim();
    let end;
    if (braceAt >= 0 && tail === '') {
      let dd = 0;
      for (let i = braceAt; i < body.length; i++) {
        if (body[i] === '{') dd++;
        else if (body[i] === '}') { dd--; if (dd === 0) { end = i + 1; break; } }
      }
    } else {
      const semi = body.indexOf(';', condClose);
      end = semi < 0 ? body.length : semi + 1;
    }
    segs.push({ cond: body.slice(condOpen + 1, condClose), block: body.slice(begin, end), start: begin });
    re.lastIndex = end;
  }
  return segs;
}

/** ItemCheck_Shoot 分支提取 → Map<id, branches[]> */
function extractShootBranches(ver) {
  const psrc = readSrc(ver, 'Terraria/Player.cs');
  const SIG = 'private void ItemCheck_Shoot(int i, Item sItem, int weaponDamage, bool withAudioVisualFeedback = true)';
  const sigIdx = psrc.indexOf(SIG);
  const body = methodBody(psrc, SIG);
  const lineBase = psrc.slice(0, sigIdx).split('\n').length; // SIG 所在行
  const map = new Map();
  let branchCount = 0;
  for (const seg of topLevelIfSegments(body)) {
    const cond = seg.cond.trim().replace(/\s+/g, ' ');
    // 只收以 type 判等为主的条件(允许合取 projToShoot/sItem.shoot 纯判等);
    // 条件里出现非纯 token(rand/Collision/函数调用)→ 整段跳过(raw 已不可靠归 needsManual 族)
    if (!/\b(?:sItem\.)?type\s*==/.test(cond)) continue;
    const stripped = cond.replace(/(sItem\.type|\btype\b|projToShoot|sItem\.shoot)/g, '');
    if (!/^[\s\d()&|=<>!*]+$/.test(stripped)) continue;
    const ids = new Set();
    for (const x of cond.matchAll(/(?:sItem\.type|\btype\b)\s*==\s*(\d+)/g)) ids.add(+x[1]);
    if (ids.size === 0) continue;
    const inner = seg.block;
    const newProjCalls = (inner.match(/NewProjectile\(/g) || []).length;
    const loops = [];
    for (const lm of inner.matchAll(/for \(int \w+ = \d+; \w+ < ([^;]+);/g)) loops.push(lm[1].trim());
    const spreadRaw = [];
    for (const sm of inner.matchAll(/^.*(?:Main\.rand\.Next(?:Float|Direction)?|RotatedByRandom).*$/gm)) {
      const t = sm[0].replace(/\t/g, ' ').trim();
      if (spreadRaw.length < 8 && !spreadRaw.includes(t)) spreadRaw.push(t);
    }
    const pureAssign = /^\s*projToShoot = (\d+);\s*$/.test(inner);
    const ov = inner.match(/^\s*projToShoot = (\d+);\s*$/m);
    const needsManual = newProjCalls > 0 || loops.length > 0 || spreadRaw.length > 0 || !pureAssign;
    const entry = {
      cond: cond.slice(0, 160),
      line: lineBase + body.slice(0, seg.start).split('\n').length,
      newProjCalls, loops, spreadRaw,
      overrideShoot: pureAssign && ov ? +ov[1] : undefined,
      needsManual,
      raw: needsManual ? inner.replace(/\t/g, ' ').replace(/\n{2,}/g, '\n').trim().slice(0, 2400) : undefined,
    };
    branchCount++;
    for (const id of ids) {
      if (!map.has(id)) map.set(id, []);
      map.get(id).push(entry);
    }
  }
  return { map, branchCount, found: body.length > 0 };
}

// ---------- ItemID.Sets / ProjectileID.Sets ----------
function extractBoolSet(file, setName) {
  const src = readSrc(VER, file);
  const m = src.match(new RegExp(`public static bool\\[\\] ${setName} = Factory\\.CreateBoolSet\\(([^)]*)\\)`));
  if (!m) return null;
  const nums = [...m[1].matchAll(/(\d+)/g)].map((x) => +x[1]);
  const firstFalse = /^\s*false/.test(m[1]);
  return firstFalse ? nums.filter((n, i) => i > 0) : nums; // 首参为默认值
}

// ---------- 汇总 ----------
function buildFor(ver) {
  const sd = extractSetDefaults(ver);
  const br = extractShootBranches(ver);
  return { sd, br };
}

const cur = buildFor(VER);
const base = BASE !== VER ? buildFor(BASE) : null;
if (!cur.br.found) { console.error('FATAL: ItemCheck_Shoot 方法体未找到'); process.exit(1); }
if (process.env.SW_SHOOT_DEBUG_ID) {
  console.error(process.env.SW_SHOOT_DEBUG_ID, JSON.stringify([...cur.sd.table.entries()]
    .filter(([k]) => k === +process.env.SW_SHOOT_DEBUG_ID)));
}

const setsOnRelease = extractBoolSet('Terraria.ID/ItemID.cs', 'ShootsOnUseRelease') ?? [];
const gunProj = extractBoolSet('Terraria.ID/ItemID.cs', 'gunProj') ?? [];

const items = {};
let needsManualCount = 0, withBranches = 0, multishotCycle = 0, numberResolved = 0, multiBranchShots = 0;
const allIds = new Set([...cur.sd.table.keys(), ...cur.br.map.keys()]);
for (const id of allIds) {
  if (id === 0) continue;
  const r = cur.sd.table.get(id) ?? {};
  const branches = cur.br.map.get(id) ?? [];
  const isWeaponish = r.shoot > 0 || r.mana > 0 || r.useAmmo > 0 || r.channel === true ||
    r.magic || r.ranged || r.summon || (r.damage > 0 && (r.autoReuse || r.noMelee || r.melee)) ||
    branches.length > 0;
  if (!isWeaponish) continue;
  const shootArr = r.shoot > 0 ? [r.shoot] : [];
  // overrideShoot:分支里纯 projToShoot=N 重定向
  let overrideShoot;
  for (const b of branches) if (b.overrideShoot != null) overrideShoot = b.overrideShoot;
  // number:每次按压出手数估计——1 + 分支内字面上界循环数(NewProjectile 在循环内);
  // 循环上界非常量或散布复杂式 → null(消费方读 branches.raw)
  let number = 1;
  for (const b of branches) {
    for (const lp of b.loops) {
      number = /^\d+$/.test(lp) ? number + (+lp) - (b.newProjCalls > 1 ? 0 : 1) : null;
      if (number === null) break;
    }
    if (number === null) break;
  }
  const U = r.useTime, A = r.useAnimation;
  const multishotPerCycle = !!(U > 0 && A > 0 && U < A && (r.mana > 0 || r.useAmmo > 0));
  const diff = {};
  if (base) {
    const rb = base.sd.table.get(id) ?? {};
    for (const f of [...NUM_FIELDS, ...BOOL_FIELDS, 'useSound']) {
      const a = r[f], b = rb[f];
      if (JSON.stringify(a) !== JSON.stringify(b) && (a !== undefined || b !== undefined)) {
        diff[f] = [BASE, VER].map((v, i) => (i === 0 ? b : a));
      }
    }
  }
  const anyManual = branches.some((b) => b.needsManual);
  if (anyManual) needsManualCount++;
  if (branches.length) withBranches++;
  if (multishotPerCycle) multishotCycle++;
  if (branches.some((b) => b.newProjCalls > 0)) {
    if (number != null && branches.every((b) => b.loops.every((l) => /^\d+$/.test(l)))) numberResolved++;
    multiBranchShots++;
  }
  items[String(id)] = {
    shoot: shootArr,
    number,
    overrideShoot: overrideShoot ?? null,
    speedRand: branches.some((b) => b.spreadRaw.length > 0) || undefined,
    mana: r.mana, useSound: r.useSound, useTime: r.useTime, useAnimation: r.useAnimation,
    autoReuse: r.autoReuse, channel: r.channel || undefined,
    magic: r.magic || undefined, ranged: r.ranged || undefined, melee: r.melee || undefined,
    summon: r.summon || undefined, consumable: r.consumable || undefined,
    noMelee: r.noMelee || undefined, noUseGraphic: r.noUseGraphic || undefined,
    useStyle: r.useStyle, reuseDelay: r.reuseDelay || undefined,
    damage: r.damage, knockBack: r.knockBack, shootSpeed: r.shootSpeed,
    multishotPerCycle: multishotPerCycle || undefined,
    shootsEveryUse: r.shootsEveryUse || undefined,   // 每动画窗限一发(flag4=ItemAnimationJustStarted)
    shootsOnRelease: setsOnRelease.includes(id) || undefined,
    gunProj: gunProj.includes(id) || undefined,
    branches: branches.length ? branches : undefined,
    diff1457: Object.keys(diff).length ? diff : undefined,
  };
  // 清理 undefined 字段保持 json 紧凑
  for (const k of Object.keys(items[String(id)])) if (items[String(id)][k] === undefined) delete items[String(id)][k];
}

const summary = {
  srcVersion: VER, baseVersion: BASE,
  generatedAt: new Date().toISOString(),
  itemCount: Object.keys(items).length,
  setDefaultsRecords: cur.sd.table.size,
  playerBranches: cur.br.branchCount,
  itemsWithBranches: withBranches,
  itemsWithRawSnippetNeedsManual: needsManualCount,
  multiShotItemsNumberResolved: numberResolved,
  multiShotBranchItems: multiBranchShots,
  multishotPerCycleItems: multishotCycle,
  diff1457Items: Object.values(items).filter((x) => x.diff1457).length,
};

if (AUDIT) {
  console.log(JSON.stringify(summary, null, 2));
} else {
  mkdirSync(join(HERE, 'golden'), { recursive: true });
  const outPath = join(HERE, 'golden', 'vanilla-shoot-table.json');
  writeFileSync(outPath, JSON.stringify({ _meta: summary, sets: { shootsOnUseRelease: setsOnRelease }, items }, null, 1));
  console.log(JSON.stringify(summary, null, 2));
  console.log(`→ ${outPath}`);
}

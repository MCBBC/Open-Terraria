// 三方对账:public/sprites/vanilla-npcs.json × NPC.cs(1456) × NPC.cs(1457)。
// 只读零写入。目的:① CLASS A = json 对 1456 的存量漂移(1405 旧值/漏字段);
// ② CLASS B = 1456→1457 数值变更(移植确认清单,不动数据)。
// 1456/1457 SetDefaults 形态:裸 type 的 if/else-if 链 + OR 列表条件
// (type == 455 || ...) + 区间条件(type >= A && type <= B),字段为裸赋值
// (无 this. 前缀——与 1405 的 this.type 链不同,故不能用 extract-npcs.mjs 直跑)。
// 用法:node tools/recon-npc-1456-1457.mjs          (在 game/ 下,只读对账)
//      node tools/recon-npc-1456-1457.mjs --fix   (应用 A 类修正到 json,先备份)
import { readFileSync, writeFileSync, copyFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

// 与 extract-npcs.mjs 的 KEYS 契约一致(json schema 面);value 等另有数据归属。
// ★BJ106 债刀 2026-09-17 扩面(显式声明):KEYS + 'color'——SetDefaults per-type 色
// (仅 1/16/537 三型 :8611/:9003/:15897,1456/1457/1458 三树同值;json 侧
// public/sprites/vanilla-npcs.json 自 2026-08-21 起带 color 字段,此前无闸裸奔:
// extract-npcs.mjs(1405 锚)KEYS 无 color,重跑即静默洗掉三型色)。解析形态:
//   `new Color(r, g, b[, a])` → [r,g,b,a(缺省 255)]
//   `new Color(255, 250, 0, 0) * 0.2f` → FNA Color×float 逐通道(含 α)舍入
//     (FNA Color.op_Multiply → float ctor PackUnsigned,255×0.2=51/250×0.2=50);
//   `color = default(Color)`(SetDefaults 头 :8554 复位,链外不进块)若入块则跳过不落表。
// 数组值等价:CLASS A/B 比对用逐通道全等(此前无数组字段,纯增量语义)。
const KEYS = ['lifeMax', 'damage', 'defense', 'knockBackResist', 'aiStyle', 'width', 'height',
  'npcSlots', 'noGravity', 'noTileCollide', 'friendly', 'townNPC', 'HitSound', 'DeathSound',
  'scale', 'alpha', 'catchItem', 'lavaImmune', 'behindTiles', 'color'];
const KEY_RE = new RegExp(`\\b(${KEYS.join('|')})\\s*(=|\\+=|-=)\\s*([^;]+);`, 'g');

const MAX_ID = 750;

// 布尔契约字段:json 侧历史用 1/0 表示,行为等价(!!x),不算漂移
const BOOL_KEYS = new Set(['noGravity', 'noTileCollide', 'friendly', 'townNPC', 'lavaImmune', 'behindTiles']);
const norm = (k, v) => (BOOL_KEYS.has(k) && typeof v === 'number' ? v !== 0 : v);

// ---- 音效语义解析(与 src/data/vanillaNpcs.ts vanillaSoundFiles 同源) ----
// 目的:'NPCHit1' ≡ 'NPC_Hit_1'(同 wav)、'NPC_Hit_53' ≠ 'DD2_DrakinHurt'(文件形 vs 声轨)
// ★C档可移植:自位置推导(原 join(ROOT,'game/src/...') 假定仓目录名=game)
const GAME_SRC = join(dirname(fileURLToPath(import.meta.url)), '..');
const tracksJson = JSON.parse(readFileSync(join(GAME_SRC, 'src/data/vanilla-soundtracks.json'), 'utf8'));
const vnSrc = readFileSync(join(GAME_SRC, 'src/data/vanillaNpcs.ts'), 'utf8');
const ALIASES = {};
{
  const m = vnSrc.match(/SOUND_NAME_ALIASES[^{]*\{([\s\S]*?)\}/);
  if (m) for (const am of m[1].matchAll(/(\w+):\s*'([^']+)'/g)) ALIASES[am[1]] = am[2];
}
function soundResolve(name) {
  if (name === null || name === undefined) return null;         // 显式静默
  if (typeof name !== 'string') return name;
  let m = name.match(/^(?:NPCHit|NPCKilled|NPCDeath)(\d+)$/);
  if (m) return name.startsWith('NPCHit') ? `NPC_Hit_${m[1]}` : `NPC_Killed_${m[1]}`;
  if (/^NPC_(?:Hit|Killed)_\d+$/.test(name)) return name;       // 文件形直通
  const track = ALIASES[name] || name.replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase();
  return tracksJson[track] ? `track:${track}` : `?unresolved:${name}`;
}

function methodBodyOf(cs, name) {
  const idx = cs.indexOf(name);
  if (idx < 0) throw new Error(`method not found: ${name}`);
  const start = cs.indexOf('{', idx);
  let depth = 0;
  for (let i = start; i < cs.length; i++) {
    if (cs[i] === '{') depth++;
    else if (cs[i] === '}') { depth--; if (depth === 0) return cs.slice(start + 1, i); }
  }
  throw new Error('unbalanced');
}

/** 条件 → 命中 id 列表(OR 列表/区间/单等;不认识的返 null 记入 unparsed) */
function condIds(cond) {
  const range = cond.match(/type\s*>=\s*(\d+)\s*&&\s*type\s*<=\s*(\d+)/);
  if (range) {
    const ids = [];
    for (let n = +range[1]; n <= +range[2]; n++) ids.push(n);
    return ids;
  }
  const eqs = [...cond.matchAll(/type\s*==\s*(\d+)/g)].map((m) => +m[1]);
  if (eqs.length) return eqs;
  return null;
}

/** 字面量 → json 标量;非字面量返回 undefined(计入 unparsedAssign 供人工核)。
 *  color 形态(★BJ106 扩面):new Color(r,g,b[, a]) [* Nf] → [r,g,b,a](FNA 逐通道舍入) */
function parseVal(raw) {
  const s = raw.trim();
  let m = s.match(/^SoundID\.(\w+)$/);
  if (m) return m[1];
  if (s === 'null') return null;
  if (s === 'true') return true;
  if (s === 'false') return false;
  m = s.match(/^-?\d+(?:\.\d+)?f?$/);
  if (m) return parseFloat(s.replace(/f$/, ''));
  m = s.match(/^new Color\((\d+),\s*(\d+),\s*(\d+)(?:,\s*(\d+))?\)(?:\s*\*\s*([\d.]+)f)?$/);
  if (m) {
    const rgba = [+m[1], +m[2], +m[3], m[4] !== undefined ? +m[4] : 255];
    if (m[5] !== undefined) {
      const sc = parseFloat(m[5]);
      for (let i = 0; i < 4; i++) rgba[i] = Math.min(255, Math.round(rgba[i] * sc));
    }
    return rgba;
  }
  return undefined;
}

/** 块内深度 0 赋值(KEYS 契约字段)。+=/-= 合并进 `+key`。 */
function scanAssignments(text) {
  const out = {};
  const unparsed = [];
  let depth = 0;
  const lines = [];
  let lineStart = 0;
  for (let i = 0; i <= text.length; i++) {
    const c = text[i] || '\n';
    if (c === '{') depth++;
    if (c === '}') depth--;
    if (c === '\n') { lines.push({ text: text.slice(lineStart, i), depth }); lineStart = i + 1; }
  }
  for (const { text: t, depth: d } of lines) {
    if (d !== 0) continue;
    KEY_RE.lastIndex = 0;
    let m;
    while ((m = KEY_RE.exec(t))) {
      const [, prop, op, raw] = m;
      if (prop === 'color' && /^default\(Color\)$/.test(raw.trim())) continue;   // :8554 头复位=缺省色
      const val = parseVal(raw);
      if (val === undefined) { unparsed.push(`${prop} ${op} ${raw.trim()}`); continue; }
      if (op === '=') out[prop] = val;
      else out[`+${prop}`] = (out[`+${prop}`] ?? 0) + (op === '+=' ? val : -val);
    }
  }
  return { out, unparsed };
}

/** 配平花括号切出 cond/if 后的块体,返回 {inner, end} */
function braceBlock(text, fromIdx) {
  const b = text.indexOf('{', fromIdx);
  if (b < 0) return null;
  let depth = 0;
  for (let i = b; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}') { depth--; if (depth === 0) return { inner: text.slice(b + 1, i), end: i }; }
  }
  return null;
}

/**
 * 递归解析一个块:公共(depth 0)赋值 + 嵌套 per-id 覆盖。
 * 嵌套形态:① (else )if (type…) {…}(305-314 族) ② switch (type) { case N: … }
 * 覆盖语义 = 顺序执行:公共先赋,嵌套后覆。
 */
function parseRegion(text, unparsedSink) {
  const { out, unparsed } = scanAssignments(text);
  unparsedSink.push(...unparsed);
  const perId = new Map();
  const mergeId = (id, rec) => {
    const cur = perId.get(id) ?? {};
    for (const [k, v] of Object.entries(rec)) {
      if (k.startsWith('+')) cur[k] = (cur[k] ?? 0) + v;
      else if (cur[k] === undefined) cur[k] = v; // 同级后写不覆前写(同 1456 顺序语义取保守)
    }
    perId.set(id, cur);
  };
  // ① 嵌套 if (type…) 块
  const condRe = /(else\s+)?if\s*\(([^)]*\btype\b[^)]*)\)\s*\n?\s*(?=\{)/g;
  let m;
  while ((m = condRe.exec(text))) {
    const ids = condIds(m[2]);
    const blk = braceBlock(text, m.index);
    if (!blk) break;
    condRe.lastIndex = blk.end;
    if (!ids) continue;
    const sub = parseRegion(blk.inner, unparsedSink);
    for (const id of ids) {
      mergeId(id, { ...sub.common, ...sub.perId.get(id) });
    }
  }
  // ② 嵌套 switch (type) { case N: … }
  const swRe = /switch\s*\(\s*type\s*\)\s*\n?\s*(?=\{)/g;
  while ((m = swRe.exec(text))) {
    const blk = braceBlock(text, m.index);
    if (!blk) break;
    swRe.lastIndex = blk.end;
    const caseRe = /case\s+(\d+)\s*:\s*\n?/g;
    let cm;
    while ((cm = caseRe.exec(blk.inner))) {
      const id = +cm[1];
      // 段体:到下一个 case/默认/break
      const rest = blk.inner.slice(caseRe.lastIndex);
      const stop = rest.search(/(?:^|\n)\s*(?:case\s+\d+\s*:|default:|break;)/);
      const seg = stop >= 0 ? rest.slice(0, stop) : rest;
      const sub = parseRegion(seg, unparsedSink);
      mergeId(id, { ...sub.common, ...sub.perId.get(id) });
    }
  }
  return { common: out, perId };
}

function parseBlock(text) {
  const unparsed = [];
  const { common, perId } = parseRegion(text, unparsed);
  return { out: common, perId, unparsed };
}

function parseTree(npcCsPath, mainCsPath) {
  const cs = readFileSync(join(ROOT, npcCsPath), 'utf8');
  const body = methodBodyOf(cs, 'public void SetDefaults(int Type');
  // 链上逐块:配平花括号切出块体
  const blocks = [];
  const condRe = /(else\s+)?if\s*\(([^)]*)\)\s*\n?\s*(?=\{)/g;
  let m;
  while ((m = condRe.exec(body))) {
    const cond = m[2];
    if (!/\btype\b/.test(cond)) { continue; }
    const braceIdx = body.indexOf('{', m.index);
    let depth = 0, end = -1;
    for (let i = braceIdx; i < body.length; i++) {
      if (body[i] === '{') depth++;
      else if (body[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
    }
    if (end < 0) break;
    blocks.push({ cond: cond.trim(), block: body.slice(braceIdx + 1, end) });
    condRe.lastIndex = end;
  }
  const unparsedConds = [];
  const results = {};
  const unparsedAssigns = [];
  for (const b of blocks) {
    const ids = condIds(b.cond);
    if (!ids) { unparsedConds.push(b.cond); continue; }
    const { out, perId, unparsed } = parseBlock(b.block);
    unparsedAssigns.push(...unparsed.map((u) => `${ids[0]}..${ids[ids.length - 1]}: ${u}`));
    if (!Object.keys(out).length && perId.size === 0) continue;
    for (const id of ids) {
      if (results[id] === undefined) results[id] = {}; // else-if:首个命中生效
      const r = results[id];
      const eff = { ...out, ...perId.get(id) };
      for (const [k, v] of Object.entries(eff)) {
        if (k.startsWith('+')) {
          if (r[k.slice(1)] !== undefined) r[k] = (r[k] ?? 0) + v;
        } else if (r[k] === undefined) r[k] = v;
      }
    }
  }
  // `+key` 累积归并:final = base + 增量(524-527 switch-case 增量族)
  for (const rec of Object.values(results)) {
    for (const k of Object.keys(rec)) {
      if (k.startsWith('+')) {
        const base = k.slice(1);
        if (rec[base] !== undefined) rec[base] = rec[base] + rec[k];
        delete rec[k];
      }
    }
  }
  // frames(Main.cs npcFrameCount)
  const mainCs = readFileSync(join(ROOT, mainCsPath), 'utf8');
  const fcMatch = mainCs.match(/npcFrameCount = new int\[\d+\]\s*\{([\s\S]*?)\n\s*\};/);
  const frames = fcMatch[1].replace(/\/\/[^\n]*/g, '').split(',').map((s) => parseInt(s.trim(), 10)).filter((n) => !Number.isNaN(n));
  return { results, frames, unparsedConds, unparsedAssigns, blockCount: blocks.length };
}

// ---- 对账主体(库模式可导入;CLI 直跑打印+--fix) ----
export function recon() {
  const a56 = parseTree('Terarria1456/Terraria/NPC.cs', 'Terarria1456/Terraria/Main.cs');
  const a57 = parseTree('Terarria1457/Terraria/NPC.cs', 'Terarria1457/Terraria/Main.cs');
  const json = JSON.parse(readFileSync(join(ROOT, 'game/public/sprites/vanilla-npcs.json'), 'utf8'));
  const coverage = {
    blocks56: a56.blockCount, blocks57: a57.blockCount,
    ids56: Object.keys(a56.results).filter((k) => Object.keys(a56.results[k]).length).length,
    jsonEntries: Object.keys(json).length,
    frames: a56.frames.length,
    unparsedConds: a56.unparsedConds.length + a57.unparsedConds.length,
    unparsedAssigns: a56.unparsedAssigns.length + a57.unparsedAssigns.length,
  };
  const idsWith = (t) => Object.keys(t.results).filter((k) => Object.keys(t.results[k]).length).map(Number);

  const classA = [];   // json 对 1456 漂移(含缺失)
  const classA3 = [];  // json 独有字段(手补/提取盲区——仅审阅)
  const classB = [];   // 1456→1457 变更
  const fixes = [];    // --fix 载荷:[id, key, value]
  const numEq = (a, b) => typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) < 1e-6;
  const allIds = new Set([...idsWith(a56), ...idsWith(a57), ...Object.keys(json).map(Number)]);
  for (const id of [...allIds].sort((a, b) => a - b)) {
    const j = json[id] ?? null;
    const r56 = a56.results[id] ?? null;
    const r57 = a57.results[id] ?? null;
    // CLASS B:1456 vs 1457(键并集;含 frames)。★BJ106 扩面:color 为数组值,逐通道全等
    const sameVal = (a, b) => a === b
      || (Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => x === b[i]));
    const bkeys = new Set([...Object.keys(r56 ?? {}), ...Object.keys(r57 ?? {})]);
    for (const k of bkeys) {
      const v56 = r56?.[k], v57 = r57?.[k];
      if (!sameVal(v56, v57)) classB.push(`[${id}] ${k}: 1456=${JSON.stringify(v56)} → 1457=${JSON.stringify(v57)}`);
    }
    if ((a56.frames[id] ?? null) !== (a57.frames[id] ?? null)) {
      classB.push(`[${id}] frames: 1456=${a56.frames[id] ?? '无'} → 1457=${a57.frames[id] ?? '无'}`);
    }
    if (!r56 || !j) continue;
    // CLASS A:json vs 1456(仅 1456 提取面内的键)
    const isSound = (k) => k === 'HitSound' || k === 'DeathSound';
    for (const k of Object.keys(r56)) {
      const v56 = r56[k], vj = j[k];
      if (vj === undefined) {
        classA.push(`[${id}] ${k}: json缺 → 1456=${JSON.stringify(v56)}`);
        fixes.push([id, k, v56]);
        continue;
      }
      const eq = isSound(k)
        ? soundResolve(vj) === soundResolve(v56)
        : sameVal(vj, v56) || numEq(vj, v56) || norm(k, vj) === norm(k, v56);
      if (!eq) {
        classA.push(`[${id}] ${k}: json=${JSON.stringify(vj)} → 1456=${JSON.stringify(v56)}`);
        fixes.push([id, k, v56]);
      }
    }
    for (const k of Object.keys(j)) {
      if (KEYS.includes(k) && r56[k] === undefined && !(k in (r56 ?? {}))) classA3.push(`[${id}] ${k}: json独有=${JSON.stringify(j[k])}`);
    }
  }

  return { classA, classA3, classB, fixes, coverage, results56: a56.results, frames: a56.frames };
}

function main() {
  const { classA, classA3, classB, fixes, coverage } = recon();
  console.log(`== 覆盖 == 1456 blocks=${coverage.blocks56} ids=${coverage.ids56} frames=${coverage.frames} / json=${coverage.jsonEntries} / 未解析条件${coverage.unparsedConds} 非字面量${coverage.unparsedAssigns}`);
  console.log(`\n== CLASS A: json→1456 漂移 ${classA.length} 条 ==`);
  for (const l of classA) console.log(l);
  console.log(`\n== CLASS A3: json 独有字段(手补/盲区,仅审阅) ${classA3.length} 条 ==`);
  for (const l of classA3.slice(0, 60)) console.log(l);
  if (classA3.length > 60) console.log(`… +${classA3.length - 60} more`);
  console.log(`\n== CLASS B: 1456→1457 变更 ${classB.length} 条(移植确认清单) ==`);
  for (const l of classB) console.log(l);
  // ---- --fix:应用 A 类修正(浮点尾差取 6 位小数;写前备份) ----
  if (process.argv.includes('--fix')) {
    const JSON_PATH = join(ROOT, 'game/public/sprites/vanilla-npcs.json');
    mkdirSync('/tmp/recon', { recursive: true });   // ★债刀 2026-09-17:目录缺在时 --fix 曾 ENOENT 崩(修复通道地雷)
    copyFileSync(JSON_PATH, '/tmp/recon/vanilla-npcs.json.bak');
    const json = JSON.parse(readFileSync(JSON_PATH, 'utf8'));
    for (const [id, k, raw] of fixes) {
      const v = typeof raw === 'number' && !Number.isInteger(raw)
        ? Math.round(raw * 1e6) / 1e6 : raw;
      json[id][k] = v;
    }
    writeFileSync(JSON_PATH, JSON.stringify(json));
    console.log(`\n== FIX: 已应用 ${fixes.length} 条修正 → vanilla-npcs.json(备份 /tmp/recon/vanilla-npcs.json.bak)==`);
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();

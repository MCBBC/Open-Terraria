// 从 Terarria1457 提取原版小动物（NPCID.Sets.CountsAsCritter 名单；★BJ183 2026-09-20
// 基准对齐 1456→1457——CountsAsCritter 表两版全等,合入 vanilla-npcs.json 对拍零漂移）：
//
// ★BJ207 写盘守卫（2026-09-20，era guard 家族/BJ191 处方——preflight 事故防再犯闸）：
//   本工具读真实现库 game/public/sprites/vanilla-npcs.json 并【原地合入】——裸跑一次
//   就是写库（preflight 对拍曾裸跑洗库一次,三方字节全等零漂移纯属侥幸,机械闸此前缺位）。
//   处置 fail-closed：缺省=【干跑对拍】（零写盘,合入产物 vs 输入基线逐字节对拍——零漂移
//   exit 0 / 漂移 exit 1+物证）。写盘两通道且都必须显式：SW_OUT=<dir>（沙箱,写
//   <dir>/vanilla-npcs.json）或 --write-real（逃生门,写真实现库=正常合入流）。探测注入面
//   SW_NPCS_JSON（输入基线重定向,守卫测试用,与 extract-npcs.mjs 同名同域）与 --write-real
//   混用而 SW_OUT 缺省=读夹具写真库（探测与写盘分离,g1 footgun 洗库面）→ 拒 exit 1。
//   SW_OUT 与 --write-real 同给：SW_OUT 优先（沙箱最安全,提示即走）。守卫测试：
//   tests/extract-npcs-era-guard.test.ts（BJ207 段）。
//  - NPCID.cs 的 CountsAsCritter Factory.CreateBoolSet(...) id 列表
//  - NPC.cs SetDefaults if-else 区间链解析（同 extract-npcs.mjs v3 逻辑）补属性
//  - Main.cs npcFrameCount 帧数
// 合并进 public/sprites/vanilla-npcs.json：已有 id 更新 friendly/critter 标志，缺的补条目
import { readFileSync, writeFileSync } from 'node:fs';

const ROOT = process.env.SW_PROJECT_ROOT ?? new URL('../../', import.meta.url).pathname.replace(/\/+$/, '');   // ★C档可移植:game/ 父目录(反编译树/TEdit/Calamity 源所在)
const npcId = readFileSync(`${ROOT}/Terarria1457/Terraria.ID/NPCID.cs`, 'utf8');
const npcCs = readFileSync(`${ROOT}/Terarria1457/Terraria/NPC.cs`, 'utf8');
const mainCs = readFileSync(`${ROOT}/Terarria1457/Terraria/Main.cs`, 'utf8');

// 1) CountsAsCritter 名单
const setMatch = npcId.match(/CountsAsCritter = Factory\.CreateBoolSet\(([\d,\s]*)\)/);
if (!setMatch) throw new Error('CountsAsCritter not found');
const critterIds = setMatch[1].split(',').map((s) => parseInt(s.trim(), 10)).filter((n) => !Number.isNaN(n));
console.log('critter ids:', critterIds.length);

// 2) npcFrameCount（1.4.5.6）
const fcMatch = mainCs.match(/npcFrameCount = new int\[\d+\]\s*\{([\s\S]*?)\n\s*\};/);
const frameCount = fcMatch[1].replace(/\/\/[^\n]*/g, '').split(',').map((s) => parseInt(s.trim(), 10)).filter((n) => !Number.isNaN(n));

// 3) SetDefaults if-else 链（与 extract-npcs 相同手法）
const sdStart = npcCs.indexOf('public void SetDefaults(int Type');
const sdEnd = npcCs.indexOf('\n\tpublic ', sdStart + 100);
// 只去注释、不压平换行：parseBlock 按行 ^ 锚点匹配，压平后每块只剩第一个赋值被捕获
// （曾致 64 条小动物缺 height/aiStyle/defense——bunny 只有 width 没有 height=20）
const body = npcCs.slice(sdStart, sdEnd < 0 ? undefined : sdEnd).replace(/\/\/[^\n]*/g, '');
const chainStart = body.indexOf('if (aiStyle');
const chainStart2 = body.indexOf('if (type');
const chain = body.slice(chainStart2 >= 0 && (chainStart < 0 || chainStart2 < chainStart) ? chainStart2 : chainStart);

const condRe = /(else\s+)?if\s*\(([^()]*(?:\([^()]*\)[^()]*)*)\)\s*(?=\{)/g;
const blocks = [];
let m;
while ((m = condRe.exec(chain))) {
  const braceIdx = chain.indexOf('{', m.index);
  let depth = 0, end = -1;
  for (let i = braceIdx; i < chain.length; i++) {
    if (chain[i] === '{') depth++;
    else if (chain[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
  }
  if (end < 0) break;
  const cond = m[2];
  if (!cond.includes('type') && !cond.includes('Type')) { condRe.lastIndex = braceIdx; continue; }
  blocks.push({ cond, block: chain.slice(braceIdx + 1, end) });
  condRe.lastIndex = end;
}

const matchIds = (cond) => {
  const ids = [];
  for (const t of cond.matchAll(/\btype\s*==\s*(\d+)/g)) ids.push([+t[1], +t[1]]);
  for (const t of cond.matchAll(/\btype\s*>=\s*(\d+)\s*&&\s*type\s*<=\s*(\d+)/g)) ids.push([+t[1], +t[2]]);
  return ids;
};
const parseBlock = (text) => {
  const out = {};
  let depth = 0;
  for (const line of text.split('\n')) {
    const opens = (line.match(/\{/g) || []).length;
    const closes = (line.match(/\}/g) || []).length;
    const atTop = depth === 0;
    depth += opens - closes;
    const am = line.match(/^\s*(\w+)\s*(\+=|-=|=)\s*([^;]+);/);
    if (am && atTop) {
      const [, prop, op, raw] = am;
      const v = raw.trim();
      let val;
      if (/^-?\d+(?:\.\d+)?f?$/.test(v)) val = parseFloat(v.replace(/f$/, ''));
      else if (v === 'true' || v === 'false') val = v === 'true';
      else if (/^SoundID\.(\w+)$/.test(v)) val = v.match(/^SoundID\.(\w+)$/)[1];
      else continue;
      if (op === '=') out[prop] = val;
      else out[`+${prop}`] = (out[`+${prop}`] ?? 0) + (op === '+=' ? val : -val);
    }
  }
  return out;
};

const results = {};
for (const b of blocks) {
  for (const [lo, hi] of matchIds(b.cond)) {
    for (let id = lo; id <= hi; id++) {
      const parsed = parseBlock(b.block, id);
      if (parsed.lifeMax !== undefined || parsed.width !== undefined || parsed.aiStyle !== undefined) {
        results[id] = parsed;
      }
    }
  }
}
console.log('SetDefaults resolved ids:', Object.keys(results).length);

// 4) 名字
const bestiary = JSON.parse(readFileSync(`${ROOT}/Terraria-Map-Editor/src/TEdit.Terraria/Data/bestiaryNpcs.json`, 'utf8'));
const names = {};
for (const e of bestiary.npcData) if (typeof e.id === 'number' && e.id >= 1) names[e.id] = e.fullName ?? e.name;

// 5) 合并进 vanilla-npcs.json
// ★BJ207：输入基线路径（SW_NPCS_JSON 注入重定向,守卫测试用;缺省=真实现库）
const LIVE_OUT = `${ROOT}/game/public/sprites/vanilla-npcs.json`;
const IN_PATH = process.env.SW_NPCS_JSON ?? LIVE_OUT;
const out = JSON.parse(readFileSync(IN_PATH, 'utf8'));
const KEYS = ['lifeMax', 'damage', 'defense', 'knockBackResist', 'aiStyle', 'width', 'height',
  'npcSlots', 'noGravity', 'noTileCollide', 'friendly', 'HitSound', 'DeathSound', 'scale', 'alpha'];
let added = 0, updated = 0;
for (const id of critterIds) {
  const r = results[id] ?? {};
  const e = out[String(id)] ?? { id, name: names[id] ?? `NPC_${id}`, frames: frameCount[id] ?? 1 };
  e.frames = frameCount[id] ?? e.frames ?? 1;
  e.critter = true;
  for (const k of KEYS) {
    if (r[k] !== undefined) e[k] = r[k];
    if (r[`+${k}`] !== undefined) e[k] = (e[k] ?? 0) + r[`+${k}`];
  }
  // 小动物默认值（无数据时兜底）
  if (e.lifeMax === undefined) e.lifeMax = 5;
  if (e.damage === undefined) e.damage = 0;
  if (e.aiStyle === undefined) e.aiStyle = r.aiStyle ?? 0;
  if (out[String(id)]) updated++; else added++;
  out[String(id)] = e;
}
// ---------- ★BJ207 写盘守卫（头注见上）:缺省干跑零写盘,写盘须显式 SW_OUT/--write-real ----------
const WRITE_REAL = process.argv.includes('--write-real');
const OUT_PATH = process.env.SW_OUT ? `${process.env.SW_OUT}/vanilla-npcs.json` : null;
if (WRITE_REAL && process.env.SW_NPCS_JSON !== undefined && !OUT_PATH) {
  console.error('[extract-critters] 拒绝运行：探测注入面（SW_NPCS_JSON）已设置而 --write-real 将写真实现库（fail-closed）。');
  console.error('  合入基线读注入夹具、写盘却落真实现库 game/public/sprites/vanilla-npcs.json——探测与写盘分离=守卫被绕过（footgun 洗库面）。');
  console.error('  处置：显式 SW_OUT 指向与探测一致的沙箱目录（写沙箱），或清掉 SW_NPCS_JSON 走真实现库合入。');
  process.exit(1);
}
const freshNpcs = JSON.stringify(out);
if (!OUT_PATH && !WRITE_REAL) {
  const cur = readFileSync(IN_PATH, 'utf8');
  if (cur === freshNpcs) {
    console.error('[extract-critters] 干跑对拍：合入产物与现库逐字节零漂移（零写盘）。写盘须显式 SW_OUT=<dir> 或 --write-real。');
  } else {
    let prev = {};
    try { prev = JSON.parse(cur); } catch { /* 坏损:键物证落空,整文件漂移成立 */ }
    const changed = [...new Set([...Object.keys(prev), ...Object.keys(out)])]
      .filter((k) => JSON.stringify(prev[k]) !== JSON.stringify(out[k]));
    console.error(`[extract-critters] 干跑对拍：漂移 ${changed.length} 键（${changed.slice(0, 6).join(', ')}${changed.length > 6 ? '…' : ''}）——零写盘。`);
    console.error('  合入落盘须显式通道：SW_OUT=<dir>（沙箱）或 --write-real（真实现库）。');
    process.exit(1);
  }
} else {
  if (OUT_PATH && WRITE_REAL) console.error('[extract-critters] SW_OUT 与 --write-real 同给：SW_OUT 优先（沙箱）。');
  writeFileSync(OUT_PATH ?? LIVE_OUT, freshNpcs);
  console.error(`[extract-critters] 已写盘 ${OUT_PATH ?? LIVE_OUT}（${OUT_PATH ? 'SW_OUT 沙箱' : '--write-real 真实现库'}）`);
}
console.log(`added=${added} updated=${updated}`);
for (const id of [46, 74, 299, 300, 303, 357, 377]) console.log(id, JSON.stringify(out[String(id)]).slice(0, 180));

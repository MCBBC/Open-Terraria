// 从 Terarria1457 提取原版小动物（NPCID.Sets.CountsAsCritter 名单；★BJ183 2026-09-20
// 基准对齐 1456→1457——CountsAsCritter 表两版全等,合入 vanilla-npcs.json 对拍零漂移）：
//  - NPCID.cs 的 CountsAsCritter Factory.CreateBoolSet(...) id 列表
//  - NPC.cs SetDefaults if-else 区间链解析（同 extract-npcs.mjs v3 逻辑）补属性
//  - Main.cs npcFrameCount 帧数
// 合并进 public/sprites/vanilla-npcs.json：已有 id 更新 friendly/critter 标志，缺的补条目
import { readFileSync, writeFileSync } from 'node:fs';

const ROOT = '/Users/vinlic/Project/GLM/SandboxWorld';
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
const out = JSON.parse(readFileSync(`${ROOT}/game/public/sprites/vanilla-npcs.json`, 'utf8'));
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
writeFileSync(`${ROOT}/game/public/sprites/vanilla-npcs.json`, JSON.stringify(out));
console.log(`added=${added} updated=${updated}`);
for (const id of [46, 74, 299, 300, 303, 357, 377]) console.log(id, JSON.stringify(out[String(id)]).slice(0, 180));

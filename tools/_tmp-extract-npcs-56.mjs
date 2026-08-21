// 从 Terarria1405 反编译源码提取全量 NPC 属性。
// SetDefaults 反编译为 if/else-if 的 type 区间链（非 switch）：
//   if (this.type == N) {...} else if (this.type >= A && this.type <= B) {...} ...
// 每个 id 取链上首个命中的块（else-if 语义：命中后续块跳过）。
// 块内取深度1的 this.prop 赋值；块内嵌套小 switch 的 case {id} += 增量也并入。
// 另提取 Main.cs npcFrameCount[663]、TEdit bestiary 名字表。
// 输出 public/sprites/vanilla-npcs.json
import { readFileSync, writeFileSync } from 'node:fs';

const ROOT = '/Users/vinlic/Project/GLM/SandboxWorld';
const npcCs = readFileSync(`${ROOT}/Terarria1456/Terraria/NPC.cs`, 'utf8');
const mainCs = readFileSync(`${ROOT}/Terarria1456/Terraria/Main.cs`, 'utf8');

// ---------- 1) npcFrameCount ----------
const fcMatch = mainCs.match(/npcFrameCount = new int\[\d+\]\s*\{([\s\S]*?)\n\s*\};/);
const frameCount = fcMatch[1].replace(/\/\/[^\n]*/g, '').split(',').map((s) => parseInt(s.trim(), 10)).filter((n) => !Number.isNaN(n));
console.log('npcFrameCount:', frameCount.length);

// ---------- 2) SetDefaults if/else-if 链 ----------
const sdStart = npcCs.indexOf('public void SetDefaults(int Type');
const sdEnd = npcCs.indexOf('\n    public ', sdStart + 100);
const body = npcCs.slice(sdStart, sdEnd);
const chainStart = body.indexOf('if (this.type');
const chain = body.slice(chainStart);

// 拆出每个 条件→块。匹配 (else )if (cond)\n { ... }（配平花括号）
const blocks = [];
const condRe = /(else\s+)?if\s*\(([^)]*)\)\s*\n?\s*(?=\{)/g;
let m;
while ((m = condRe.exec(chain))) {
  const braceIdx = chain.indexOf('{', m.index);
  // 配平
  let depth = 0, end = -1;
  for (let i = braceIdx; i < chain.length; i++) {
    if (chain[i] === '{') depth++;
    else if (chain[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
  }
  if (end < 0) break;
  const cond = m[2];
  if (!cond.includes('this.type')) { condRe.lastIndex = braceIdx; continue; }
  blocks.push({ cond, block: chain.slice(braceIdx + 1, end) });
  condRe.lastIndex = end;
}
console.log('type 条件块:', blocks.length);

// 条件 → id 判定函数
const matchIds = (cond) => {
  const mm = [];
  const eq = cond.match(/this\.type\s*==\s*(\d+)/);
  if (eq) { const n = parseInt(eq[1], 10); return [n, n]; }
  const rng = cond.match(/this\.type\s*>=\s*(\d+)\s*&&\s*this\.type\s*<=\s*(\d+)/);
  if (rng) return [parseInt(rng[1], 10), parseInt(rng[2], 10)];
  const rng2 = cond.match(/this\.type\s*<=\s*(\d+)\s*&&\s*this\.type\s*>=\s*(\d+)/);
  if (rng2) return [parseInt(rng2[2], 10), parseInt(rng2[1], 10)];
  const ge = cond.match(/this\.type\s*>=\s*(\d+)/);
  if (ge) return [parseInt(ge[1], 10), Infinity];
  const le = cond.match(/this\.type\s*<=\s*(\d+)/);
  if (le) return [-Infinity, parseInt(le[1], 10)];
  return null;
};

// 赋值解析：深度1 语句；值支持 数字/true/false/SoundID.XXX；+= 增量
const parseBlock = (blockText, exactId) => {
  const out = {};
  // 按行扫描，跟踪深度
  let depth = 0;
  const lines = blockText.split('\n');
  const reAssign = /^\s*(?:el)?se?\s*$|^\s*this\.(\w+)\s*(=|\+=|-=)\s*([^;]+);/;
  for (const line of lines) {
    const opens = (line.match(/\{/g) || []).length;
    const closes = (line.match(/\}/g) || []).length;
    const atTop = depth === 0;
    depth += opens - closes;
    const am = line.match(/^\s*this\.(\w+)\s*(\+=|-=|=)\s*([^;]+);/);
    if (am && atTop) {
      const [, prop, op, raw] = am;
      const v = raw.trim();
      let val;
      if (/^-?\d+(?:\.\d+)?f?$/.test(v)) val = parseFloat(v.replace(/f$/, ''));
      else if (v === 'true' || v === 'false') val = v === 'true';
      else if (/^SoundID\.(\w+)$/.test(v)) val = v.match(/^SoundID\.(\w+)$/)[1];
      else continue;
      if (op === '=') out[prop] = val;
      else if (op === '+=') out[`+${prop}`] = (out[`+${prop}`] ?? 0) + val;
      else if (op === '-=') out[`+${prop}`] = (out[`+${prop}`] ?? 0) - val;
    }
  }
  if (exactId != null) {
    // 块内嵌套 switch 的 case {exactId}: ... break; 的增量
    const caseRe = new RegExp(`case ${exactId}:([\\s\\S]*?)(?:break;|case \\d+:)`, 'g');
    let cm;
    while ((cm = caseRe.exec(blockText))) {
      const am2 = cm[1].matchAll(/this\.(\w+)\s*(\+=|-=)\s*([^;]+);/g);
      for (const a of am2) {
        const num = parseFloat(a[3].replace(/f$/, ''));
        out[`+${a[1]}`] = (out[`+${a[1]}`] ?? 0) + (a[2] === '+=' ? num : -num);
      }
    }
  }
  return out;
};

// ---------- 3) 逐 id 求值 ----------
const MAX_ID = 700; // 1.4.0.5 最大 npc id
const results = {};
for (let id = 1; id <= MAX_ID; id++) {
  for (const b of blocks) {
    const rng = matchIds(b.cond);
    if (!rng) continue;
    const [lo, hi] = rng;
    if (id >= lo && id <= hi) {
      const parsed = parseBlock(b.block, hi - lo === 0 ? id : (lo === hi ? id : null));
      results[id] = parsed;
      break; // else-if：命中后跳过剩余
    }
  }
}
console.log('求值到属性的 id 数:', Object.values(results).filter((r) => Object.keys(r).length).length, '/', MAX_ID);

// ---------- 4) 名字 + 输出 ----------
const bestiary = JSON.parse(readFileSync(`${ROOT}/Terraria-Map-Editor/src/TEdit.Terraria/Data/bestiaryNpcs.json`, 'utf8'));
const names = {};
for (const e of bestiary.npcData) if (typeof e.id === 'number' && e.id >= 1) names[e.id] = e.fullName ?? e.name;

const KEYS = ['lifeMax', 'damage', 'defense', 'knockBackResist', 'aiStyle', 'width', 'height',
  'npcSlots', 'noGravity', 'noTileCollide', 'friendly', 'townNPC', 'HitSound', 'DeathSound',
  'scale', 'alpha', 'catchItem', 'lavaImmune', 'behindTiles'];
const out = {};
for (let id = 1; id <= MAX_ID; id++) {
  const r = results[id] ?? {};
  const e = { id, name: names[id] ?? `NPC_${id}`, frames: frameCount[id] ?? 1 };
  let any = false;
  for (const k of KEYS) {
    if (r[k] !== undefined) { e[k] = r[k]; any = true; }
    if (r[`+${k}`] !== undefined) { e[k] = (e[k] ?? 0) + r[`+${k}`]; any = true; }
  }
  if (any) out[id] = e;
}
writeFileSync(`/tmp/recon/a56/vanilla-npcs.json`, JSON.stringify(out));
console.log('written vanilla-npcs.json:', Object.keys(out).length, 'npcs');
for (const id of [1, 3, 16, 25, 49, 111, 113, 525]) console.log(id, JSON.stringify(out[id]));

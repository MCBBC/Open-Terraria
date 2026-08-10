// 从 Terarria1456 NPC.cs 提取每类型 SetDefaults 的 color/alpha，合入 vanilla-npcs.json；
// 另解析 SetDefaultsFromNetId 的负 netID 覆盖（color/alpha/scale）打印对照表。
// 源码事实：color != default 时 Main.DrawNPC 用 NPC.GetColor 二次绘制同贴图（逐像素乘法，
// 贴轮廓非方形）；gel（item 23）掉落时 type 1 且 netID∉{-1,-2,-5,-6} 继承 npc.color。
import { readFileSync, writeFileSync } from 'node:fs';

const ROOT = '/Users/vinlic/Project/GLM/SandboxWorld';
const npcCs = readFileSync(`${ROOT}/Terarria1456/Terraria/NPC.cs`, 'utf8');

// ---------- 1) SetDefaults else-if 链 ----------
const sdStart = npcCs.indexOf('public void SetDefaults(int Type');
const chainStart = npcCs.indexOf('if (type == ', sdStart);
const blocks = [];
const condRe = /(else\s+)?if\s*\(([^)]*)\)\s*\n?\s*(?=\{)/g;
let m;
let cursor = chainStart;
condRe.lastIndex = chainStart;
while ((m = condRe.exec(npcCs))) {
  if (m.index < cursor) continue;
  const braceIdx = npcCs.indexOf('{', m.index);
  let depth = 0, end = -1;
  for (let i = braceIdx; i < npcCs.length; i++) {
    if (npcCs[i] === '{') depth++;
    else if (npcCs[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
  }
  if (end < 0) break;
  const cond = m[2];
  condRe.lastIndex = end;
  cursor = end;
  if (!/\btype\b/.test(cond)) continue;
  blocks.push({ cond, block: npcCs.slice(braceIdx + 1, end) });
}
console.error('type 条件块:', blocks.length);

// 条件 → 命中 id 列表（else-if 语义：先到先得）
const matchIds = (cond) => {
  const ids = [];
  const ors = cond.split('||').map((s) => s.trim());
  for (const part of ors) {
    const eq = part.match(/type\s*==\s*(\d+)/);
    if (eq) { ids.push([+eq[1], +eq[1]]); continue; }
    const rng = part.match(/type\s*>=\s*(\d+)\s*&&\s*type\s*<=\s*(\d+)/);
    if (rng) { ids.push([+rng[1], +rng[2]]); continue; }
    const ge = part.match(/type\s*>=\s*(\d+)/);
    if (ge) { ids.push([+ge[1], Infinity]); continue; }
    const le = part.match(/type\s*<=\s*(\d+)/);
    if (le) { ids.push([-Infinity, +le[1]]); continue; }
    return null;
  }
  return ids;
};

// 块内深度 1 的赋值（block 为 if 块内部，直接语句 depth=0，嵌套 { 升层）
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

const data = JSON.parse(readFileSync(`${ROOT}/game/public/sprites/vanilla-npcs.json`, 'utf8'));
const byId = new Map();
for (const entry of Object.values(data)) byId.set(entry.id, entry);
let colorCount = 0, alphaCount = 0, slotsCount = 0;
for (const { cond, block } of blocks) {
  const ranges = matchIds(cond);
  if (!ranges) continue;
  const lines = depth1Lines(block);
  const colorLine = lines.find((l) => /^color = new Color\(/.test(l));
  const alphaLine = lines.find((l) => /^alpha = \d+;/.test(l));
  const slotsLine = lines.find((l) => /^npcSlots = [\d.]+f;/.test(l));
  if (!colorLine && !alphaLine && !slotsLine) continue;
  let color = null;
  if (colorLine) {
    const nums = [...colorLine.matchAll(/(\d+)/g)].map((x) => +x[1]);
    const mul = colorLine.match(/\*\s*([\d.]+)f?/);
    const f = mul ? +mul[1] : 1;
    color = [nums[0], nums[1], nums[2], nums[3] ?? 255].map((v) => Math.round(v * f));
  }
  const alpha = alphaLine ? +alphaLine.match(/(\d+)/)[1] : null;
  const slots = slotsLine ? parseFloat(slotsLine.match(/[\d.]+/)[0]) : null;
  for (const [lo, hi] of ranges) {
    for (let id = Math.max(0, lo); id <= Math.min(700, hi); id++) {
      const entry = byId.get(id);
      if (!entry) continue;
      if (color) { entry.color = color; colorCount++; }
      if (alpha != null) { entry.alpha = alpha; alphaCount++; }
      if (slots != null) { entry.npcSlots = slots; slotsCount++; }
    }
  }
}
writeFileSync(`${ROOT}/game/public/sprites/vanilla-npcs.json`, JSON.stringify(data));
console.error(`color ${colorCount} 项 / alpha ${alphaCount} 项 / npcSlots ${slotsCount} 项`);

// ---------- 2) SetDefaultsFromNetId 负 netID 覆盖 ----------
const ndStart = npcCs.indexOf('private void SetDefaultsFromNetId(int id');
const ndEnd = npcCs.indexOf('\n\tprivate void', ndStart + 100);
const nd = npcCs.slice(ndStart, ndEnd < 0 ? undefined : ndEnd);
const cases = nd.split(/case (-\d+):/).slice(1);
const netTable = {};
for (let i = 0; i < cases.length; i += 2) {
  const id = +cases[i];
  const body = cases[i + 1];
  const colorLine = body.match(/color = new Color\(([^)]+)\)/);
  const alphaLine = body.match(/alpha = (\d+);/);
  const scaleLine = body.match(/SetDefaults_ForNetId\(num, spawnparams, ([\d.]+)f?\)/);
  netTable[id] = {
    ...(scaleLine ? { scale: +scaleLine[1] } : {}),
    ...(colorLine ? { color: colorLine[1].split(',').map((s) => +s.trim()) } : {}),
    ...(alphaLine ? { alpha: +alphaLine[1] } : {}),
  };
}
console.log('NETID_TABLE =', JSON.stringify(netTable, null, 1));

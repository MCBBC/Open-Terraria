// 从 Terarria1457 NPC.cs 提取每类型 SetDefaults 的 color/alpha，合入 vanilla-npcs.json；
// （★BJ183 2026-09-20 基准对齐 1456→1457——color/alpha/npcSlots 三轴对拍零漂移）
// 另解析 SetDefaultsFromNetId 的负 netID 覆盖（color/alpha/scale）打印对照表。
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
// 源码事实：color != default 时 Main.DrawNPC 用 NPC.GetColor 二次绘制同贴图（逐像素乘法，
// 贴轮廓非方形）；gel（item 23）掉落时 type 1 且 netID∉{-1,-2,-5,-6} 继承 npc.color。
import { readFileSync, writeFileSync } from 'node:fs';

const ROOT = process.env.SW_PROJECT_ROOT ?? new URL('../../', import.meta.url).pathname.replace(/\/+$/, '');   // ★C档可移植:game/ 父目录(反编译树/TEdit/Calamity 源所在)
const npcCs = readFileSync(`${ROOT}/Terarria1457/Terraria/NPC.cs`, 'utf8');

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

// ★BJ207：输入基线路径（SW_NPCS_JSON 注入重定向,守卫测试用;缺省=真实现库）
const LIVE_OUT = `${ROOT}/game/public/sprites/vanilla-npcs.json`;
const IN_PATH = process.env.SW_NPCS_JSON ?? LIVE_OUT;
const data = JSON.parse(readFileSync(IN_PATH, 'utf8'));
const byId = new Map();
for (const entry of Object.values(data)) byId.set(entry.id, entry);
let colorCount = 0, alphaCount = 0, slotsCount = 0;
for (const { cond, block } of blocks) {
  const ranges = matchIds(cond);
  if (!ranges) continue;
  const lines = depth1Lines(block);
  // ★BJ207（2026-09-20,干跑对拍定谳）：取【末个】赋值=顺序覆盖终值语义（523 实证：
  //   1457/1456 块内 `alpha = 0;` 后再 `alpha = 255;`,终值 255——旧 find 取首个产 0,
  //   干跑对拍漂移 1 键;与 extract-itemrare「顶层赋值序列最后一个生效」同族判例）。
  const colorLine = lines.findLast((l) => /^color = new Color\(/.test(l));
  const alphaLine = lines.findLast((l) => /^alpha = \d+;/.test(l));
  const slotsLine = lines.findLast((l) => /^npcSlots = [\d.]+f;/.test(l));
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
// ---------- ★BJ207 写盘守卫（头注见上）:缺省干跑零写盘,写盘须显式 SW_OUT/--write-real ----------
const WRITE_REAL = process.argv.includes('--write-real');
const OUT_PATH = process.env.SW_OUT ? `${process.env.SW_OUT}/vanilla-npcs.json` : null;
if (WRITE_REAL && process.env.SW_NPCS_JSON !== undefined && !OUT_PATH) {
  console.error('[extract-npccolors] 拒绝运行：探测注入面（SW_NPCS_JSON）已设置而 --write-real 将写真实现库（fail-closed）。');
  console.error('  合入基线读注入夹具、写盘却落真实现库 game/public/sprites/vanilla-npcs.json——探测与写盘分离=守卫被绕过（footgun 洗库面）。');
  console.error('  处置：显式 SW_OUT 指向与探测一致的沙箱目录（写沙箱），或清掉 SW_NPCS_JSON 走真实现库合入。');
  process.exit(1);
}
const freshNpcs = JSON.stringify(data);
if (!OUT_PATH && !WRITE_REAL) {
  const cur = readFileSync(IN_PATH, 'utf8');
  if (cur === freshNpcs) {
    console.error('[extract-npccolors] 干跑对拍：合入产物与现库逐字节零漂移（零写盘）。写盘须显式 SW_OUT=<dir> 或 --write-real。');
  } else {
    let prev = {};
    try { prev = JSON.parse(cur); } catch { /* 坏损:键物证落空,整文件漂移成立 */ }
    const changed = [...new Set([...Object.keys(prev), ...Object.keys(data)])]
      .filter((k) => JSON.stringify(prev[k]) !== JSON.stringify(data[k]));
    console.error(`[extract-npccolors] 干跑对拍：漂移 ${changed.length} 键（${changed.slice(0, 6).join(', ')}${changed.length > 6 ? '…' : ''}）——零写盘。`);
    console.error('  合入落盘须显式通道：SW_OUT=<dir>（沙箱）或 --write-real（真实现库）。');
    process.exit(1);
  }
} else {
  if (OUT_PATH && WRITE_REAL) console.error('[extract-npccolors] SW_OUT 与 --write-real 同给：SW_OUT 优先（沙箱）。');
  writeFileSync(OUT_PATH ?? LIVE_OUT, freshNpcs);
  console.error(`[extract-npccolors] 已写盘 ${OUT_PATH ?? LIVE_OUT}（${OUT_PATH ? 'SW_OUT 沙箱' : '--write-real 真实现库'}）`);
}
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

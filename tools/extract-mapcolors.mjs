// 从 Terarria1456 Terraria.Map/MapHelper.cs Initialize() 提取【原版地图色全表】
// → src/data/vanilla-mapcolors.json。
// 覆盖：array[tileId][option]（13 变体/格）、array4[wallId][option]（2 变体/墙）、
//       array3[4] 液体色、天空渐变端点。
// ★关键：`color` 等命名局部在 Initialize 内被【反复重赋值】（`color = new Color(...)`）——
//  必须按源码【顺序扫描】当前值，两遍快照式会把全部别名解析成首个值（曾全表泥土色）。
//  array→array 前向引用单独收集，末尾多轮解析（实测 2 轮收敛）。
import { readFileSync, writeFileSync } from 'node:fs';

const ROOT = '/Users/vinlic/Project/GLM/SandboxWorld';
const src = readFileSync(`${ROOT}/Terarria1456/Terraria.Map/MapHelper.cs`, 'utf8');

function methodBody(name) {
  const idx = src.indexOf(name);
  const start = src.indexOf('{', idx);
  let depth = 0;
  for (let i = start; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) return src.slice(start + 1, i); }
  }
  return '';
}
const body = methodBody('public static void Initialize()');

// XNA Color * float：(int)(ch*f) 经 Color(int...) 构造钳 0-255（取整=截断）
const mulColor = (c, f) => [Math.min(255, Math.trunc(c[0] * f)), Math.min(255, Math.trunc(c[1] * f)), Math.min(255, Math.trunc(c[2] * f))];

const named = new Map();       // 命名局部当前值（顺序更新）
const tileArr = new Map();     // "id,opt" → [r,g,b]（值或引用键）
const wallArr = new Map();
const refQueue = [];           // 未解析的 array→array 引用赋值

for (const raw of body.split('\n')) {
  const l = raw.trim();
  let m;
  if ((m = l.match(/^(?:Color\s+)?(\w+) = new Color\((\d+), (\d+), (\d+)\);$/))) {
    named.set(m[1], [+m[2], +m[3], +m[4]]);
    continue;
  }
  if ((m = l.match(/^array\[(\d+)\]\[(\d+)\] = new Color\((\d+), (\d+), (\d+)\);$/))) {
    tileArr.set(`${m[1]},${m[2]}`, [+m[3], +m[4], +m[5]]);
    continue;
  }
  if ((m = l.match(/^array4\[(\d+)\]\[(\d+)\] = new Color\((\d+), (\d+), (\d+)\);$/))) {
    wallArr.set(`${m[1]},${m[2]}`, [+m[3], +m[4], +m[5]]);
    continue;
  }
  if ((m = l.match(/^array\[(\d+)\]\[(\d+)\] = (\w+);$/))) {
    const v = named.get(m[3]);
    if (v) tileArr.set(`${m[1]},${m[2]}`, v);
    continue;
  }
  if ((m = l.match(/^array4\[(\d+)\]\[(\d+)\] = (\w+);$/))) {
    const v = named.get(m[3]);
    if (v) wallArr.set(`${m[1]},${m[2]}`, v);
    continue;
  }
  if ((m = l.match(/^array\[(\d+)\]\[(\d+)\] = array\[(\d+)\]\[(\d+)\](?: \* ([\d.]+)f?)?;$/))) {
    refQueue.push([tileArr, `${m[1]},${m[2]}`, `array[${m[3]}][${m[4]}]`, m[5] ? parseFloat(m[5]) : 1]);
    continue;
  }
  if ((m = l.match(/^array4\[(\d+)\]\[(\d+)\] = array\[(\d+)\]\[(\d+)\](?: \* ([\d.]+)f?)?;$/))) {
    refQueue.push([wallArr, `${m[1]},${m[2]}`, `array[${m[3]}][${m[4]}]`, m[5] ? parseFloat(m[5]) : 1]);
    continue;
  }
}
// 前向引用解析（数组键形式回归 Map 键）
const keyOf = (ref) => ref.replace(/^array\[(\d+)\]\[(\d+)\]$/, '$1,$2');
for (let pass = 0; pass < 4; pass++) {
  let pending = 0;
  for (const [arr, k, ref, f] of refQueue) {
    const v = arr.get(keyOf(ref)) ?? (ref.startsWith('array4') ? wallArr.get(keyOf(ref)) : tileArr.get(keyOf(ref)));
    if (!v) { pending++; continue; }
    arr.set(k, f === 1 ? v : mulColor(v, f));
  }
  if (!pending) break;
}

const TILES = {};
for (const [k, v] of tileArr) {
  const [id, opt] = k.split(',').map(Number);
  (TILES[id] ??= [])[opt] = v;
}
const WALLS = {};
for (const [k, v] of wallArr) {
  const [id, opt] = k.split(',').map(Number);
  (WALLS[id] ??= [])[opt] = v;
}
const LIQUIDS = [[9, 61, 191], [253, 32, 3], [254, 194, 20], [161, 127, 255]];
const SKY = { from: [50, 40, 255], to: [145, 185, 255] };

writeFileSync(`${ROOT}/game/src/data/vanilla-mapcolors.json`, JSON.stringify({ tiles: TILES, walls: WALLS, liquids: LIQUIDS, sky: SKY }));
console.error(`mapcolors: tile ${Object.keys(TILES).length} / wall ${Object.keys(WALLS).length} / 液体 4 / 天空渐变`);
console.error('dirt 0:', JSON.stringify(TILES[0]?.[0]), 'grass 2:', JSON.stringify(TILES[2]?.[0]), 'stone 1:', JSON.stringify(TILES[1]?.[0]));
console.error('wall stone 1:', JSON.stringify(WALLS[1]?.[0]), 'wall dirt 2:', JSON.stringify(WALLS[2]?.[0]), 'wall wood 4:', JSON.stringify(WALLS[4]?.[0]));

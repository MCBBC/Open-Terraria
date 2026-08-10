// 从 Terarria1456 Projectile.cs SetDefaults 提取投射物数据。
// 注意：与 Item.cs 不同，Projectile.cs 的 SetDefaults(Type) 用的是
// `if (type == N) {...} else if (type == M) {...}` 链（约 436 行起），
// 不是 switch-case —— 之前按 switch 解析提取到 0 条就是这个原因。
// 深度 1 赋值捕获；输出 src/data/vanilla-projectiles.json
import { readFileSync, writeFileSync } from 'node:fs';

const ROOT = '/Users/vinlic/Project/GLM/SandboxWorld';
const src = readFileSync(`${ROOT}/Terarria1456/Terraria/Projectile.cs`, 'utf8');

// ---- SetDefaults(int Type) 方法体 ----
const fnIdx = src.indexOf('public void SetDefaults(int Type');
if (fnIdx < 0) throw new Error('SetDefaults not found');
const start = src.indexOf('{', fnIdx);
let depth = 0, end = start;
for (let i = start; i < src.length; i++) {
  if (src[i] === '{') depth++;
  else if (src[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
}
const body = src.slice(start + 1, end);

// ---- if (type == N) / else if (type >= A && type <= B) 链拆分（花括号配平） ----
// 1456 除单值条件外还有区间批量定义（悠悠球 541-555 等走 DefaultToYoyo），
// 区间块展开为逐 id 记录；其它比较形式（>、<、!=）跳过
const pat = /(?:else\s+)?if\s*\(\s*type\s*==\s*(\d+)\s*\)|(?:else\s+)?if\s*\(\s*type\s*>=\s*(\d+)\s*&&\s*type\s*<=\s*(\d+)\s*\)/g;
const marks = [];
let m;
while ((m = pat.exec(body))) {
  if (m[1] !== undefined) marks.push([[+m[1]], m.index]);
  else {
    const range = [];
    for (let t = +m[2]; t <= +m[3]; t++) range.push(t);
    marks.push([range, m.index]);
  }
}
const blocks = [];
for (let k = 0; k < marks.length; k++) {
  const [ids, at] = marks[k];
  const braceAt = body.indexOf('{', at);
  if (braceAt < 0) continue;
  let d = 0, e = braceAt;
  for (let i = braceAt; i < body.length; i++) {
    if (body[i] === '{') d++;
    else if (body[i] === '}') { d--; if (d === 0) { e = i; break; } }
  }
  for (const id of ids) blocks.push({ id, block: body.slice(braceAt + 1, e) });
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

const NUM_FIELDS = ['aiStyle', 'width', 'height', 'penetrate', 'timeLeft', 'damage', 'light'];
const BOOL_FIELDS = ['friendly', 'melee', 'ranged', 'magic', 'minion', 'hostile', 'tileCollide', 'ignoreWater', 'pierce'];

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
    const line = hlines.find((l) => new RegExp(`^${f} = -?[\\d.]+f?;`).test(l));
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
  const lines = depth1Lines(block);
  const rec = {};
  const apply = (ls) => {
    for (const f of NUM_FIELDS) {
      const line = ls.find((l) => new RegExp(`^${f} = -?[\\d.]+f?;`).test(l));
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

writeFileSync(`${ROOT}/game/src/data/vanilla-projectiles.json`, JSON.stringify(data));
console.error(`共 ${Object.keys(data).length} 投射物`);
console.error('手里剑(3):', JSON.stringify(data['3']));
console.error('回旋镖(6):', JSON.stringify(data['6']));
console.error('手雷(28):', JSON.stringify(data['28']));
console.error('长矛(23):', JSON.stringify(data['23']));
console.error('悠悠球(546):', JSON.stringify(data['546']));

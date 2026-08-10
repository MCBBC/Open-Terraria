// 从 Terarria1456 Item.cs 提取物品战斗数据（SetDefaults 主 switch + SetDefaults1/2/3 分段 switch）。
// case 块内深度 1 赋值；SetDefaultsN(M) 委托块继承 M 记录后覆盖。输出 src/data/vanilla-itemcombat.json
import { readFileSync, writeFileSync } from 'node:fs';

const ROOT = '/Users/vinlic/Project/GLM/SandboxWorld';
const src = readFileSync(`${ROOT}/Terarria1456/Terraria/Item.cs`, 'utf8');

// ---- 方法体切片（配平花括号） ----
function methodBody(name) {
  const idx = src.indexOf(name);
  if (idx < 0) return '';
  const start = src.indexOf('{', idx);
  let depth = 0;
  for (let i = start; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) return src.slice(start + 1, i); }
  }
  return '';
}
const bodies = [
  methodBody('public void SetDefaults(int Type'),
  methodBody('public void SetDefaults1(int type)'),
  methodBody('public void SetDefaults2(int type)'),
  methodBody('public void SetDefaults3(int type)'),
];

// ---- switch-case 块拆分 ----
function parseSwitch(body) {
  const out = [];
  const caseRe = /\bcase (\d+):/g;
  let m;
  const marks = [];
  while ((m = caseRe.exec(body))) marks.push([+m[1], m.index]);
  for (let k = 0; k < marks.length; k++) {
    const [id, at] = marks[k];
    const start = body.indexOf(':', at) + 1;
    const end = k + 1 < marks.length ? marks[k + 1][1] : body.length;
    out.push({ id, block: body.slice(start, end) });
  }
  return out;
}

// ---- 块内深度 1 赋值（switch 内语句深度 0） ----
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

const NUM_FIELDS = ['damage', 'knockBack', 'useTime', 'useAnimation', 'shoot', 'useAmmo', 'shootSpeed', 'ammo', 'maxStack', 'crit', 'scale'];
// AmmoID.* 枚举引用（AmmoID.cs:114-130）
const AMMO_ID = { Gel: 23, Arrow: 40, Coin: 71, Bullet: 97, Sand: 169, Dart: 283, Rocket: 771, Solution: 780, None: 0 };
const BOOL_FIELDS = ['consumable', 'noMelee', 'autoReuse', 'melee', 'ranged', 'magic', 'summon'];

const literal = new Map(); // id -> rec（字面 case）
const delegates = [];      // id, targetId, block
for (const body of bodies) {
  for (const { id, block } of parseSwitch(body)) {
    const lines = depth1Lines(block);
    const rec = {};
    for (const f of NUM_FIELDS) {
      const line = lines.find((l) => new RegExp(`^${f} = -?[\\d.]+f?;`).test(l) || (f === 'useAmmo' && /^useAmmo = AmmoID\.\w+;/.test(l)) || (f === 'ammo' && /^ammo = AmmoID\.\w+;/.test(l)));
      if (!line) continue;
      const am = line.match(/AmmoID\.(\w+)/);
      rec[f] = am ? (AMMO_ID[am[1]] ?? -1) : parseFloat(line.match(/-?[\d.]+/)[0]);
    }
    for (const f of BOOL_FIELDS) {
      if (lines.some((l) => l === `${f} = true;`)) rec[f] = true;
      else if (lines.some((l) => l === `${f} = false;`)) rec[f] = false;
    }
    const dl = lines.find((l) => /^SetDefaults\d?\(\d+\);/.test(l));
    if (dl) {
      delegates.push({ id, targetId: parseInt(dl.match(/\d+/)[0], 10), rec });
    } else if (Object.keys(rec).length) {
      // 同 id 多处赋值（分段 switch 可能重复）：合并（后者覆盖）
      literal.set(id, { ...(literal.get(id) || {}), ...rec });
    }
  }
}

// ---- 委托合并（迭代至收敛，处理委托链） ----
const data = new Map(literal);
for (let round = 0; round < 4; round++) {
  for (const d of delegates) {
    const base = data.get(d.targetId);
    if (base) data.set(d.id, { ...base, ...d.rec });
  }
}

const obj = {};
for (const [k, v] of data) obj[k] = v;
writeFileSync(`${ROOT}/game/src/data/vanilla-itemcombat.json`, JSON.stringify(obj));
const bows = [...data.values()].filter((v) => v.useAmmo === 40);
const arrows = [...data.values()].filter((v) => v.ammo === 40);
console.error(`共 ${data.size} 物品 / 弓类 ${bows.length} / 箭类 ${arrows.length}`);
console.error('木弓(99):', JSON.stringify(obj['99']));
console.error('木箭(40):', JSON.stringify(obj['40']));
console.error('火焰箭(41):', JSON.stringify(obj['41']));

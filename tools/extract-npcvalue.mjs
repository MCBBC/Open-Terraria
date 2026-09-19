// 补全 NPC.value：SetDefaults else-if 链（`else if (type == N)` 块内的 value = ...）
// ——旧 npcvalue 表只扫了 switch case 形态,19 个 boss（else-if 链）全缺。
// 合并进现有 vanilla-npcvalue.json（已有键不覆盖）。
import { readFileSync, writeFileSync } from 'fs';
const src = readFileSync('/Users/vinlic/Project/GLM/SandboxWorld/Terarria1456/Terraria/NPC.cs', 'utf8');
const db = JSON.parse(readFileSync('/Users/vinlic/Project/GLM/SandboxWorld/game/src/data/vanilla-npcvalue.json', 'utf8'));

const s0 = src.indexOf('public void SetDefaults(int Type');
const body = src.slice(s0, s0 + 200000);  // SetDefaults 主链大窗(≈4000 行);正则按缩进形态限定,误配风险低
// else-if 块切分:每个 `else if (type == N)` / `if (type == N)` 到下一个同级
// ★BJ174 反哺（2026-09-19）：联合条件块 `else if (type == 473 || ...)` 旧正则要求 `\)`
//   紧跟首个 id → 整块跳过;且 value 正则不认浮点字面量 `30000f`。两处同修（1477 同源）。
const re = /\n\t\t(?:else )?if \(type == (\d+)((?:\s*\|\|\s*type == \d+)*)\)\n\t\t\{\n/g;
const marks = [];
let m;
while ((m = re.exec(body))) {
  const ids = [+m[1]];
  for (const t of m[2].matchAll(/type == (\d+)/g)) ids.push(+t[1]);
  marks.push({ ids, at: m.index });
}
let added = 0;
for (let i = 0; i < marks.length; i++) {
  if (marks[i].ids.every((id) => db[String(id)] !== undefined)) continue;
  const end = i + 1 < marks.length ? marks[i + 1].at : marks[i].at + 4000;
  const seg = body.slice(marks[i].at, end);
  let val = null;
  let mm = seg.match(/value = Item\.buyPrice\(([\d\s,]+)\);/);
  if (mm) {
    const a = mm[1].split(',').map((s) => Number(s.trim()));
    val = a.reduce((acc, x) => acc * 100 + x, 0) * 100 ** (4 - a.length);
  } else if ((mm = seg.match(/value = (\d+(?:\.\d+)?)f?;/))) {
    val = Math.round(parseFloat(mm[1]));
  }
  if (val !== null) {
    for (const id of marks[i].ids) {
      if (db[String(id)] === undefined) { db[String(id)] = val; added++; }
    }
  }
}
writeFileSync('/Users/vinlic/Project/GLM/SandboxWorld/game/src/data/vanilla-npcvalue.json', JSON.stringify(db));
const boss = [50,4,13,35,222,113,134,125,126,127,262,245,370,636,398,551,668,439];
console.log('新增', added, '| boss 样例:', boss.map((b) => `${b}:${db[String(b)]}`).join(' '));

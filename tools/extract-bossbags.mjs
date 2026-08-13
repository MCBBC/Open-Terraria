// 从 Player.cs OpenBossBag(:6828-)提取 19 个宝藏袋开包表 → 词法 token 流 JSON
// 形态:IF(chance)/SPAWN(id[,stackExpr])/SWITCH(n)/BRANCH(i)/ELSE/END/DEDUP/rand2 去重等
import { readFileSync, writeFileSync } from 'fs';
const src = readFileSync('/Users/vinlic/Project/GLM/SandboxWorld/Terarria1456/Terraria/Player.cs', 'utf8');
const start = src.indexOf('public void OpenBossBag');
const end = src.indexOf('TryGettingDevArmor(itemSource_OpenItem);', start + 100);
// 函数边界：OpenBossBag 后的第一个平级方法声明截断
const segEnd = src.indexOf('\n\tpublic ', start + 100);
const body = src.slice(start, segEnd);

const out = {};
const caseRe = /\t\tcase (\d+):\s*\n/g;
// 白名单过滤:只留 19 个宝藏袋 case(其余函数的 case 丢弃)
const BAGS = new Set([3318,3319,3320,3321,3322,3323,3324,3325,3326,3327,3328,3329,3330,3331,3332,3860,4782,4957,5111]);
let m; const marks = [];
while ((m = caseRe.exec(body))) if (BAGS.has(+m[1])) marks.push({ id: +m[1], at: m.index });
for (let i = 0; i < marks.length; i++) {
  const seg = body.slice(marks[i].at, i + 1 < marks.length ? marks[i + 1].at : body.length);
  const toks = [];
  // 逐行词法
  for (const lineRaw of seg.split('\n')) {
    const line = lineRaw.trim();
    if (!line || line.startsWith('case ') || line === 'break;' || line === '{' || line === '}') {
      if (line === 'break;') toks.push({ t: 'end' });
      continue;
    }
    if (line.includes('TryGettingDevArmor')) { toks.push({ t: 'devArmor' }); continue; }
    let mm;
    if ((mm = line.match(/^if \(Main\.rand\.Next\((\d+)\) == 0\)$/))) { toks.push({ t: 'if', n: +mm[1] }); continue; }
    if (line.startsWith('else')) { toks.push({ t: 'else' }); continue; }
    if ((mm = line.match(/^switch \(Main\.rand\.Next\((\d+)\)\)$/))) { toks.push({ t: 'switch', n: +mm[1] }); continue; }
    if ((mm = line.match(/^case (\d+):$/)) && toks.at(-1)?.t === 'switch') { toks.push({ t: 'branch', i: +mm[1] }); continue; }
    if (line.startsWith('if (Main.masterMode)')) { toks.push({ t: 'master' }); continue; }
    // int numN = rand.Next(a,b); 变量声明(去重 for 或普通)
    if ((mm = line.match(/^int num\d+ = Main\.rand\.Next\((\d+), (\d+)\);$/))) {
      toks.push({ t: 'randVar', a: +mm[1], b: +mm[2] }); continue;
    }
    if (line.includes('for (num')) { toks.push({ t: 'dedup' }); continue; }
    if ((mm = line.match(/^short item = \(short\)\(WorldGen\.crimson \? (\d+) : (\d+)\);$/))) {
      toks.push({ t: 'crimItem', evil: +mm[1], good: +mm[2] }); continue;
    }
    // QuickSpawnItem 变体
    if ((mm = line.match(/^QuickSpawnItem\(itemSource_OpenItem, (\d+)\);$/))) { toks.push({ t: 'spawn', id: +mm[1] }); continue; }
    if ((mm = line.match(/^QuickSpawnItem\(itemSource_OpenItem, (\d+), Main\.rand\.Next\((\d+), (\d+)\)\);$/))) { toks.push({ t: 'spawn', id: +mm[1], lo: +mm[2], hi: +mm[3] }); continue; }
    if ((mm = line.match(/^QuickSpawnItem\(itemSource_OpenItem, (\d+), num\d+\);$/))) { toks.push({ t: 'spawn', id: +mm[1], useVar: true }); continue; }
    if ((mm = line.match(/^QuickSpawnItem\(itemSource_OpenItem, num\d+\);$/))) { toks.push({ t: 'spawn', useVar: true }); continue; }
    if ((mm = line.match(/^QuickSpawnItem\(itemSource_OpenItem, item\);$/))) { toks.push({ t: 'spawn', useCrimItem: true }); continue; }
    if ((mm = line.match(/^QuickSpawnItem\(itemSource_OpenItem, item, num\d+\);$/))) { toks.push({ t: 'spawn', useCrimItem: true, useVar: true }); continue; }
    if ((mm = line.match(/^QuickSpawnItem\(itemSource_OpenItem, Main\.rand\.Next\((\d+), (\d+)\)\);$/))) { toks.push({ t: 'spawn', lo: +mm[1], hi: +mm[2], randId: true }); continue; }
    // 数量叠加 num7 = rand.Next(a)+b 之类
    if ((mm = line.match(/^int num\d+ = Main\.rand\.Next\((\d+)\) \+ (\d+);$/))) { toks.push({ t: 'varAdd', roll: +mm[1], base: +mm[2] }); continue; }
    if ((mm = line.match(/^num\d+ \+= Main\.rand\.Next\((\d+)\) \+ (\d+);$/))) { toks.push({ t: 'varAddMore', roll: +mm[1], base: +mm[2] }); continue; }
    toks.push({ t: 'unparsed', src: line.slice(0, 100) });
  }
  out[marks[i].id] = toks;
}
writeFileSync('src/data/vanilla-bossbags.json', JSON.stringify(out, null, 1));
const unparsed = [];
for (const [id, toks] of Object.entries(out)) for (const t of toks) if (t.t === 'unparsed') unparsed.push(`${id}: ${t.src}`);
console.log('cases:', marks.length, '| unparsed:', unparsed.length);
for (const u of unparsed) console.log('  ??', u);

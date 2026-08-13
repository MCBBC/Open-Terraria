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
    if (!line) continue;
    { const cm = line.match(/^case (\d+):$/); if (cm) { toks.push({ t: 'branch', i: +cm[1] }); continue; } }
    if (line.startsWith('case ')) continue;
    if (line === 'break;') { toks.push({ t: 'end' }); continue; }
    if (line === '{') { toks.push({ t: 'blockOpen' }); continue; }
    if (line === '}') { toks.push({ t: 'blockClose' }); continue; }
    if (line.includes('TryGettingDevArmor')) { toks.push({ t: 'devArmor' }); continue; }
    let mm;
    if ((mm = line.match(/^if \(Main\.rand\.Next\((\d+)\) == 0\)$/))) { toks.push({ t: 'if', n: +mm[1] }); continue; }
    if (line.startsWith('else')) { toks.push({ t: 'else' }); continue; }
    if ((mm = line.match(/^switch \(Main\.rand\.Next\((\d+)\)\)$/))) { toks.push({ t: 'switch', n: +mm[1] }); continue; }
    if ((mm = line.match(/^case (\d+):$/)) && toks.at(-1)?.t === 'switch') { toks.push({ t: 'branch', i: +mm[1] }); continue; }
    if (line.startsWith('if (masterMode)') || line.startsWith('if (Main.masterMode)')) { toks.push({ t: 'master' }); continue; }
    // int numN = rand.Next(a,b); 变量声明(去重 for 或普通)
    if ((mm = line.match(/^int num\d* = Main\.rand\.Next\((\d+), (\d+)\);$/))) {
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
    if ((mm = line.match(/^num\d+ = Main\.rand\.Next\((\d+), (\d+)\);$/))) { toks.push({ t: 'randVar', a: +mm[1], b: +mm[2] }); continue; }
    if ((mm = line.match(/^int num\d+ = Main\.rand\.Next\((\d+)\);$/))) { toks.push({ t: 'randVar', a: 0, b: +mm[1] }); continue; }
    if ((mm = line.match(/^num\d+ = Main\.rand\.Next\((\d+)\) \+ (\d+);$/))) { toks.push({ t: 'varAdd', roll: +mm[1], base: +mm[2] }); continue; }
    if ((mm = line.match(/^item = \(short\)\(WorldGen\.crimson \? (\d+) : (\d+)\);$/))) { toks.push({ t: 'crimItem', evil: +mm[1], good: +mm[2] }); continue; }
    if (line === 'default:') { toks.push({ t: 'branch', i: -1 }); continue; }
    if (line === 'if (!extraAccessory)') { toks.push({ t: 'noExtraAcc' }); continue; }
    if (line === 'int num9;') continue;
    if ((mm = line.match(/^switch \(num\d+\)$/))) { toks.push({ t: 'switchVar' }); continue; }
    if ((mm = line.match(/^num\d+ = (\d+);$/))) { toks.push({ t: 'varId', id: +mm[1] }); continue; }
    if (line.startsWith('if (Main.remixWorld)')) { toks.push({ t: 'remix' }); continue; }
    if (/^num\d+ = \(\(num\d+ != 3\) \? \(489 \+ num\d+\) : 2998\);$/.test(line)) { toks.push({ t: 'idMap', map: { 0: 489, 1: 490, 2: 491, 3: 2998 } }); continue; }
    if (/^List<int> list = new List<int> \{/.test(line)) { toks.push({ t: 'pick2', ids: [...line.matchAll(/\d+/g)].map(Number) }); continue; }
    if (/^for \(int i = 0; i < 2; i\+\+\)/.test(line)) continue;   // pick2 循环体(已折叠)
    if (/^(int index = |int item2 = |QuickSpawnItem\(itemSource_OpenItem, item2\);|list\.RemoveAt)/.test(line)) continue;
    if (/^int num10 = -1;/.test(line)) { toks.push({ t: 'TAIL' }); break; }  // 共享尾段从此截断
    if (/^if \(type == \d+\)|^\t*num10 = \d+;/.test(line)) continue;
    if (/^if \(!HasItem\(\d+\)\)/.test(line)) { toks.push({ t: 'noItem', id: Number(line.match(/\((\d+)\)/)[1]) }); continue; }
    if ((mm = line.match(/^QuickSpawnItem\(itemSource_OpenItem, (\d+), (\d+)\);$/))) { toks.push({ t: 'spawn', id: +mm[1], stack: +mm[2] }); continue; }
    if (/^while \(num2 == num\)/.test(line)) { toks.push({ t: 'dedup' }); continue; }
    if (/^num = Main\.rand\.Next\(4982, 4985\);$/.test(line)) continue;   // 去重复掷
    if (/^QuickSpawnItem\(itemSource_OpenItem, num\);$/.test(line)) { toks.push({ t: 'spawn', useVar: true }); continue; }
    if (line === 'switch (type)') { toks.push({ t: 'TAIL' }); break; }
    toks.push({ t: 'unparsed', src: line.slice(0, 100) });
  }
  out[marks[i].id] = toks;
}
// 共享尾段:type→boss npc id(开袋按 boss value 附赠钱币,:7418-7472)
const coinMap = {};
const tail = src.slice(start, start + 40000);
const tailRe = /if \(type == (\d+)\)\s*\n\s*\{\s*\n\s*num10 = (\d+);/g;
let tm;
while ((tm = tailRe.exec(tail))) coinMap[+tm[1]] = +tm[2];
writeFileSync('src/data/vanilla-bossbags.json', JSON.stringify({ bags: out, coinMap }, null, 1));
const unparsed = [];
for (const [id, toks] of Object.entries(out)) for (const t of toks) if (t.t === 'unparsed') unparsed.push(`${id}: ${t.src}`);
console.log('cases:', marks.length, '| unparsed:', unparsed.length);
for (const u of unparsed) console.log('  ??', u);

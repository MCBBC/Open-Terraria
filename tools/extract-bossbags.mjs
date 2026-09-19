// 宝藏袋开包表提取 v2（结构化输出——提取期完成条件归一,引擎只做简单执行）
// 输出:每袋 { devArmor, spawns:[{id, stack?, conds:[...] }], switchCount }
//   conds 元素:{t:'chance',n} / {t:'master'} / {t:'noExtra'} / {t:'noItem',id}
//              / {t:'sw', k:switch 序号, branch:i}
// 尾段 coinMap:袋子→boss npc id(开袋按 value 附赠钱币)
import { readFileSync, writeFileSync } from 'fs';
// ★BJ183 2026-09-20 源锚 1456→1457（OpenBossBag :6828→:7206;1457 delta=3329 增 6158@1/6
// + 3330(旅商蝶袋 Next(6)→Next(7)) 增 3291@case5——两者已由 PC 批手并入盘上数据面。
// 【重产禁令】盘上面还含 remix/noRemix、stackExpr/stackVar、dedup2 等本器不产的字段,
// 全量重产会整批回退——重产前先恢复提取器编码面,见 BJ183 登记债）
const src = readFileSync('/Users/vinlic/Project/GLM/SandboxWorld/Terarria1457/Terraria/Player.cs', 'utf8');
const start = src.indexOf('public void OpenBossBag');
const BAGS = new Set([3318,3319,3320,3321,3322,3323,3324,3325,3326,3327,3328,3329,3330,3331,3332,3860,4782,4957,5111]);

// ---- 第一遍:抓各 case 段原文 ----
const segs = {};
const caseRe = /\t\tcase (\d+):\n/g;
const all = [];
let m;
while ((m = caseRe.exec(src))) if (BAGS.has(+m[1])) all.push({ id: +m[1], at: m.index });
all.sort((a, b) => a.at - b.at);
for (let i = 0; i < all.length; i++) {
  const end = i + 1 < all.length ? all[i + 1].at : src.indexOf('\n\t}\n', all[i].at);
  segs[all[i].id] = src.slice(all[i].at, end);
}

const out = {};
for (const [idStr, raw] of Object.entries(segs)) {
  const lines = raw.split('\n').map((l) => l.trim());
  const spawns = [];
  const conds = [];          // 当前条件栈(chance/master/noExtra/noItem)
  let swIdx = -1;            // switch 序号(计数)
  const swPicks = [];        // 每个 switch 的 pick(掷一次)
  let v = -1, lastRange = null, crimItem = 0, switchVarIds = [], maskRoll = 3;
  let devArmor = false;
  const flushVarSpawn = () => {
    if (switchVarIds.length) {
      spawns.push({ maskIds: switchVarIds, maskRoll, conds: [...conds] });
      switchVarIds = [];
    } else if (lastRange) {
      spawns.push({ idFrom: lastRange, conds: [...conds] });
      if (dedupSeen) spawns.push({ idFrom: lastRange, dedup2: true, conds: [...conds] });
      dedupSeen = false;
    } else if (v > 0) spawns.push({ id: v, conds: [...conds] });
  };
  let dedupSeen = false;
  let stackExpr = null;
  let braceDepth = 0, pairSeq = 0;
  for (const line of lines) {
    let mm;
    if (!line) continue;
    if (line === 'break;') continue;
    if (line === '{') { braceDepth++; continue; }
    if (line === '}') {
      braceDepth--;
      while (conds.length && conds[conds.length - 1].depth > braceDepth) conds.pop();
      continue;
    }
    if ((mm = line.match(/^case (\d+):$/)) && conds.some((c) => c.t === 'sw')) {
      const si = conds.map((c) => c.t === 'sw').lastIndexOf(true);
      conds.splice(si, 1);
      conds.push({ t: 'sw', k: swIdx, branch: +mm[1], depth: braceDepth + 1 });
      continue;
    }
    if (line.startsWith('case ')) continue;
    if (line.includes('TryGettingDevArmor')) { devArmor = true; continue; }
    if (line === 'default:') continue;
    if ((mm = line.match(/^if \(Main\.rand\.Next\((\d+)\) == 0\)$/))) { pairSeq++; conds.push({ t: 'chance', n: +mm[1], pair: pairSeq, depth: braceDepth + 1 }); continue; }
    if (line.startsWith('else')) { while (conds.length && conds[conds.length-1].t === 'chance') conds.pop(); conds.push({ t: 'chanceElse', pair: pairSeq, depth: braceDepth + 1 }); continue; }
    if (line.startsWith('if (masterMode)') || line.startsWith('if (Main.masterMode)')) { conds.push({ t: 'master', depth: braceDepth + 1 }); continue; }
    if (line === 'if (!extraAccessory)') { conds.push({ t: 'noExtra', depth: braceDepth + 1 }); continue; }
    if ((mm = line.match(/^if \(!HasItem\((\d+)\)\)$/))) { conds.push({ t: 'noItem', id: +mm[1], depth: braceDepth + 1 }); continue; }
    if (line.startsWith('if (Main.remixWorld)')) continue;
    if ((mm = line.match(/^switch \(Main\.rand\.Next\((\d+)\)\)$/))) { swIdx++; conds.push({ t: 'sw', k: swIdx, branch: -1, depth: braceDepth + 1 }); continue; }
    if ((mm = line.match(/^int num\d* = Main\.rand\.Next\((\d+), (\d+)\);$/))) { lastRange = [+mm[1], +mm[2]]; v = -1; continue; }
    if ((mm = line.match(/^int num\d* = Main\.rand\.Next\((\d+)\);$/))) { maskRoll = +mm[1]; continue; }
    if ((mm = line.match(/^int num\d+ = Main\.rand\.Next\((\d+)\) \+ (\d+);$/))) { stackExpr = [[+mm[1], +mm[2]]]; continue; }
    if ((mm = line.match(/^num\d+ \+= Main\.rand\.Next\((\d+)\) \+ (\d+);$/))) { (stackExpr ??= []).push([+mm[1], +mm[2]]); continue; }
    if (/^int num9;$/.test(line)) continue;
    if (/^for \(/.test(line) || /^while \(num/.test(line)) { dedupSeen = true; continue; }
    if ((mm = line.match(/^short item = \(short\)\(WorldGen\.crimson \? (\d+) : (\d+)\);$/))) { crimItem = null; spawns.push({ crim: true, evil: +mm[1], good: +mm[2], conds: [...conds] }); continue; }
    if ((mm = line.match(/^item = \(short\)\(WorldGen\.crimson \? (\d+) : (\d+)\);$/))) { spawns.push({ crim: true, evil: +mm[1], good: +mm[2], conds: [...conds], stackVar: true }); continue; }
    if ((mm = line.match(/^switch \(num\d+\)$/))) { switchVarIds = []; continue; }
    if ((mm = line.match(/^num\d+ = (\d+);$/))) { switchVarIds.push(+mm[1]); continue; }
    if (/^num\d+ = \(\(num\d+ != 3\) \? \(489 \+ num\d+\) : 2998\);$/.test(line)) { spawns.push({ maskIds: [489, 490, 491, 2998], maskRoll: 4, conds: [...conds] }); continue; }
    if (/^List<int> list = new List<int> \{/.test(line)) {
      spawns.push({ pick2: [...line.matchAll(/\d+/g)].map(Number), conds: [...conds] });
      continue;
    }
    // spawn 族
    if ((mm = line.match(/^QuickSpawnItem\(itemSource_OpenItem, (\d+), Main\.rand\.Next\((\d+), (\d+)\)\);$/))) { spawns.push({ id: +mm[1], lo: +mm[2], hi: +mm[3], conds: [...conds] }); continue; }
    if ((mm = line.match(/^QuickSpawnItem\(itemSource_OpenItem, (\d+), (\d+)\);$/))) { spawns.push({ id: +mm[1], stack: +mm[2], conds: [...conds] }); continue; }
    if ((mm = line.match(/^QuickSpawnItem\(itemSource_OpenItem, Main\.rand\.Next\((\d+), (\d+)\)\);$/))) { spawns.push({ idFrom: [+mm[1], +mm[2]], conds: [...conds] }); continue; }
    if ((mm = line.match(/^QuickSpawnItem\(itemSource_OpenItem, (\d+)\);$/))) { spawns.push({ id: +mm[1], conds: [...conds] }); continue; }
    if (/^QuickSpawnItem\(itemSource_OpenItem, (num\d*|item)\);/.test(line) || /^QuickSpawnItem\(itemSource_OpenItem, item, num\d+\);/.test(line)) { flushVarSpawn(); continue; }
    if (line === 'int num10 = -1;') break;   // 共享尾段
    if (line === 'switch (type)') break;
    if (/^(int index = |int item2 = |list\.RemoveAt)/.test(line)) continue;
    if (/^QuickSpawnItem\(itemSource_OpenItem, item2\);/.test(line)) continue;
    if ((mm = line.match(/^num\d* = Main\.rand\.Next\((\d+), (\d+)\);$/))) { lastRange = [+mm[1], +mm[2]]; v = -1; continue; }
    if ((mm = line.match(/^num\d* = Main\.rand\.Next\((\d+)\) \+ (\d+);$/))) { (stackExpr ??= []).push([+mm[1], +mm[2]]); continue; }
    if ((mm = line.match(/^QuickSpawnItem\(itemSource_OpenItem, (\d+), num\d+\);$/))) { const sp = { id: +mm[1], stackVar: true, conds: [...conds] }; if (stackExpr) sp.stackExpr = stackExpr; spawns.push(sp); stackExpr = null; continue; }
    if (/^if \(type == \d+\)|^num10 = \d+;|^if \(num10 <= 0\)/.test(line)) continue;
    console.log(`  ?? ${idStr}: ${line.slice(0, 90)}`);
  }
  out[idStr] = { devArmor, spawns };
}
// ---- 尾段 coinMap ----
const coinMap = {};
const tail = src.slice(start, start + 40000);
const tailRe = /if \(type == (\d+)\)\s*\n\s*\{\s*\n\s*num10 = (\d+);/g;
while ((m = tailRe.exec(tail))) coinMap[+m[1]] = +m[2];
writeFileSync('/Users/vinlic/Project/GLM/SandboxWorld/game/src/data/vanilla-bossbags.json', JSON.stringify({ bags: out, coinMap }, null, 1));
console.log('bags:', Object.keys(out).length, 'coinMap:', Object.keys(coinMap).length);
const b3328 = out['3328'];
console.log('3328 spawns:', b3328.spawns.length, '| sw conds:', b3328.spawns.filter((s) => s.conds.some((c) => c.t === 'sw')).length);

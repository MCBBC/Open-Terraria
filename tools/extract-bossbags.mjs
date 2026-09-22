// 宝藏袋开包表提取 v2（结构化输出——提取期完成条件归一,引擎只做简单执行）
// 输出:每袋 { devArmor, spawns:[{id, stack?, conds:[...] }], switchCount }
//   conds 元素:{t:'chance',n} / {t:'master'} / {t:'noExtra'} / {t:'noItem',id}
//              / {t:'sw', k:switch 序号, branch:i}
// 尾段 coinMap:袋子→boss npc id(开袋按 value 附赠钱币)
// ★BJ183 2026-09-20 源锚 1456→1457（OpenBossBag :6828→:7206;1457 delta=3329 增 6158@1/6
// + 3330(旅商蝶袋 Next(6)→Next(7)) 增 3291@case5——两者已由 PC 批手并入盘上数据面。
// 【重产禁令→★BJ215 已代码化→★BJ217 编码面恢复】盘上面领先字段（BJ215 干跑 diff
// 定谳清单）已全部追赶：cond.noMaster（masterMode else 支,pendingIf 取反建模）+
// cond.remix/noRemix（remixWorld 分支）+ stackVar 条目 lo/hi 栈域 + stackExpr 分列
// （crim 暂存到 QuickSpawnItem(item,numX) 点挂载即清）+ sw default 臂=Next(N)-1 +
// 去重对单条 dedup2 形态——SW_OUT 沙箱重产 vs 现库 19 袋 18 袋逐值全等。
// ★BJ217 唯一登记残差（3329 chance pair 值）：现库 pair=[1,3,2]（6158=3/1294=2）系
//   BJ183 手补并入时的 max+1 编号（1456 基线 2110=1/1294=2）;源码位序（:7516-7523
//   Next(6) 先于 Next(3)）给 [1,2,3]。语义零差——pair 系 chance/chanceElse 配对链
//   键（vanillaBossBags.ts:98-108）,3329 无 else 支,pair 值纯唯二标签;守卫干跑仍
//   以此残差报 loud（不降判别力）,数据面 2 值对齐留待后续数据刀。
//
// ★era guard（BJ215 落闸,四要素习语见 docs/era-guard-family.md）：
//   ① SW_ITEM_VER 缺省 1457（白名单 1457/1458——1458 OpenBossBag 方法体与 1457 逐字节
//     全等且重产 fresh 逐字节同,BJ215 实证）;
//   ② 输出通道三分离：缺省=干跑对拍零写盘（重产 vs 现库动态 diff——「现库有而重产无」
//     的袋/spawn/字段/coinMap 键非空=字段型洗库预警 exit 1+差异清单）/ SW_OUT=<dir> 沙箱 /
//     --write-real 逃生门;双旗互斥;SW_ITEM_VER≠1457 禁写真库;探测注入面 SW_BOSSBAGS_JSON
//     （守卫测试重定向现库路径,读侧）与 --write-real 混用拒（g1 footgun,读夹具写真库）;
//   ③ 锚 fail-loud：OpenBossBag 签名/BAGS 全命中/coinMap 基数护栏,失配 throw 报错退出;
//   ④ 判别力自证：tests/extract-bossbags-era-guard.test.ts（变异:摘干跑门=静默写库;
//     毒化锚=fail-loud）。
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
const ROOT = '/Users/vinlic/Project/GLM/SandboxWorld';
const VER = process.env.SW_ITEM_VER ?? '1457';
const VER_ALLOWED = new Set(['1457', '1458']);
if (!VER_ALLOWED.has(VER) || !existsSync(`${ROOT}/Terarria${VER}/Terraria/Player.cs`)) {
  console.error(`[extract-bossbags] 拒绝运行：SW_ITEM_VER="${VER}" 非法（白名单 ${[...VER_ALLOWED].join('/')}，且需存在 Terarria${VER}/ 反编译目录）。`);
  process.exit(1);
}
const WRITE_REAL = process.argv.includes('--write-real');
const FORCE_FULL = process.argv.includes('--force-full');
const OVERWRITE_APPEND_ERA = process.argv.includes('--overwrite-append-era');
const SW_OUT = process.env.SW_OUT;
if (SW_OUT !== undefined && SW_OUT !== '' && WRITE_REAL) {
  console.error('[extract-bossbags] 拒绝运行：SW_OUT 与 --write-real 双旗互斥（输出通道必须唯一）。');
  console.error('  处置：沙箱对拍用 SW_OUT=<dir>；确认定谳后更新现库用 --write-real（且 SW_ITEM_VER=1457）。');
  process.exit(1);
}
if (WRITE_REAL && VER !== '1457') {
  console.error(`[extract-bossbags] 拒绝写真库：SW_ITEM_VER=${VER}≠1457（旧基线重放禁写 game/src/data/vanilla-bossbags.json）。`);
  console.error('  处置：重放对拍请走 SW_OUT 沙箱；确要回写 1457 终值请去掉 SW_ITEM_VER 显式注入（缺省即 1457）。');
  process.exit(1);
}
// ★g1 footgun（npccolors 变体）：探测注入面（SW_BOSSBAGS_JSON,读侧现库重定向）与
//   --write-real 混用 = 读夹具对拍、写真实现库——探测与写盘分离=守卫被绕过洗库面。
if (WRITE_REAL && process.env.SW_BOSSBAGS_JSON !== undefined) {
  console.error('[extract-bossbags] 拒绝运行：探测注入面（SW_BOSSBAGS_JSON）已设置而 --write-real 将写真实现库（fail-closed）。');
  console.error('  处置：对拍用 SW_BOSSBAGS_JSON（零写盘干跑）或 SW_OUT 沙箱；更新现库须清掉探测 env 再 --write-real。');
  process.exit(1);
}
const LIVE_JSON = process.env.SW_BOSSBAGS_JSON ?? `${ROOT}/game/src/data/vanilla-bossbags.json`;
// ★M1 变异锚:干跑臂 null(守卫测试把 null 换成假现库路径,证明缺省零写盘是唯一拦截面)
const OUT_JSON = WRITE_REAL ? LIVE_JSON
  : (SW_OUT ? `${SW_OUT.replace(/\/+$/, '')}/vanilla-bossbags.json` : null);
const src = readFileSync(`${ROOT}/Terarria${VER}/Terraria/Player.cs`, 'utf8');
const start = src.indexOf('public void OpenBossBag');
if (start < 0) throw new Error('[extract-bossbags] 锚点失配: OpenBossBag 签名未找到（Player.cs 漂移,禁止静默空扫）');
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
{
  // 锚 fail-loud：BAGS 全命中（缺袋=扫描面静默退化,禁止吃缺省继续）
  const missingBags = [...BAGS].filter((id) => !segs[id]);
  if (missingBags.length) throw new Error(`[extract-bossbags] 锚点失配: 袋 case 未全命中: ${missingBags.join(', ')}（caseRe 扫描面漂移）`);
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
      if (dedupSeen) {
        // ★BJ217 去重对形态（3318 :7227-7234 num3/num4 for-去重、4957 :7683-7690
        // num/num2 while-去重）＝「从域内掷两个互异值」→ 单条 dedup2 产出（运行时
        // vanillaBossBags.ts:152-160 idFrom+dedup2 双 give）;第二次 QuickSpawnItem(num4)
        // 不再产出（清 lastRange）。旧实现产两条（裸 idFrom+dedup2 副本）＝字段型漂移。
        spawns.push({ idFrom: lastRange, dedup2: true, conds: [...conds] });
        dedupSeen = false;
        lastRange = null;
      } else {
        spawns.push({ idFrom: lastRange, conds: [...conds] });
      }
    } else if (v > 0) spawns.push({ id: v, conds: [...conds] });
  };
  let dedupSeen = false;
  let stackExpr = null;
  let braceDepth = 0, pairSeq = 0;
  // ★BJ217 if/else 配对面：pendingIf 记最近一个 if 压入的 cond,else 臂按其生成取反
  //   cond（chance→chanceElse 同 pair / master→noMaster / remix→noRemix）——3320/3321
  //   masterMode else 支(:7281-7300)与 3330 case6 remixWorld if/else(:7581-7591)亲读。
  let pendingIf = null;
  // ★BJ217 crim 暂存：`short item = (short)(WorldGen.crimson ? E : G)` 先记账,到
  //   `QuickSpawnItem(itemSource_OpenItem, item, numX)` 落地产出（stackExpr 同点挂载,
  //   3319 :7254-7265:stackExpr 累计链在 QuickSpawnItem 消费后清零,逐条独立）。
  let pendingCrim = null;
  // ★BJ217 switch 掷面数表：swNext[k] = `switch (Main.rand.Next(N))` 的 N——
  //   `default:` 臂 = N-1（3323 :7385-7395 default=branch2、3329 :7539 default=branch6、
  //   3860 :7612 default=branch3,运行时 swFaces=branch 最大值+1 vanillaBossBags.ts:83-88）。
  const swNext = [];
  // ★BJ217 sw cond 生命周期=其 switch 自身块：弹出阈值=switch 语句行 braceDepth,
  //   内层 if/else 块闭合不波及（3330 case6 remix if/else 内 2623 须保留 sw branch6
  //   :7581-7591）,switch 自身块闭合才弹（3329 switch 后 2218 无 sw :7558）
  const swPopAt = [];
  for (const line of lines) {
    let mm;
    if (!line) continue;
    if (line === 'break;') continue;
    if (line === '{') { braceDepth++; continue; }
    if (line === '}') {
      braceDepth--;
      // sw cond 不走深度弹栈（其生命周期由下方 swPopAt 专属管）——3330 case6 内层
      // remix if/else 块闭合(:7586/:7589)不得波及 sw branch6
      while (conds.length && conds[conds.length - 1].depth > braceDepth && conds[conds.length - 1].t !== 'sw') conds.pop();
      if (swIdx >= 0 && braceDepth <= (swPopAt[swIdx] ?? -1)) {
        const si = conds.map((c) => c.t === 'sw').lastIndexOf(true);
        if (si >= 0) conds.splice(si, 1);
        swPopAt[swIdx] = -1;
      }
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
    if (line === 'default:') {
      // ★BJ217 default 臂 = swNext[swIdx]-1（见 swNext 注;旧实现跳过 default=
      //   前支 cond 泄漏到 default 臂——3323/3329/3860 三袋 branch 编号漂移根因）
      if (swIdx >= 0 && conds.some((c) => c.t === 'sw')) {
        const si = conds.map((c) => c.t === 'sw').lastIndexOf(true);
        conds.splice(si, 1);
        conds.push({ t: 'sw', k: swIdx, branch: (swNext[swIdx] ?? 0) - 1, depth: braceDepth + 1 });
      }
      continue;
    }
    if ((mm = line.match(/^if \(Main\.rand\.Next\((\d+)\) == 0\)$/))) { pairSeq++; const c = { t: 'chance', n: +mm[1], pair: pairSeq, depth: braceDepth + 1 }; conds.push(c); pendingIf = c; continue; }
    if (line.startsWith('else')) {
      // ★BJ217 else 臂取反：按 pendingIf 类型生成 noMaster/noRemix/chanceElse(同 pair)
      const p = pendingIf;
      pendingIf = null;
      if (p && p.t === 'chance') {
        while (conds.length && conds[conds.length - 1].t === 'chance') conds.pop();
        conds.push({ t: 'chanceElse', pair: p.pair, depth: braceDepth + 1 });
      } else if (p && p.t === 'master') {
        if (conds.length && conds[conds.length - 1].t === 'master') conds.pop();
        conds.push({ t: 'noMaster', depth: braceDepth + 1 });
      } else if (p && p.t === 'remix') {
        if (conds.length && conds[conds.length - 1].t === 'remix') conds.pop();
        conds.push({ t: 'noRemix', depth: braceDepth + 1 });
      } else {
        while (conds.length && conds[conds.length - 1].t === 'chance') conds.pop();
        conds.push({ t: 'chanceElse', pair: pairSeq, depth: braceDepth + 1 });
      }
      continue;
    }
    if (line.startsWith('if (masterMode)') || line.startsWith('if (Main.masterMode)')) { const c = { t: 'master', depth: braceDepth + 1 }; conds.push(c); pendingIf = c; continue; }
    if (line === 'if (!extraAccessory)') { const c = { t: 'noExtra', depth: braceDepth + 1 }; conds.push(c); pendingIf = c; continue; }
    if ((mm = line.match(/^if \(!HasItem\((\d+)\)\)$/))) { const c = { t: 'noItem', id: +mm[1], depth: braceDepth + 1 }; conds.push(c); pendingIf = c; continue; }
    if (line.startsWith('if (Main.remixWorld)')) { const c = { t: 'remix', depth: braceDepth + 1 }; conds.push(c); pendingIf = c; continue; }
    if ((mm = line.match(/^switch \(Main\.rand\.Next\((\d+)\)\)$/))) { swIdx++; swNext[swIdx] = +mm[1]; swPopAt[swIdx] = braceDepth; conds.push({ t: 'sw', k: swIdx, branch: -1, depth: braceDepth + 1 }); continue; }
    if ((mm = line.match(/^int num\d* = Main\.rand\.Next\((\d+), (\d+)\);$/))) { lastRange = [+mm[1], +mm[2]]; v = -1; continue; }
    if ((mm = line.match(/^int num\d* = Main\.rand\.Next\((\d+)\);$/))) { maskRoll = +mm[1]; continue; }
    if ((mm = line.match(/^int num\d+ = Main\.rand\.Next\((\d+)\) \+ (\d+);$/))) { stackExpr = [[+mm[1], +mm[2]]]; continue; }
    if ((mm = line.match(/^num\d+ \+= Main\.rand\.Next\((\d+)\) \+ (\d+);$/))) { (stackExpr ??= []).push([+mm[1], +mm[2]]); continue; }
    if (/^int num\d+;$/.test(line)) continue;   // 声明行（3318 `int num4;` :7229）
    if (/^for \(/.test(line) || /^while \(num/.test(line)) { dedupSeen = true; continue; }
    // ★BJ217 crim 暂存（3319 :7254-7265）：产出推迟到 QuickSpawnItem(item, numX) 点,
    //   stackExpr 同点挂载并消费清零（旧实现 item 行即产出→stackExpr 未挂/跨条污染）
    if ((mm = line.match(/^short item = \(short\)\(WorldGen\.crimson \? (\d+) : (\d+)\);$/))) { pendingCrim = { evil: +mm[1], good: +mm[2] }; continue; }
    if ((mm = line.match(/^item = \(short\)\(WorldGen\.crimson \? (\d+) : (\d+)\);$/))) { pendingCrim = { evil: +mm[1], good: +mm[2] }; continue; }
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
    if (/^QuickSpawnItem\(itemSource_OpenItem, (num\d*|item)\);/.test(line)) { flushVarSpawn(); continue; }
    if (/^QuickSpawnItem\(itemSource_OpenItem, item, num\d+\);/.test(line)) {
      // ★BJ217 crim 产出点（3319 :7260/:7264）:stackVar 恒真+stackExpr 挂载即清
      //   （运行时 stackOf() 逐条独立掷,vanillaBossBags.ts:142-147）
      if (pendingCrim) {
        const sp = { crim: true, evil: pendingCrim.evil, good: pendingCrim.good, conds: [...conds], stackVar: true };
        if (stackExpr) sp.stackExpr = stackExpr;
        spawns.push(sp);
        pendingCrim = null;
        stackExpr = null;
      } else {
        flushVarSpawn();
      }
      continue;
    }
    if (line === 'int num10 = -1;') break;   // 共享尾段
    if (line === 'switch (type)') break;
    if (/^(int index = |int item2 = |list\.RemoveAt)/.test(line)) continue;
    if (/^QuickSpawnItem\(itemSource_OpenItem, item2\);/.test(line)) continue;
    if ((mm = line.match(/^num\d* = Main\.rand\.Next\((\d+), (\d+)\);$/))) { lastRange = [+mm[1], +mm[2]]; v = -1; continue; }
    if ((mm = line.match(/^num\d* = Main\.rand\.Next\((\d+)\) \+ (\d+);$/))) { (stackExpr ??= []).push([+mm[1], +mm[2]]); continue; }
    // ★BJ217 栈域三分支（键序=盘上手补权威）:stackExpr 挂尾部（3319 47 条目）;lo/hi
    //   栈域挂 stackVar 后 conds 前（3320/3321 masterMode 分支 :7281-7300 num5/num6
    //   局部栈变量形态）;皆无 → 裸 stackVar
    if ((mm = line.match(/^QuickSpawnItem\(itemSource_OpenItem, (\d+), num\d+\);$/))) {
      let sp;
      if (stackExpr) {
        sp = { id: +mm[1], stackVar: true, conds: [...conds], stackExpr };
      } else if (lastRange) {
        sp = { id: +mm[1], stackVar: true, lo: lastRange[0], hi: lastRange[1], conds: [...conds] };
        lastRange = null;
      } else {
        sp = { id: +mm[1], stackVar: true, conds: [...conds] };
      }
      spawns.push(sp);
      stackExpr = null;
      continue;
    }
    if (/^if \(type == \d+\)|^num10 = \d+;|^if \(num10 <= 0\)/.test(line)) continue;
    if (/^if \(/.test(line)) pendingIf = null;   // 未识别 if：作废 else 配对面（防陈旧取反）
    console.log(`  ?? ${idStr}: ${line.slice(0, 90)}`);
  }
  out[idStr] = { devArmor, spawns };
}
// ---- 尾段 coinMap ----
const coinMap = {};
const tail = src.slice(start, start + 40000);
const tailRe = /if \(type == (\d+)\)\s*\n\s*\{\s*\n\s*num10 = (\d+);/g;
while ((m = tailRe.exec(tail))) coinMap[+m[1]] = +m[2];
if (Object.keys(coinMap).length < 15) {
  throw new Error(`[extract-bossbags] 锚点失配: coinMap 基数 ${Object.keys(coinMap).length} < 15（尾段锚漂移,禁止静默半表）`);
}

// ================= ★BJ215 era guard：干跑对拍 / 沙箱 / 逃生门（头注见上） =================
const FRESH = JSON.stringify({ bags: out, coinMap }, null, 1);
/** 现库 vs 重产动态 diff：live-only=「现库有而重产无」洗库面（袋/spawn/字段/coinMap 四轴,
 *  不硬编码键清单——vanilla-atlas 追加时代/npcs 债刀-3 同族动态探测）；
 *  fresh-only=「重产有而现库无」现库退化/源侧新增面（★BJ261 G-1/S3 处方:只算 live-only 的
 *  对拍闸对现库删条恒绿,双向才算「重产盖住现库」——缺键型=itemrare 同族,任一轴非空拒）。 */
function washOf(liveRaw) {
  let live;
  try { live = JSON.parse(liveRaw); } catch { return null; } // 坏损:不拦（让正常流程自行报错）
  const wash = { bags: [], spawns: {}, fields: [], coin: [], bagsFresh: [], spawnsFresh: {}, fieldsFresh: [], coinFresh: [] };
  const census = (t) => {
    const c = {};
    for (const b of Object.values(t.bags ?? {})) {
      for (const k of Object.keys(b)) if (k !== 'spawns') c[`bag.${k}`] = (c[`bag.${k}`] ?? 0) + 1;
      for (const s of b.spawns ?? []) {
        for (const k of Object.keys(s)) c[`spawn.${k}`] = (c[`spawn.${k}`] ?? 0) + 1;
        for (const cc of s.conds ?? []) c[`cond.${cc.t}`] = (c[`cond.${cc.t}`] ?? 0) + 1;
      }
    }
    return c;
  };
  const lc = census(live);
  const fc = census({ bags: out });
  for (const k of Object.keys(lc)) if ((fc[k] ?? 0) === 0) wash.fields.push(`${k}×${lc[k]}`);
  for (const k of Object.keys(fc)) if ((lc[k] ?? 0) === 0) wash.fieldsFresh.push(`${k}×${fc[k]}`);
  const sig = (s) => JSON.stringify(s);
  for (const id of Object.keys(live.bags ?? {})) {
    if (!out[id]) { wash.bags.push(id); continue; }
    const freshSet = new Set((out[id].spawns ?? []).map(sig));
    const liveOnly = (live.bags[id].spawns ?? []).filter((s) => !freshSet.has(sig(s)));
    if (liveOnly.length) wash.spawns[id] = { n: liveOnly.length, samples: liveOnly.slice(0, 3).map(sig) };
  }
  for (const id of Object.keys(out)) {
    if (!live.bags?.[id]) { wash.bagsFresh.push(id); continue; }
    const liveSet = new Set((live.bags[id].spawns ?? []).map(sig));
    const freshOnly = (out[id].spawns ?? []).filter((s) => !liveSet.has(sig(s)));
    if (freshOnly.length) wash.spawnsFresh[id] = { n: freshOnly.length, samples: freshOnly.slice(0, 3).map(sig) };
  }
  for (const [k, v] of Object.entries(live.coinMap ?? {})) {
    if (coinMap[Number(k)] !== v) wash.coin.push(`${k}:${v}→${coinMap[Number(k)] ?? '缺'}`);
  }
  for (const [k, v] of Object.entries(coinMap)) {
    if ((live.coinMap ?? {})[k] === undefined) wash.coinFresh.push(`${k}:缺→${v}`);
  }
  return wash;
}
const washEmpty = (w) => !w || (w.bags.length === 0 && Object.keys(w.spawns).length === 0 && w.fields.length === 0 && w.coin.length === 0
  && w.bagsFresh.length === 0 && Object.keys(w.spawnsFresh).length === 0 && w.fieldsFresh.length === 0 && w.coinFresh.length === 0);
const washReport = (w) => {
  console.error('  物证（live-only=现库领先面/重产整批回退面;fresh-only=现库退化缺键型面）：');
  if (w.bags.length) console.error(`    袋缺产: ${w.bags.join(', ')}`);
  for (const [id, s] of Object.entries(w.spawns)) console.error(`    袋 ${id}: 现库 ${s.n} 条 spawn 重产盖不住（如 ${s.samples.join(' | ')}）`);
  if (w.fields.length) console.error(`    领先字段: ${w.fields.join(', ')}`);
  if (w.coin.length) console.error(`    coinMap: ${w.coin.slice(0, 6).join(', ')}${w.coin.length > 6 ? '…' : ''}`);
  if (w.bagsFresh.length) console.error(`    [fresh-only] 袋现库缺: ${w.bagsFresh.join(', ')}`);
  for (const [id, s] of Object.entries(w.spawnsFresh)) console.error(`    [fresh-only] 袋 ${id}: 重产 ${s.n} 条现库缺（如 ${s.samples.join(' | ')}）`);
  if (w.fieldsFresh.length) console.error(`    [fresh-only] 重产独有字段: ${w.fieldsFresh.join(', ')}`);
  if (w.coinFresh.length) console.error(`    [fresh-only] coinMap 重产独有: ${w.coinFresh.slice(0, 6).join(', ')}`);
};
const liveRaw = existsSync(LIVE_JSON) ? readFileSync(LIVE_JSON, 'utf8') : null;
const wash = liveRaw === null ? null : washOf(liveRaw);
if (OUT_JSON) {
  if (WRITE_REAL) {
    if (wash && !washEmpty(wash) && !(FORCE_FULL && OVERWRITE_APPEND_ERA)) {
      console.error('[extract-bossbags] 拒绝 --write-real：重产 diff 非纯增量（现库领先面非空）——禁止静默覆盖领先字段（BJ183 登记债:重产前先恢复提取器编码面）。');
      washReport(wash);
      console.error('  确需原地强推：--force-full --overwrite-append-era 双旗（单旗仍拒）;事后必须全绿消费面测试（tests/bj91-bossbag-rare.test.ts 等）。');
      process.exit(1);
    }
    if (wash && !washEmpty(wash)) console.error('[extract-bossbags] 双旗强推：静默覆盖预警已确认——现库领先面将被整批回退（责任在操作者定谳）。');
  }
  mkdirSync(OUT_JSON.slice(0, OUT_JSON.lastIndexOf('/')), { recursive: true });
  writeFileSync(OUT_JSON, FRESH);
  console.error(`[extract-bossbags] 已写 ${OUT_JSON}（${WRITE_REAL ? '--write-real 真库' : 'SW_OUT 沙箱'}）`);
} else {
  // 缺省干跑对拍（零写盘）
  if (!liveRaw) {
    console.error('[extract-bossbags] 干跑（零写盘）：现库缺 vanilla-bossbags.json,跳过对拍。写盘须显式 SW_OUT=<dir> 或 --write-real。');
  } else if (wash && !washEmpty(wash)) {
    console.error('[extract-bossbags] 干跑对拍：双向 diff 非空（live-only=洗库预警 / fresh-only=现库退化缺键型）——零写盘。');
    washReport(wash);
    console.error('  活通道：逐值定谳（反编译为准）后 --write-real 定谳回写；沙箱试验用 SW_OUT=<dir>。');
    process.exit(1);
  } else {
    console.error('[extract-bossbags] 干跑对拍：重产盖住现库（双向零差,零写盘）。写盘须显式 SW_OUT=<dir> 或 --write-real。');
  }
}
console.log('bags:', Object.keys(out).length, 'coinMap:', Object.keys(coinMap).length);
const b3328 = out['3328'];
console.log('3328 spawns:', b3328.spawns.length, '| sw conds:', b3328.spawns.filter((s) => s.conds.some((c) => c.t === 'sw')).length);

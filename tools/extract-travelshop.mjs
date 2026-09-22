// 提取旅行商人动态商店池（Chest.SetupTravelShop_GetItem/GetPainting，Chest.cs:786-1240）：
// 每条 `RollLuck(rarity[N]) == 0 [&& cond] → it = X` 解析为 {id, tier, cond}
// 语义（GetItem 体内顺序执行、后命中覆盖前者）在运行期按原顺序复现。
//
// ★era guard（BJ215 落闸,四要素习语见 docs/era-guard-family.md）：
//   ① SW_TREE 缺省 1457（白名单 1456/1457,既有门保留）;
//   ② 输出通道三分离：缺省=干跑对拍零写盘（重产 vs 现库动态 diff——「现库有而重产无」
//     的条目键非空=洗库预警 exit 1+差异清单）/ --out <path>=显式写（沙箱,既有通道保留）/
//     --write-real=写真库 game/src/data/vanilla-travelshop.json;--out 与 --write-real
//     双旗互斥;--write-real 在 diff 非纯增量（现库领先面非空）时拒并指明差异清单,
//     强推须 --force-full --overwrite-append-era 双旗;
//   ③ 缺省 OUT_PATH 锚定脚本自身位置（import.meta.url 派生绝对路径）——旧实现相对路径
//     'src/data/...' 是 cwd footgun（从非 game/ 目录跑=写错位置）;
//   ④ 锚 fail-loud：方法签名未找到/条目基数护栏,失配 throw;
//   ⑤ 判别力自证：tests/extract-shops-era-guard.test.ts（变异:摘干跑门=静默写库;毒化
//     方法签名=fail-loud）。
//
// ★BJ217 词表恢复（BJ183/BJ215 登记债清偿,沙箱重产 vs 现库 66+31 逐值全等·多重集）：
//   ①cond 词表含式映射改整串精匹配表（TRAVEL_CONDS,锚=Chest.cs 逐行+Game.ts
//     condOk :38260 词汇）——anyBossKill/hardModeUp:4348（:1168-1175 嵌套 if 捕获）/
//     downed_4（:1176 downedBoss1,condOk 无 downedBoss1 位）/downedMechBossAny（:1180）/
//     hardMode&&downed_398（:837/:873）/hardMode&&downedMartians（:841-849）+
//     DST 双臂 !dontStarveWorld→null / dontStarveWorld→skip（:817-832/:891-903）;
//   ②单掷组条目 `it = 2281 + Main.rand.Next(3)`（:1232-1234）→ ids:[2281,2282,2283]
//     （★BJ222 已归一：组条目现库位序=源码位序 57（2266 与 2258 之间）,手补末位追加
//     工件已回位——BJ217 时的「位序残差 57 vs 65」登记债清偿,池序=RNG 消费序
//     （每条目逐次 RollLuck）,现库与重产全序逐条目全等）;
//   ③基数护栏抬到 1457 终值 66/31（BJ215 定谳现库值,重产实证追平）。
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const GAME_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
// SW_TREE（★BJ183 2026-09-20 缺省 Terarria1456→1457；SetupTravelShop_GetItem/GetPainting
// 两版源级 diff=0——但【盘上数据面领先于本提取器】（richer cond 词表 anyBossKill/
// downed_4/downedMechBossAny + ids 多件组 2281-2283 + 66 条 vs 本器 65 条）,全量重产
// 会回退——重产前先恢复提取器词表,见 BJ183 登记债）
const TREE = process.env.SW_TREE || 'Terarria1457';
if (!/^(Terarria14(56|57))$/.test(TREE)) throw new Error(`SW_TREE 非法: ${TREE}`);
const chest = readFileSync(`/Users/vinlic/Project/GLM/SandboxWorld/${TREE}/Terraria/Chest.cs`, 'utf8');

// ★BJ217 词表恢复（BJ183/BJ215 登记债清偿）：条件原文（空白归一）→ 运行期 condOk
//   token（Game.ts buildTravelStock condOk :38260-38290 词汇=盘上手补权威编码）。
//   键=整串精匹配—— Contains 式映射曾把 hardMode&&downedMoonlord 塌缩成 hardMode
//   （3596/5243 复合门丢失）。未知条件 → 'skip'+loud 告警（原静默丢弃面收口）。
const TRAVEL_CONDS = new Map([
  // GetPainting（:815-947）DST 双臂：tier3=普通世界恒真(null)/tier1=DST 世界限定(skip)
  ['!Main.dontStarveWorld', null],            // :817/:821/:825/:829 5121-5124 tier3
  ['Main.dontStarveWorld', 'skip'],           // :891-903 5121-5124 tier1
  ['Main.hardMode && NPC.downedMoonlord', 'hardMode&&downed_398'],      // :837/:873 3596/5243
  ['Main.hardMode && NPC.downedMartians', 'hardMode&&downedMartians'],  // :841-849 2865-2867
  ['NPC.downedFrost', 'downedFrost'],                                   // :853-869 3055-3059
  // GetItem（:978-1266）
  ['Main.hardMode && NPC.downedMechBoss1 && NPC.downedMechBoss2 && NPC.downedMechBoss3', 'hardModeMech'], // :1016 2223
  ['NPC.downedBoss3', 'downedBoss3'],                                   // :1048 2296
  ['Main.hardMode', 'hardMode'],                                        // :996/:1000/:1056…
  ['WorldGen.shadowOrbSmashed', 'shadowOrbSmashed'],                    // :1092 2269
  ['NPC.downedDeerclops || NPC.downedSlimeKing || NPC.downedBoss1 || NPC.downedBoss2 || NPC.downedBoss3 || NPC.downedQueenBee || Main.hardMode', 'anyBossKill'], // :1168 4347
  ['NPC.downedBoss1', 'downed_4'],            // :1176 3262（EoC=4;condOk 无 downedBoss1 位）
  ['NPC.downedMechBossAny', 'downedMechBossAny'],                       // :1180 3284
  // 1457 两池不出现,保留=跨版本鲁棒（condOk default=false 族）
  ['NPC.downedPirates', 'downedPirates'],
  ['NPC.downedGoblins', 'downedGoblins'],
  ['NPC.downedPlantBoss', 'downedPlantBoss'],
]);

function extractPool(fnName) {
  const start = chest.indexOf(`public static void ${fnName}`);
  if (start < 0) throw new Error(`[extract-travelshop] 锚点失配: ${fnName} 未找到（Chest.cs 漂移,禁止静默空扫）`);
  const end = chest.indexOf('\n\tpublic static', start + 10);
  const body = chest.slice(start, end);
  const entries = [];
  // if (RollLuck(rarity[N]) == 0 [&& cond]) { it = X; }
  //   X 两形态：纯数字 / `2281 + Main.rand.Next(3)`（:1232-1234 单掷组）
  const re = /RollLuck\(rarity\[(\d)\]\) == 0(.*?)\)\s*\n\t*\{\s*\n\s*it = ([^;]+);/g;
  let m;
  while ((m = re.exec(body))) {
    let condText = m[2] ?? '';
    if (condText.startsWith(' &&')) condText = condText.slice(3).trim();
    const norm = condText.replace(/\s+/g, ' ').trim();
    // :1168 4347 门带分组括号（`&& (NPC.downedDeerclops || …)`——捕获面含首尾括号）
    //   ——外层括号对剥离后入表
    const normBare = norm.replace(/^\((.*)\)$/, '$1').trim();
    let cond = null;
    if (norm) {
      if (TRAVEL_CONDS.has(norm)) cond = TRAVEL_CONDS.get(norm);
      else if (TRAVEL_CONDS.has(normBare)) cond = TRAVEL_CONDS.get(normBare);
      else {
        cond = 'skip';
        console.error(`[extract-travelshop] 未映射条件(按 skip 丢弃,扩词表): ${norm.slice(0, 90)}`);
      }
    }
    const assign = m[3].trim();
    const gm = assign.match(/^(\d+) \+ Main\.rand\.Next\((\d+)\)$/);
    let entry;
    if (gm) {
      // 单掷组条目（:1232-1234 `it = 2281 + Main.rand.Next(3)`）——一掷后组内均选
      // （运行时 pick() e.ids 均选,Game.ts:38299）；盘上手补权威=ids 数组形态
      entry = { ids: Array.from({ length: +gm[2] }, (_, i) => +gm[1] + i), tier: Number(m[1]), cond };
    } else {
      entry = { id: Number(assign), tier: Number(m[1]), cond };
      // hardModeUp：紧随嵌套 `if (Main.hardMode) { it = N; }`（:1168-1175 4347→4348,
      //   运行时 pick() hardMode 覆写 Game.ts:38300）
      const hm = body.slice(re.lastIndex).match(/^\s*if \(Main\.hardMode\)\s*\n\s*\{\s*\n\s*it = (\d+);\s*\n\s*\}/);
      if (hm) entry.hardModeUp = Number(hm[1]);
    }
    entries.push(entry);
  }
  // 锚 fail-loud：基数护栏（正则静默漏配=半表;1457 终值 items 66/paintings 31——
  //   BJ215 定谳现库值,BJ217 重产实证追平,地板抬到终值防半表回归）
  if (fnName === 'SetupTravelShop_GetItem' && entries.length < 66) {
    throw new Error(`[extract-travelshop] 锚点失配: GetItem 条目基数 ${entries.length} < 66（RollLuck 正则漏配,Chest.cs 漂移）`);
  }
  if (fnName === 'SetupTravelShop_GetPainting' && entries.length < 31) {
    throw new Error(`[extract-travelshop] 锚点失配: GetPainting 条目基数 ${entries.length} < 31（RollLuck 正则漏配,Chest.cs 漂移）`);
  }
  return entries;
}

const items = extractPool('SetupTravelShop_GetItem');
const paintings = extractPool('SetupTravelShop_GetPainting');

// ================= ★BJ215 era guard：干跑对拍 / --out 沙箱 / --write-real =================
const FRESH = JSON.stringify({ items, paintings, src: TREE });
// ★BJ261：探测注入面（SW_TRAVELSHOP_JSON,读侧现库重定向,守卫测试夹具专用）——
//   与 --write-real 混用拒（g1 footgun,探测与写盘分离=守卫被绕过洗库面）
const LIVE_JSON = process.env.SW_TRAVELSHOP_JSON ?? join(GAME_ROOT, 'src', 'data', 'vanilla-travelshop.json');
const outIdx = process.argv.indexOf('--out');
// ★M1 变异锚:干跑臂 null(守卫测试把 null 换成假现库路径,证明缺省零写盘是唯一拦截面)
const OUT_PATH = outIdx >= 0 ? process.argv[outIdx + 1] : null;
const WRITE_REAL = process.argv.includes('--write-real');
const FORCE_FULL = process.argv.includes('--force-full');
const OVERWRITE_APPEND_ERA = process.argv.includes('--overwrite-append-era');
if (OUT_PATH && WRITE_REAL) {
  console.error('[extract-travelshop] 拒绝运行：--out 与 --write-real 双旗互斥（输出通道必须唯一）。');
  console.error('  处置：沙箱对拍用 --out <path>；确认定谳后更新现库用 --write-real。');
  process.exit(1);
}
if (WRITE_REAL && process.env.SW_TRAVELSHOP_JSON !== undefined) {
  console.error('[extract-travelshop] 拒绝运行：探测注入面（SW_TRAVELSHOP_JSON）已设置而 --write-real 将写真实现库（fail-closed）。');
  console.error('  处置：对拍用探测 env（零写盘干跑）或 --out 沙箱；更新现库须清掉探测 env 再 --write-real。');
  process.exit(1);
}
/** 现库 vs 重产动态 diff：live-only=「现库有而重产无」的条目（键=id/ids 组+tier,值=整条
 *  JSON 等价）+ fresh-only=「重产有而现库无」现库退化面（★G-1/S3 处方:只算 live-only 的
 *  对拍闸对现库删条恒绿,双向才算「重产盖住现库」——缺键型=itemrare 同族,任一轴非空拒）。
 *  ★键含 tier：画作 5121-5124 在两池各有双 tier 档（BJ215 定谳）,单 id 键会塌缩互撞。 */
function washOf(liveRaw) {
  let live;
  try { live = JSON.parse(liveRaw); } catch { return null; } // 坏损:不拦
  const wash = { items: [], paintings: [], itemsFresh: [], paintingsFresh: [] };
  const keyOf = (e) => `${Array.isArray(e.ids) ? `g${e.ids.join(',')}` : `i${e.id}`}#${e.tier}`;
  const diffPool = (livePool, freshPool) => {
    const freshByKey = new Map(freshPool.map((e) => [keyOf(e), JSON.stringify(e)]));
    const out = [];
    for (const e of livePool) {
      const k = keyOf(e);
      if (!freshByKey.has(k)) out.push({ e, fresh: null });
      else if (freshByKey.get(k) !== JSON.stringify(e)) out.push({ e, fresh: JSON.parse(freshByKey.get(k)) });
    }
    return out;
  };
  const freshOnlyOf = (livePool, freshPool) => {
    const liveKeys = new Set(livePool.map(keyOf));
    return freshPool.filter((e) => !liveKeys.has(keyOf(e)));
  };
  wash.items = diffPool(live.items ?? [], items);
  wash.paintings = diffPool(live.paintings ?? [], paintings);
  wash.itemsFresh = freshOnlyOf(live.items ?? [], items);
  wash.paintingsFresh = freshOnlyOf(live.paintings ?? [], paintings);
  return wash;
}
const washEmpty = (w) => !w || (w.items.length === 0 && w.paintings.length === 0 && w.itemsFresh.length === 0 && w.paintingsFresh.length === 0);
const washReport = (w) => {
  console.error('  物证（live-only=现库领先面/重产整批回退面;fresh-only=现库退化缺键型面）：');
  for (const [label, pool] of [['items', w.items], ['paintings', w.paintings]]) {
    for (const { e, fresh } of pool.slice(0, 4)) {
      console.error(`    ${label} 现库 ${JSON.stringify(e)}${fresh === null ? '（重产缺此条）' : ` vs 重产 ${JSON.stringify(fresh)}`}`);
    }
    if (pool.length > 4) console.error(`    ${label} …共 ${pool.length} 条`);
  }
  for (const [label, pool] of [['items', w.itemsFresh], ['paintings', w.paintingsFresh]]) {
    if (pool.length) console.error(`    [fresh-only] ${label} 现库缺 ${pool.length} 条（如 ${pool.slice(0, 3).map((e) => JSON.stringify(e)).join(' | ')}）`);
  }
};
const liveRaw = existsSync(LIVE_JSON) ? readFileSync(LIVE_JSON, 'utf8') : null;
const wash = liveRaw === null ? null : washOf(liveRaw);
if (OUT_PATH || WRITE_REAL) {
  if (WRITE_REAL) {
    if (wash && !washEmpty(wash) && !(FORCE_FULL && OVERWRITE_APPEND_ERA)) {
      console.error('[extract-travelshop] 拒绝 --write-real：重产 diff 非纯增量（现库领先面非空）——禁止静默覆盖领先条目（BJ183 登记债:重产前先恢复提取器词表）。');
      washReport(wash);
      console.error('  确需原地强推：--force-full --overwrite-append-era 双旗（单旗仍拒）。');
      process.exit(1);
    }
    if (wash && !washEmpty(wash)) console.error('[extract-travelshop] 双旗强推：静默覆盖预警已确认——现库领先条目将被整批回退（责任在操作者定谳）。');
  }
  writeFileSync(WRITE_REAL ? LIVE_JSON : OUT_PATH, FRESH);
  console.error(`[extract-travelshop] 已写 ${WRITE_REAL ? LIVE_JSON : OUT_PATH}（${WRITE_REAL ? '--write-real 真库' : '--out 显式路径'}）`);
} else {
  // 缺省干跑对拍（零写盘）
  if (!liveRaw) {
    console.error('[extract-travelshop] 干跑（零写盘）：现库缺 vanilla-travelshop.json,跳过对拍。写盘须显式 --out <path> 或 --write-real。');
  } else if (wash && !washEmpty(wash)) {
    console.error('[extract-travelshop] 干跑对拍：双向 diff 非空（live-only=洗库预警 / fresh-only=现库退化缺键型）——零写盘。');
    washReport(wash);
    console.error('  活通道：逐值定谳（反编译为准）后 --write-real 定谳回写；沙箱试验用 --out <path>。');
    process.exit(1);
  } else {
    console.error('[extract-travelshop] 干跑对拍：重产盖住现库（双向零差,零写盘）。写盘须显式 --out <path> 或 --write-real。');
  }
}
console.log('items:', items.length, 'paintings:', paintings.length,
  '| skip:', [...items, ...paintings].filter((e) => e.cond === 'skip').length);

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
//     方法签名=fail-loud）。BJ215 定谳：盘上数据面领先于本器（4 items+9 paintings 带更
//     rich cond 词表 anyBossKill/hardModeUp/downed_4/downedMechBossAny/downed_398/
//     downedMartians + 多件组 2281-2283,66 条 vs 本器 65）——裸跑重产=整批回退,BJ183
//     登记债（重产前先恢复提取器词表）。
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

function extractPool(fnName) {
  const start = chest.indexOf(`public static void ${fnName}`);
  if (start < 0) throw new Error(`[extract-travelshop] 锚点失配: ${fnName} 未找到（Chest.cs 漂移,禁止静默空扫）`);
  const end = chest.indexOf('\n\tpublic static', start + 10);
  const body = chest.slice(start, end);
  const entries = [];
  // if (RollLuck(rarity[N]) == 0 [&& cond]) { it = X; }
  const re = /RollLuck\(rarity\[(\d)\]\) == 0(.*?)\)\s*\n\t*\{\s*\n\s*it = (\d+);/g;
  let m;
  while ((m = re.exec(body))) {
    let condText = m[2] ?? '';
    if (condText.startsWith(' &&')) condText = condText.slice(3).trim();
    // 条件文本 → 本作旗标 token；未知条件 → skip
    let cond = null;
    if (condText.includes('hardMode') && condText.includes('downedMechBoss')) cond = 'hardModeMech';
    else if (condText.includes('hardMode')) cond = 'hardMode';
    else if (condText.includes('downedBoss3')) cond = 'downedBoss3';
    else if (condText.includes('shadowOrbSmashed')) cond = 'shadowOrbSmashed';
    else if (condText.includes('downedMoonlord')) cond = 'downedMoonlord';
    else if (condText.includes('downedMartians')) cond = 'downedMartians';
    else if (condText.includes('downedFrost')) cond = 'downedFrost';
    else if (condText.includes('downedPirates')) cond = 'downedPirates';
    else if (condText.includes('downedGoblins')) cond = 'downedGoblins';
    else if (condText.includes('downedPlantBoss')) cond = 'downedPlantBoss';
    else if (condText.includes('dontStarveWorld')) cond = 'skip'; // 饥荒种子
    else if (condText) cond = 'skip';
    entries.push({ id: Number(m[3]), tier: Number(m[1]), cond });
  }
  // 锚 fail-loud：基数护栏（正则静默漏配=半表;现库 items 66/paintings 31,BJ215 定谳）
  if (fnName === 'SetupTravelShop_GetItem' && entries.length < 40) {
    throw new Error(`[extract-travelshop] 锚点失配: GetItem 条目基数 ${entries.length} < 40（RollLuck 正则漏配,Chest.cs 漂移）`);
  }
  if (fnName === 'SetupTravelShop_GetPainting' && entries.length < 20) {
    throw new Error(`[extract-travelshop] 锚点失配: GetPainting 条目基数 ${entries.length} < 20（RollLuck 正则漏配,Chest.cs 漂移）`);
  }
  return entries;
}

const items = extractPool('SetupTravelShop_GetItem');
const paintings = extractPool('SetupTravelShop_GetPainting');

// ================= ★BJ215 era guard：干跑对拍 / --out 沙箱 / --write-real =================
const FRESH = JSON.stringify({ items, paintings, src: TREE });
const LIVE_JSON = join(GAME_ROOT, 'src', 'data', 'vanilla-travelshop.json');
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
/** 现库 vs 重产动态 diff：「现库有而重产无」的条目（键=id/ids 组+tier,值=整条 JSON 等价）。
 *  ★键含 tier：画作 5121-5124 在两池各有双 tier 档（BJ215 定谳）,单 id 键会塌缩互撞。 */
function washOf(liveRaw) {
  let live;
  try { live = JSON.parse(liveRaw); } catch { return null; } // 坏损:不拦
  const wash = { items: [], paintings: [] };
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
  wash.items = diffPool(live.items ?? [], items);
  wash.paintings = diffPool(live.paintings ?? [], paintings);
  return wash;
}
const washEmpty = (w) => !w || (w.items.length === 0 && w.paintings.length === 0);
const washReport = (w) => {
  console.error('  物证（现库领先面——重产整批回退面/差异清单）：');
  for (const [label, pool] of [['items', w.items], ['paintings', w.paintings]]) {
    for (const { e, fresh } of pool.slice(0, 4)) {
      console.error(`    ${label} 现库 ${JSON.stringify(e)}${fresh === null ? '（重产缺此条）' : ` vs 重产 ${JSON.stringify(fresh)}`}`);
    }
    if (pool.length > 4) console.error(`    ${label} …共 ${pool.length} 条`);
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
    console.error('[extract-travelshop] 干跑对拍：检测到「现库有而重产无」的条目=洗库预警（裸跑重产=整批回退）——零写盘。');
    washReport(wash);
    console.error('  活通道：重产前先恢复提取器词表（BJ183 登记债）；沙箱试验用 --out <path>。');
    process.exit(1);
  } else {
    console.error('[extract-travelshop] 干跑对拍：重产盖住现库（零写盘）。写盘须显式 --out <path> 或 --write-real。');
  }
}
console.log('items:', items.length, 'paintings:', paintings.length,
  '| skip:', [...items, ...paintings].filter((e) => e.cond === 'skip').length);

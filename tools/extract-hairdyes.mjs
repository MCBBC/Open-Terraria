// 发色剂表提取器（DyeInitializer.cs LoadHairDyes/LoadLegacyHairdyes →
// src/data/vanilla-hairdyes.json）。
// ★BJ183 2026-09-20 基准对齐 1456→1457：DyeInitializer.cs 两版字节全等;Item.cs
// hairDye 面 diff=0,仅行号平移（+26/+397）——锚点行号同步重钉,对拍零漂移。
//
// 数据 1:1：GameShaders.Hair.BindShader(itemId, shaderData) 按【执行序】分配
// shaderId（HairShaderDataSet.BindShader:22 `++_shaderDataCount`，首条=1）。
// 执行序 = LoadHairDyes(:143-148) 先调 LoadLegacyHairdyes(:146) 再绑 3259(:147)：
//   legacy 11 条（1977-1986 + 2863）→ shaderId 1-11；3259 暮光 → 12。
// 物品侧判定（Item.cs）：ResetStats 置 hairDye=-1(:48964) → SetDefaultsN 后
//   `if (hairDye != 0) hairDye = Hair.GetShaderIdFromItemId(type)`(:48717-48719)
//   → 未绑定物品得 -1、发色剂得 1-12；case 1990 显式 hairDye=0(:21301) 跳过查表
//   → 1990 去除剂 hairDye=0。使用链 Player.cs:42179-42186 `item.hairDye >= 0`
//   即 1990 也在内（使用 → player.hairDye=0 = 清除）。
// 存档：Player.cs:53805-53808 hair 后写 byte、:54214-54216 release≥82 读。
//
// 不变量：legacy 绑定 11 条 + twilight 1 条 = 12；shaderId 1..12 无重复；
//   1977-1986 连续段门 + case 1990 标记 + Item.cs 尾钩三锚点逐字校验。
// 用法：node tools/extract-hairdyes.mjs [--audit]（缺省干跑对拍零写盘；--audit 只打印
//   JSON 摘要不落盘；写盘须显式 SW_OUT=<dir> 或 --write-real）
//
// ★BJ298 2026-09-23 era guard 落闸（四要素习语 docs/era-guard-family.md,BJ284 banners
//   同构;BJ261 续批排期②【洗库险·B 形】清偿——原缺省直写现库）：
//   ① SW_ITEM_VER 白名单 {1457,1458}（读域 DyeInitializer.cs 三版逐字节全等 b5422370 +
//     Item.cs 1457↔1458 全等 15ebd617,BJ298 亲核;1456 退役显式拒——Item.cs 行号锚 1457
//     系 BJ183 重钉,1456 回拍读时代快照）;缺省 1457;meta.source/itemSource 静态串;
//   ② 输出通道三分离：缺省=干跑对拍零写盘（双向路径级 diff——live-only=洗库预警/
//     fresh-only=现库退化缺键型,任一非空 exit 1+物证）/ SW_OUT=<dir>=沙箱 / --write-real=
//     写真库（diff 非纯增量拒,强推须 --force-full --overwrite-append-era 双旗）;SW_OUT 与
//     --write-real 双旗互斥;非 1457 禁写真库;探测注入面 SW_HAIRDYES_JSON 与 --write-real
//     混用拒（g1 footgun）;
//   ③ 锚 fail-loud：方法体缺失/五锚行/连续段/钉死抽查（原有 anomalies 硬校验,先于写盘）;
//   ④ 判别力自证：tests/extract-tables2-era-guard.test.ts（M1 摘干跑门/M3 摘 fresh-only 轴）。
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '..');
// ---- ★BJ298 era guard ①②：版本白名单 + 输出通道开关（对拍在文末落盘段） ----
const VER = process.env.SW_ITEM_VER ?? '1457';
const VER_ALLOWED = new Set(['1457', '1458']);
if (!VER_ALLOWED.has(VER) || !existsSync(join(ROOT, '..', `Terarria${VER}`, 'Terraria', 'Item.cs'))) {
  console.error(`[extract-hairdyes] 拒绝运行：SW_ITEM_VER="${VER}" 非法（白名单 ${[...VER_ALLOWED].join('/')}，且需存在 Terarria${VER}/ 反编译目录）。`);
  if (VER === '1456') console.error('  1456 锚集已退役（BJ183 基准对齐 1457,BJ298 落闸）；1456 回拍读时代快照。');
  process.exit(1);
}
const WRITE_REAL = process.argv.includes('--write-real');
const FORCE_FULL = process.argv.includes('--force-full');
const OVERWRITE_APPEND_ERA = process.argv.includes('--overwrite-append-era');
const SW_OUT = process.env.SW_OUT;
if (SW_OUT !== undefined && SW_OUT !== '' && WRITE_REAL) {
  console.error('[extract-hairdyes] 拒绝运行：SW_OUT 与 --write-real 双旗互斥（输出通道必须唯一）。');
  process.exit(1);
}
if (WRITE_REAL && VER !== '1457') {
  console.error(`[extract-hairdyes] 拒绝写真库：SW_ITEM_VER=${VER}≠1457（旧基线重放禁写 vanilla-hairdyes.json）。`);
  process.exit(1);
}
if (WRITE_REAL && process.env.SW_HAIRDYES_JSON !== undefined) {
  console.error('[extract-hairdyes] 拒绝运行：探测注入面（SW_HAIRDYES_JSON）已设置而 --write-real 将写真实现库（fail-closed）。');
  process.exit(1);
}
const DYE_CS = join(ROOT, '..', `Terarria${VER}`, 'Terraria.Initializers', 'DyeInitializer.cs');
const ITEM_CS = join(ROOT, '..', `Terarria${VER}`, 'Terraria', 'Item.cs');
const OUT = WRITE_REAL
  ? join(ROOT, 'src', 'data', 'vanilla-hairdyes.json')
  : (SW_OUT ? `${SW_OUT.replace(/\/+$/, '')}/vanilla-hairdyes.json` : null);
const LIVE_JSON = process.env.SW_HAIRDYES_JSON ?? join(ROOT, 'src', 'data', 'vanilla-hairdyes.json');

const audit = process.argv.includes('--audit');
const dye = readFileSync(DYE_CS, 'utf8');
const item = readFileSync(ITEM_CS, 'utf8');
const anomalies = [];

const lineOf = (text, needle) => {
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) if (lines[i].includes(needle)) return i + 1;
  return -1;
};

/** 切出方法体（`private static void NAME(` 起到下一个 `private static void` 前） */
function methodBody(src, name) {
  const start = src.indexOf(`private static void ${name}(`);
  if (start < 0) return null;
  const next = src.indexOf('\tprivate static void ', start + 10);
  return src.slice(start, next < 0 ? undefined : next);
}

/** 方法体内按源序收集 Hair.BindShader 的 itemId + 行号 + 数据类 */
function collectBinds(body, baseOffset) {
  const out = [];
  const re = /GameShaders\.Hair\.BindShader\(\s*(\d+)\s*,\s*new\s+(\w+)\(/g;
  let m;
  while ((m = re.exec(body))) {
    const before = body.slice(0, m.index);
    // 1 基行号：声明行起算 -1（before 以声明行残段开头，split 多出一段）
    out.push({
      itemId: +m[1],
      cls: m[2],
      line: baseOffset + before.split('\n').length - 1,
    });
  }
  return out;
}

const dyeLines = dye.split('\n');
const legacyBody = methodBody(dye, 'LoadLegacyHairdyes');
const hairBody = methodBody(dye, 'LoadHairDyes');
if (!legacyBody || !hairBody) throw new Error('LoadHairDyes/LoadLegacyHairdyes 方法体缺失');
const legacyOffset = dyeLines.findIndex((l) => l.includes('private static void LoadLegacyHairdyes(')) + 1;
const hairOffset = dyeLines.findIndex((l) => l.includes('private static void LoadHairDyes(')) + 1;

// 执行序：LoadLegacyHairdyes 全部条目（源序）→ LoadHairDyes 本体的 Bind（3259，:147）。
// LoadLegacyHairdyes 方法体【嵌在 LoadHairDyes 之后定义】——区分依据 = 行号：
// < legacyOffset（:150）的条目属于 LoadHairDyes 本体
const legacyBinds = collectBinds(legacyBody, legacyOffset);
const directBinds = collectBinds(hairBody, hairOffset).filter((b) => b.line < legacyOffset);

const ordered = [...legacyBinds, ...directBinds];
const table = {};
ordered.forEach((b, i) => {
  table[String(b.itemId)] = {
    shaderId: i + 1,
    kind: b.cls === 'LegacyHairShaderData' ? 'legacy' : b.cls === 'TwilightHairDyeShaderData' ? 'twilight' : b.cls,
    bindLine: b.line,
  };
});

// ---- 物品侧锚点（Item.cs）逐字校验 ----
const anchors = {
  rangeGate: ['\t\tif (type >= 1977 && type <= 1986)', 21236],
  removerCase: ['\t\tcase 1990:', 21293],
  removerMarker: ['\t\t\thairDye = 0;', 21301],
  tailHook: ['\t\t\thairDye = GameShaders.Hair.GetShaderIdFromItemId(type);', 48719],
  reset: ['\t\thairDye = -1;', 48964],
};
for (const [k, [needle, expect]] of Object.entries(anchors)) {
  const got = lineOf(item, needle);
  if (got !== expect) anomalies.push(`Item.cs 锚点 ${k} 行 ${got} ≠ ${expect}`);
}
// 1977-1986 十连：发色剂族恰好覆盖该连续段
for (let id = 1977; id <= 1986; id++) {
  if (!table[String(id)]) anomalies.push(`物品 ${id} 缺失（1977-1986 连续段）`);
}
// 三个散件：2863 火星 / 3259 暮光 / 1990 去除剂（1990 不绑 shader，hairDye=0）
for (const id of [2863, 3259]) {
  if (!table[String(id)]) anomalies.push(`物品 ${id} 缺失`);
}
// shaderId 唯一且 1..N
const ids = Object.values(table).map((e) => e.shaderId).sort((a, b) => a - b);
if (ids.join(',') !== Array.from({ length: ids.length }, (_, i) => i + 1).join(',')) {
  anomalies.push(`shaderId 非连续 1..N：${ids.join(',')}`);
}
// 钉死抽查（防源码漂移/解析错位）
const pinned = {
  1977: { shaderId: 1, kind: 'legacy' },   // LifeHairDye 首绑
  1980: { shaderId: 4, kind: 'legacy' },   // MoneyHairDye（buyPrice 段最长）
  2863: { shaderId: 11, kind: 'legacy' },  // MartianHairDye legacy 末条
  3259: { shaderId: 12, kind: 'twilight' }, // TwilightHairDyeShaderData 唯一非 legacy
};
for (const [id, want] of Object.entries(pinned)) {
  const got = table[id];
  if (!got || got.shaderId !== want.shaderId || got.kind !== want.kind) {
    anomalies.push(`钉死 ${id} 期望 ${JSON.stringify(want)} 实得 ${JSON.stringify(got)}`);
  }
}

const out = {
  meta: {
    source: 'Terarria1457/Terraria.Initializers/DyeInitializer.cs',
    itemSource: 'Terarria1457/Terraria/Item.cs',
    bindCount: ordered.length,
    legacyCount: legacyBinds.length,
    /** 发色剂去除剂（Item.cs:21275 hairDye=0 → Item.hairDye=0；使用即清 player.hairDye） */
    removerItem: 1990,
    entries: Object.keys(table).length,
    anchors: { loadHairDyes: 143, loadLegacyHairdyes: 150, twilightBind: 147 },
  },
  hairDyes: table,
};

if (audit) {
  process.stdout.write(JSON.stringify({ entries: out.meta.entries, bindCount: out.meta.bindCount, anomalies, pinned: table['1977'] && { '1977': table['1977'], '3259': table['3259'] } }) + '\n');
  process.exit(anomalies.length ? 1 : 0);
}
if (anomalies.length) {
  for (const a of anomalies) console.error(`ANOMALY: ${a}`);
  throw new Error(`锚点校验失败 ${anomalies.length} 处，拒绝写入`);
}

const sorted = {};
for (const k of Object.keys(table).map(Number).sort((a, b) => a - b)) sorted[k] = table[k];
out.hairDyes = sorted;
const json = JSON.stringify(out, null, 1) + '\n';

// ---- ★BJ298 era guard ②：干跑对拍 / 沙箱 / 逃生门（banners 同构 deepWash）----
/** 现库 vs 重产双向路径级 diff。live-only=洗库预警面 / fresh-only=现库退化缺键型面
 *  （★G-1/S3 处方）/ drift=同路径值漂移。 */
function deepWash(live, fresh, prefix = '') {
  const w = { liveOnly: [], freshOnly: [], drift: [] };
  const base = prefix || '<root>';
  if (live === null || fresh === null || typeof live !== 'object' || typeof fresh !== 'object') {
    if (JSON.stringify(live) !== JSON.stringify(fresh)) w.drift.push(`${base}: ${JSON.stringify(live)}→${JSON.stringify(fresh)}`);
    return w;
  }
  if (Array.isArray(live) !== Array.isArray(fresh)) {
    w.drift.push(`${base}: 类型漂移 ${Array.isArray(live) ? 'arr' : 'obj'}↔${Array.isArray(fresh) ? 'arr' : 'obj'}`);
    return w;
  }
  const lk = new Set(Object.keys(live));
  const fk = new Set(Object.keys(fresh));
  for (const k of Object.keys(live)) {
    const p = `${prefix}.${k}`;
    if (!fk.has(k)) { w.liveOnly.push(p); continue; }
    const sub = deepWash(live[k], fresh[k], p);
    w.liveOnly.push(...sub.liveOnly); w.freshOnly.push(...sub.freshOnly); w.drift.push(...sub.drift);
  }
  for (const k of Object.keys(fresh)) if (!lk.has(k)) w.freshOnly.push(`${prefix}.${k}`);
  return w;
}
const washEmpty = (v) => !v.liveOnly.length && !v.freshOnly.length && !v.drift.length;
function washReport(v) {
  console.error('  物证：');
  if (v.liveOnly.length) console.error(`    [live-only] 现库独有 ${v.liveOnly.length} 处（重产缺=提取器退化/洗库面）: ${v.liveOnly.slice(0, 6).join(', ')}`);
  if (v.freshOnly.length) console.error(`    [fresh-only] 重产独有 ${v.freshOnly.length} 处（现库缺=源侧新增/现库退化）: ${v.freshOnly.slice(0, 6).join(', ')}`);
  if (v.drift.length) console.error(`    [drift] 值漂移 ${v.drift.length}: ${v.drift.slice(0, 6).join(' | ')}`);
}
let live = null;
if (existsSync(LIVE_JSON)) { try { live = JSON.parse(readFileSync(LIVE_JSON, 'utf8')); } catch { /* 坏损:不拦（npcdrops 同款） */ } }
const wash = live === null ? null : deepWash(live, JSON.parse(json));
if (OUT) {
  if (WRITE_REAL && wash && !washEmpty(wash) && !(FORCE_FULL && OVERWRITE_APPEND_ERA)) {
    console.error('[extract-hairdyes] 拒绝 --write-real：重产 diff 非纯增量（双向差异非空）——先逐值定谳（反编译为准）再回写。');
    washReport(wash);
    console.error('  确需原地强推：--force-full --overwrite-append-era 双旗（单旗仍拒）。');
    process.exit(1);
  }
  mkdirSync(OUT.slice(0, OUT.lastIndexOf('/')), { recursive: true });
  writeFileSync(OUT, json);
  console.log(`vanilla-hairdyes.json 写入 ${OUT}（${WRITE_REAL ? '--write-real 真库' : 'SW_OUT 沙箱'}）${Object.keys(sorted).length} 条（shaderId 1..${Object.keys(sorted).length}）`);
} else if (wash === null) {
  console.error('[extract-hairdyes] 干跑（零写盘）：现库缺 vanilla-hairdyes.json,跳过对拍。写盘须显式 SW_OUT=<dir> 或 --write-real。');
} else if (!washEmpty(wash)) {
  console.error('[extract-hairdyes] 干跑对拍：双向 diff 非空（live-only=洗库预警 / fresh-only=现库退化缺键型）——零写盘。');
  washReport(wash);
  console.error('  处置：逐值定谳（反编译为准）后 --write-real 定谳回写；沙箱试验用 SW_OUT=<dir>。');
  process.exit(1);
} else {
  console.log(`vanilla-hairdyes.json 干跑对拍：重产盖住现库（双向零差,零写盘,${Object.keys(sorted).length} 条）。写盘须显式 SW_OUT=<dir> 或 --write-real。`);
}

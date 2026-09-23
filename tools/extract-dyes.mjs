// 染料表提取器（DyeInitializer.cs → src/data/vanilla-dyes.json）。
// 数据 1:1：BindShader(id, new XShaderData(ref, "TECH")).UseColor(r,g,b)
//   .UseSecondaryColor(r,g,b).UseSaturation(s)——全量逐条转录；
// LoadBasicColorDye 双重载（:11-34）：2 参版绑定 base/base+12(黑)/base+31(亮)/
//   base+44(银)（亮色 = c×0.5+0.5），4 参版显式 id。
// 不变量：BindShader 总数（84 = 直接条 + 助手展开）+ 表规模断言，防源码漂移。
// 用法：node tools/extract-dyes.mjs（缺省干跑对拍零写盘；写盘须显式通道）
//
// ★BJ298 2026-09-23 era guard 落闸（四要素习语 docs/era-guard-family.md,BJ284 banners
//   同构;BJ261 续批排期②【洗库险·B 形】清偿——原缺省直写现库）：
//   ① SW_ITEM_VER 白名单 {1457,1458}（读域 DyeInitializer.cs 三版逐字节全等
//     md5 b5422370,BJ298 亲核——1458 交叉重放天然 byte-perfect;1456 锚集退役显式拒+指引）;
//     缺省 1457（拍板#7A）;meta.source 静态串（BJ284 处方:动态模板串会令交叉重放假红）;
//   ② 输出通道三分离：缺省=干跑对拍零写盘（双向路径级 diff——live-only=洗库预警/
//     fresh-only=现库退化缺键型,任一非空 exit 1+物证）/ SW_OUT=<dir>=沙箱 / --write-real=
//     写真库（diff 非纯增量拒,强推须 --force-full --overwrite-append-era 双旗）;SW_OUT 与
//     --write-real 双旗互斥;非 1457 禁写真库;探测注入面 SW_DYES_JSON 与 --write-real
//     混用拒（g1 footgun）;
//   ③ 锚 fail-loud：BindShader 计数守恒+LoadBasicColorDye 12 条+六哨兵逐值（原有）;
//   ④ 判别力自证：tests/extract-tables2-era-guard.test.ts（M1 摘干跑门/M3 摘 fresh-only 轴）。
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '..');
// ---- ★BJ298 era guard ①②：版本白名单 + 输出通道开关（对拍在文末落盘段） ----
const VER = process.env.SW_ITEM_VER ?? '1457';
const VER_ALLOWED = new Set(['1457', '1458']);
if (!VER_ALLOWED.has(VER) || !existsSync(join(ROOT, '..', `Terarria${VER}`, 'Terraria.Initializers', 'DyeInitializer.cs'))) {
  console.error(`[extract-dyes] 拒绝运行：SW_ITEM_VER="${VER}" 非法（白名单 ${[...VER_ALLOWED].join('/')}，且需存在 Terarria${VER}/ 反编译目录）。`);
  if (VER === '1456') console.error('  1456 锚集已退役（2026-08-23 基准切 1457,BJ298 落闸）；1456 回拍读时代快照。');
  process.exit(1);
}
const WRITE_REAL = process.argv.includes('--write-real');
const FORCE_FULL = process.argv.includes('--force-full');
const OVERWRITE_APPEND_ERA = process.argv.includes('--overwrite-append-era');
const SW_OUT = process.env.SW_OUT;
if (SW_OUT !== undefined && SW_OUT !== '' && WRITE_REAL) {
  console.error('[extract-dyes] 拒绝运行：SW_OUT 与 --write-real 双旗互斥（输出通道必须唯一）。');
  process.exit(1);
}
if (WRITE_REAL && VER !== '1457') {
  console.error(`[extract-dyes] 拒绝写真库：SW_ITEM_VER=${VER}≠1457（旧基线重放禁写 vanilla-dyes.json）。`);
  process.exit(1);
}
if (WRITE_REAL && process.env.SW_DYES_JSON !== undefined) {
  console.error('[extract-dyes] 拒绝运行：探测注入面（SW_DYES_JSON）已设置而 --write-real 将写真实现库（fail-closed）。');
  process.exit(1);
}
const OUT = WRITE_REAL
  ? join(ROOT, 'src', 'data', 'vanilla-dyes.json')
  : (SW_OUT ? `${SW_OUT.replace(/\/+$/, '')}/vanilla-dyes.json` : null);
const LIVE_JSON = process.env.SW_DYES_JSON ?? join(ROOT, 'src', 'data', 'vanilla-dyes.json');
const SRC = join(ROOT, '..', `Terarria${VER}`, 'Terraria.Initializers', 'DyeInitializer.cs');

const src = readFileSync(SRC, 'utf8');

/** 解析单条 BindShader 链：id + 构造器 + 链式参数 */
function parseBind(stmt) {
  const idM = /BindShader\((\d+)/.exec(stmt);
  if (!idM) return null;
  const techM = /"(Armor\w+|ColorOnly)"/.exec(stmt);
  const colM = /\.UseColor\((-?[\d.]+)f?,\s*(-?[\d.]+)f?,\s*(-?[\d.]+)f?\)/.exec(stmt);
  const secM = /\.UseSecondaryColor\((-?[\d.]+)f?,\s*(-?[\d.]+)f?,\s*(-?[\d.]+)f?\)/.exec(stmt);
  const satM = /\.UseSaturation\((-?[\d.]+)f?\)/.exec(stmt);
  return {
    id: +idM[1],
    tech: techM?.[1] ?? null,
    color: colM ? [+colM[1], +colM[2], +colM[3]] : undefined,
    secondary: secM ? [+secM[1], +secM[2], +secM[3]] : undefined,
    saturation: satM ? +satM[1] : undefined,
  };
}

/** 一段连续 BindShader 语句（含续行）切分 */
function iterBinds(body) {
  const out = [];
  const re = /GameShaders\.Armor\.BindShader\([\s\S]*?\)(?=\s*;)/g;
  let m;
  while ((m = re.exec(body))) out.push(m[0].replace(/\s+/g, ' '));
  return out;
}

const table = {};
let directCount = 0;
for (const stmt of iterBinds(src)) {
  const b = parseBind(stmt);
  if (!b) continue;                        // 助手体内形参版本（baseDyeItem 等）跳过
  if (!b.tech) throw new Error(`BindShader 解析失败: ${stmt}`);
  table[b.id] = { tech: b.tech };
  if (b.color) table[b.id].color = b.color;
  if (b.secondary) table[b.id].secondary = b.secondary;
  if (b.saturation !== undefined) table[b.id].saturation = b.saturation;
  directCount++;
}

// ---- LoadBasicColorDye 展开（先于 BindShader 计数剥离助手体内的 4 条 Bind）----
// 助手体内的 4 条 BindShader 已被上面计入 directCount——按源序它们属于首次出现，
// 与显式 id 相同的条目会被直接条覆盖（2874-2877 显式四参版在后，参数一致 → 无害）。
// 2 参助手调用展开：
const callRe = /LoadBasicColorDye\((\d+),\s*(-?[\d.]+)f?,\s*(-?[\d.]+)f?,\s*(-?[\d.]+)f?(?:,\s*([\d.]+)f?)?(?:,\s*(\d+))?\);/g;
let m2;
const basic = [];
while ((m2 = callRe.exec(src))) {
  const base = +m2[1];
  const c = [+m2[2], +m2[3], +m2[4]];
  const sat = m2[5] !== undefined ? +m2[5] : 1;
  basic.push({ base, c, sat, old: m2[6] ? +m2[6] : undefined });
}
// 展开规则（:16-19 + :26-29）：base=ArmorColored、base+12=AndBlack、
// base+31=ArmorColored（亮色 c×0.5+0.5）、base+44=AndSilverTrim
for (const e of basic) {
  const set = (id, tech, c) => {
    table[id] = { tech, color: c, saturation: e.sat };
  };
  set(e.base, 'ArmorColored', e.c);
  set(e.base + 12, 'ArmorColoredAndBlack', e.c);
  set(e.base + 31, 'ArmorColored', e.c.map((v) => v * 0.5 + 0.5));
  set(e.base + 44, 'ArmorColoredAndSilverTrim', e.c);
}

// ---- 不变量 ----
// 源文件字面 BindShader 数 = 助手体内 4（形参版，跳过）+ 数字 id 直接条
const literalBinds = (src.match(/GameShaders\.Armor\.BindShader\(/g) || []).length;
if (directCount !== literalBinds - 4) throw new Error(`BindShader 直接条 ${directCount} ≠ 字面 ${literalBinds}−4`);
// 2 参助手调用数（1007-1018 共 12 条）
if (basic.length !== 12) throw new Error(`LoadBasicColorDye 2参调用 ${basic.length} ≠ 12`);
// 抽查锚点
const anchors = {
  1007: ['ArmorColored', [1, 0, 0]],
  1018: ['ArmorColored', [1, 0.1, 0.5]],
  1031: ['ArmorColoredGradient', [1, 0, 0]],
  3558: ['ArmorBrightnessColored', [1.5, 1.5, 1.5]],
  4778: ['ArmorHallowBoss', null],
  3026: ['ArmorReflectiveColor', null],
};
for (const [id, [tech, color]] of Object.entries(anchors)) {
  const t = table[+id];
  if (!t) throw new Error(`锚点 ${id} 缺失`);
  if (t.tech !== tech) throw new Error(`锚点 ${id} 技术 ${t.tech} ≠ ${tech}`);
  if (color && JSON.stringify(t.color) !== JSON.stringify(color)) {
    throw new Error(`锚点 ${id} 色 ${JSON.stringify(t.color)} ≠ ${JSON.stringify(color)}`);
  }
}

const sorted = {};
for (const k of Object.keys(table).map(Number).sort((a, b) => a - b)) sorted[k] = table[k];

const out = {
  meta: {
    source: 'Terarria1457/Terraria.Initializers/DyeInitializer.cs',
    directBindCount: directCount,
    basicFamilyCalls: basic.length,
    entries: Object.keys(sorted).length,
  },
  dyes: sorted,
};
const json = JSON.stringify(out, null, 1) + '\n';

// ---- ★BJ298 era guard ②：干跑对拍 / 沙箱 / 逃生门（banners 同构 deepWash）----
/** 现库 vs 重产双向路径级 diff。live-only=洗库预警面 / fresh-only=现库退化缺键型面
 *  （★G-1/S3 处方:只算 live-only 的对拍闸对源侧删除恒绿）/ drift=同路径值漂移。 */
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
    console.error('[extract-dyes] 拒绝 --write-real：重产 diff 非纯增量（双向差异非空）——先逐值定谳（反编译为准）再回写。');
    washReport(wash);
    console.error('  确需原地强推：--force-full --overwrite-append-era 双旗（单旗仍拒）。');
    process.exit(1);
  }
  mkdirSync(OUT.slice(0, OUT.lastIndexOf('/')), { recursive: true });
  writeFileSync(OUT, json);
  console.log(`vanilla-dyes.json 写入 ${OUT}（${WRITE_REAL ? '--write-real 真库' : 'SW_OUT 沙箱'}）${Object.keys(sorted).length} 条（直接 ${directCount} + 基础族展开）`);
} else if (wash === null) {
  console.error('[extract-dyes] 干跑（零写盘）：现库缺 vanilla-dyes.json,跳过对拍。写盘须显式 SW_OUT=<dir> 或 --write-real。');
} else if (!washEmpty(wash)) {
  console.error('[extract-dyes] 干跑对拍：双向 diff 非空（live-only=洗库预警 / fresh-only=现库退化缺键型）——零写盘。');
  washReport(wash);
  console.error('  处置：逐值定谳（反编译为准）后 --write-real 定谳回写；沙箱试验用 SW_OUT=<dir>。');
  process.exit(1);
} else {
  console.log(`vanilla-dyes.json 干跑对拍：重产盖住现库（双向零差,零写盘,${Object.keys(sorted).length} 条）。写盘须显式 SW_OUT=<dir> 或 --write-real。`);
}

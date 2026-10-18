// 一次性提取器:指针交互图标依赖的四张 style→item 表
// (WorldGen.Get{ItemDrop_Beds,ItemDrop_Candles,ItemDrop_Chests,ItemDrop_Dressers})
// + Chest.Initialize 覆写 → src/data/vanilla-hovericons.json。
// 解析 = switch-case 机械转录(含穿透 fallthrough 区间与嵌套 default)。
//
// ★BJ284 2026-09-22 era guard 落闸（四要素习语 docs/era-guard-family.md）：
//   ① SW_ITEM_VER 缺省 1457（白名单 {1457,1458}——BJ284 定谳 1458 交叉重放 fresh 与现库
//     逐字节零差；1456 显式拒+指引）;② 输出通道三分离：缺省=干跑对拍零写盘（双向路径级
//     diff,live-only=洗库预警/fresh-only=现库退化缺键型,任一非空 exit 1+物证）/ SW_OUT=沙箱 /
//     --write-real=逃生门（diff 非纯增量拒,强推双旗 --force-full --overwrite-append-era）；
//     双旗互斥+非 1457 禁写+探测注入面 SW_HOVERICONS_JSON 与 --write-real 混用拒（g1）;
//   ③ 锚 fail-loud：六方法体签名（methodBody 原有 throw）+基数护栏
//     （beds 55/candles 60/dressers 61/chests 52+37/chairs 68/pylons 11）;
//   ④ 判别力自证：tests/extract-tables-era-guard.test.ts。
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';

const ROOT = process.env.SW_PROJECT_ROOT ?? new URL('../../', import.meta.url).pathname.replace(/\/+$/, '');   // ★C档可移植:game/ 父目录(反编译树/TEdit/Calamity 源所在)
const VER = process.env.SW_ITEM_VER ?? '1457';
const VER_ALLOWED = new Set(['1457', '1458']);
if (!VER_ALLOWED.has(VER) || !existsSync(`${ROOT}/Terarria${VER}/Terraria/WorldGen.cs`)) {
  console.error(`[extract-cursor-icon-tables] 拒绝运行：SW_ITEM_VER="${VER}" 非法（白名单 ${[...VER_ALLOWED].join('/')}，且需存在 Terarria${VER}/ 反编译目录）。`);
  if (VER === '1456') console.error('  1456 锚集已退役（1457 基准 BJ284 落闸）；1456 对拍读时代快照。');
  process.exit(1);
}
const WRITE_REAL = process.argv.includes('--write-real');
const FORCE_FULL = process.argv.includes('--force-full');
const OVERWRITE_APPEND_ERA = process.argv.includes('--overwrite-append-era');
const SW_OUT = process.env.SW_OUT;
if (SW_OUT !== undefined && SW_OUT !== '' && WRITE_REAL) {
  console.error('[extract-cursor-icon-tables] 拒绝运行：SW_OUT 与 --write-real 双旗互斥（输出通道必须唯一）。');
  process.exit(1);
}
if (WRITE_REAL && VER !== '1457') {
  console.error(`[extract-cursor-icon-tables] 拒绝写真库：SW_ITEM_VER=${VER}≠1457（旧基线重放禁写 vanilla-hovericons.json）。`);
  process.exit(1);
}
if (WRITE_REAL && process.env.SW_HOVERICONS_JSON !== undefined) {
  console.error('[extract-cursor-icon-tables] 拒绝运行：探测注入面（SW_HOVERICONS_JSON）已设置而 --write-real 将写真实现库（fail-closed）。');
  process.exit(1);
}
// ★M1 变异锚:干跑臂 null（守卫测试把 null 换成假现库路径,证明缺省零写盘是唯一拦截面）
const LIVE_JSON = process.env.SW_HOVERICONS_JSON ?? `${ROOT}/game/src/data/vanilla-hovericons.json`;
const OUT_JSON = WRITE_REAL ? LIVE_JSON : (SW_OUT ? `${SW_OUT.replace(/\/+$/, '')}/vanilla-hovericons.json` : null);

const src = readFileSync(`${ROOT}/Terarria${VER}/Terraria/WorldGen.cs`, 'utf8');

/** 取方法体(花括号配平) */
function methodBody(name) {
  const idx = src.indexOf(name);
  if (idx < 0) throw new Error(name + ' 未找到');
  const start = src.indexOf('{', idx);
  let d = 0;
  for (let i = start; i < src.length; i++) {
    if (src[i] === '{') d++;
    else if (src[i] === '}') { d--; if (d === 0) return src.slice(start + 1, i); }
  }
  throw new Error(name + ' 体未闭合');
}

/** switch 文本 → {style: value}。识别:
 *  - `case N: ... result = X;`(可穿透:多个 case 共享一个 result)
 *  - `result = C + style` / `result = C + style - K` 算式
 *  - 嵌套内层 switch 同法(递归) */
function parseSwitch(body, resultVar = 'result') {
  const out = {};
  const caseRe = /case (\d+):/g;
  const matches = [...body.matchAll(caseRe)];
  for (let k = 0; k < matches.length; k++) {
    const from = matches[k].index + matches[k][0].length;
    const to = k + 1 < matches.length ? matches[k + 1].index : body.length;
    const seg = body.slice(from, to);
    // 段内首个赋值(穿透 case 的段在下一 case 前找到自己的赋值;
    // 若本段无赋值则与下一段共享——由下一段处理时回填,这里先记 null)
    let val = null;
    const direct = seg.match(new RegExp(`${resultVar} = (\\d+);`));
    // 算式两种朝向:`style + 643` / `2045 + style - 4`
    const f1 = seg.match(new RegExp(`${resultVar} = style \\+ (\\d+);`));
    const f2 = seg.match(new RegExp(`${resultVar} = (\\d+) \\+ style(?: - (\\d+))?;`));
    // 段内还有嵌套 switch(default:) → 递归并入(穿透 case 到 default 的段会被
    // 嵌套 case 切开;嵌套外的本层 case 若无赋值 = 'prev')
    const nested = /default:/.test(seg) && /switch \(style\)/.test(seg) ? parseSwitch(seg, resultVar) : null;
    if (direct) val = +direct[1];
    else if (f1) val = { base: +f1[1], off: 0, styleFirst: true };
    else if (f2) val = { base: +f2[1], off: f2[2] ? +f2[2] : 0 };
    else if (/break;/.test(seg)) val = 'prev';
    if (nested) out.__nested = nested;
    out[+matches[k][1]] = val;
  }
  return out;
}

/** 算式展开:case N 的 {base,off} → base + N - off;styleFirst → N + base。
 *  C# 穿透向下:case 1/2/3 共享 `style+643` 段时**各自代入自己的 style**(644/645/646)
 *  ——回填传递的是公式对象而非算好的值;穿透遇到直接量则同值 */
function expand(map, defaultVal) {
  const raw = {};
  const keys = Object.keys(map).filter((k) => k !== '__nested').map(Number).sort((a, b) => a - b);
  for (const n of keys) {
    const v = map[n];
    raw[n] = (typeof v === 'object' && v !== null) || typeof v === 'number' ? v : null;
  }
  const evalAt = (v, n) => typeof v === 'object' ? (v.styleFirst ? n + v.base : v.base + n - v.off) : v;
  const out = {};
  let carry = defaultVal;   // number | formula
  for (let i = keys.length - 1; i >= 0; i--) {
    const n = keys[i];
    if (raw[n] !== null) { out[n] = evalAt(raw[n], n); carry = raw[n]; }
    else out[n] = evalAt(carry, n);
  }
  if (map.__nested) Object.assign(out, expand(map.__nested, defaultVal));
  return out;
}

const beds = expand(parseSwitch(methodBody('public static int GetItemDrop_Beds')), 224);
const candles = expand(parseSwitch(methodBody('public static int GetItemDrop_Candles')), 105);
const dressers = expand(parseSwitch(methodBody('public static int GetItemDrop_Dressers')), 334);
// Chests:双表(secondType 3884 基/普通 48 基)——按 secondType 参数拆段
const chestsBody = methodBody('public static int GetItemDrop_Chests');
const secondSeg = chestsBody.slice(chestsBody.indexOf('if (secondType)'), chestsBody.indexOf('else', chestsBody.indexOf('if (secondType)')));
const firstSeg = chestsBody.slice(chestsBody.indexOf('else', chestsBody.indexOf('if (secondType)')));
const chests2 = expand(parseSwitch(secondSeg, 'num'), 3884);
const chests1 = expand(parseSwitch(firstSeg, 'num'), 48);
// Chest.Initialize 覆写(Chest.cs:224-251)
const chestSrc = readFileSync(`${ROOT}/Terarria1457/Terraria/Chest.cs`, 'utf8');
const init = chestSrc.slice(chestSrc.indexOf('public static void Initialize'), chestSrc.indexOf('public static bool IsPlayerInChest'));
for (const m of init.matchAll(/array\[(\d+)\] = (\d+);/g)) chests1[+m[1]] = +m[2];
for (const m of init.matchAll(/array2\[(\d+)\] = (\d+);/g)) chests2[+m[1]] = +m[2];

const data = {
  beds, candles, dressers,
  chests: chests1, chests2,
  // GetItemDrop_Chair(椅子 :33444 悬停表;`return X;` 与 `result = X;` 双写法混排)
  chairs: (() => {
    const body = methodBody('public static int GetItemDrop_Chair');
    const out = {};
    const caseRe = /case (\d+):/g;
    const ms = [...body.matchAll(caseRe)];
    for (let k = 0; k < ms.length; k++) {
      const from = ms[k].index + ms[k][0].length;
      const to = k + 1 < ms.length ? ms[k + 1].index : body.length;
      const seg = body.slice(from, to);
      const n = +ms[k][1];
      const dir = seg.match(/(?:return|result =) (\d+);/);
      const fm = seg.match(/(?:return|result =) (\d+) \+ style - (\d+);/);
      const fs = seg.match(/(?:return|result =) style \+ (\d+);/);
      if (fm) out[n] = { base: +fm[1], off: +fm[2] };
      else if (fs) out[n] = { base: +fs[1], off: 0, styleFirst: true };
      else if (dir) out[n] = +dir[1];
      else out[n] = '__next__';
    }
    // 穿透向下:无赋值 case 取下一 case 的值/【公式】(各自代入自己的 style)
    const keys = Object.keys(out).map(Number).sort((a, b) => a - b);
    let carry = 34;
    for (let i = keys.length - 1; i >= 0; i--) {
      if (out[keys[i]] === '__next__') out[keys[i]] = carry;
      else carry = out[keys[i]];
    }
    for (const n of keys) {
      const v = out[n];
      if (typeof v === 'object' && v !== null) out[n] = v.styleFirst ? n + v.base : v.base + n - v.off;
    }
    if (out[0] === undefined || out[0] === '__next__') out[0] = 34;
    return out;
  })(),
  // TETeleportationPylon.GetPylonItemTypeFromTileStyle(:116-129)
  pylons: { 0: 4876, 1: 4875, 2: 4916, 3: 4917, 4: 4918, 5: 4919, 6: 4920, 7: 4921, 8: 4951, 9: 5652, 10: 5653 },
};

// ---- ③ 基数护栏（1457 实测——地板防静默半表） ----
{
  const floors = [
    ['beds', Object.keys(beds).length, 50],
    ['candles', Object.keys(candles).length, 55],
    ['dressers', Object.keys(dressers).length, 55],
    ['chests', Object.keys(chests1).length, 48],
    ['chests2', Object.keys(chests2).length, 33],
    ['chairs', Object.keys(data.chairs).length, 60],
    ['pylons', Object.keys(data.pylons).length, 11],
  ];
  const bad = floors.filter(([, n, f]) => n < f).map(([k, n, f]) => `${k} ${n} < ${f}`);
  if (bad.length) throw new Error(`[extract-cursor-icon-tables] 锚点失配: 基数护栏 ${bad.join('; ')}（解析面漂移,禁止静默半表）`);
}

// ================= ★BJ284 era guard：干跑对拍 / 沙箱 / 逃生门（头注见上） =================
const FRESH = JSON.stringify(data);
/** 现库 vs 重产双向路径级 diff（对象键集+叶值;数组按位）。live-only=洗库预警面 /
 *  fresh-only=现库退化缺键型面（★G-1/S3 处方）/ drift=同路径值漂移。 */
function deepWash(live, fresh, prefix = '') {
  const out = { liveOnly: [], freshOnly: [], drift: [] };
  const base = prefix || '<root>';
  if (live === null || fresh === null || typeof live !== 'object' || typeof fresh !== 'object') {
    if (JSON.stringify(live) !== JSON.stringify(fresh)) out.drift.push(`${base}: ${JSON.stringify(live)}→${JSON.stringify(fresh)}`);
    return out;
  }
  if (Array.isArray(live) !== Array.isArray(fresh)) {
    out.drift.push(`${base}: 类型漂移 ${Array.isArray(live) ? 'arr' : 'obj'}↔${Array.isArray(fresh) ? 'arr' : 'obj'}`);
    return out;
  }
  const lk = new Set(Object.keys(live));
  const fk = new Set(Object.keys(fresh));
  for (const k of Object.keys(live)) {
    const p = `${prefix}.${k}`;
    if (!fk.has(k)) { out.liveOnly.push(p); continue; }
    const w = deepWash(live[k], fresh[k], p);
    out.liveOnly.push(...w.liveOnly); out.freshOnly.push(...w.freshOnly); out.drift.push(...w.drift);
  }
  for (const k of Object.keys(fresh)) if (!lk.has(k)) out.freshOnly.push(`${prefix}.${k}`);
  return out;
}
const washEmpty = (w) => !w.liveOnly.length && !w.freshOnly.length && !w.drift.length;
function washReport(w) {
  console.error('  物证：');
  if (w.liveOnly.length) console.error(`    [live-only] 现库独有 ${w.liveOnly.length} 处（重产缺=提取器退化/洗库面）: ${w.liveOnly.slice(0, 6).join(', ')}`);
  if (w.freshOnly.length) console.error(`    [fresh-only] 重产独有 ${w.freshOnly.length} 处（现库缺=源侧新增/现库退化）: ${w.freshOnly.slice(0, 6).join(', ')}`);
  if (w.drift.length) console.error(`    [drift] 值漂移 ${w.drift.length}: ${w.drift.slice(0, 6).join(' | ')}`);
}
let live = null;
if (existsSync(LIVE_JSON)) { try { live = JSON.parse(readFileSync(LIVE_JSON, 'utf8')); } catch { /* 坏损:不拦（npcdrops 同款） */ } }
const wash = live === null ? null : deepWash(live, JSON.parse(FRESH));
if (OUT_JSON) {
  if (WRITE_REAL && wash && !washEmpty(wash) && !(FORCE_FULL && OVERWRITE_APPEND_ERA)) {
    console.error('[extract-cursor-icon-tables] 拒绝 --write-real：重产 diff 非纯增量（双向差异非空）——先逐值定谳（反编译为准）再回写。');
    washReport(wash);
    console.error('  确需原地强推：--force-full --overwrite-append-era 双旗（单旗仍拒）。');
    process.exit(1);
  }
  mkdirSync(OUT_JSON.slice(0, OUT_JSON.lastIndexOf('/')), { recursive: true });
  writeFileSync(OUT_JSON, FRESH);
  console.error(`[extract-cursor-icon-tables] 已写 ${OUT_JSON}（${WRITE_REAL ? '--write-real 真库' : 'SW_OUT 沙箱'}）`);
} else if (wash === null) {
  console.error('[extract-cursor-icon-tables] 干跑（零写盘）：现库缺 vanilla-hovericons.json,跳过对拍。写盘须显式 SW_OUT=<dir> 或 --write-real。');
} else if (!washEmpty(wash)) {
  console.error('[extract-cursor-icon-tables] 干跑对拍：双向 diff 非空（live-only=洗库预警 / fresh-only=现库退化缺键型）——零写盘。');
  washReport(wash);
  console.error('  处置：逐值定谳（反编译为准）后 --write-real 定谳回写；沙箱试验用 SW_OUT=<dir>。');
  process.exit(1);
} else {
  console.error('[extract-cursor-icon-tables] 干跑对拍：重产盖住现库（双向零差,零写盘）。写盘须显式 SW_OUT=<dir> 或 --write-real。');
}
const n = (o) => Object.keys(o).length;
console.log(`beds ${n(beds)} / candles ${n(candles)} / dressers ${n(dressers)} / chests ${n(chests1)}+${n(chests2)}`);
console.log('beds[1..3]:', beds[1], beds[2], beds[3], '(应 644/645/646)');
console.log('chests1[2]:', chests1[2], '(覆写后应 327); [23]:', chests1[23], '(应 1533)');
console.log('dressers[5]:', dressers[5], '(应 2386); [4]:', dressers[4], '(应 918)');

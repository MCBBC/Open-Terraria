// 提取原版 tileSolid / tileSolidTop 全表（Main.cs 全部赋值 + for 循环段展开）+
// TileID.Sets.Platforms + TileID 名字 → src/data/vanilla-tilecollision.json。
// 供 tests/tile-collision-parity.test.ts 双向对账（通行性审计唯一真值源）。
// 用法：node tools/extract-tile-collision.mjs
//
// ★BJ284 2026-09-22 era guard 落闸（四要素习语 docs/era-guard-family.md）：
//   ① SW_ITEM_VER 缺省 1457（白名单 {1457,1458}——BJ284 定谳 1458 交叉重放 fresh 与现库
//     逐字节零差；1456 显式拒+指引）;② 输出通道三分离：缺省=干跑对拍零写盘（双向路径级
//     diff,live-only=洗库预警/fresh-only=现库退化缺键型,任一非空 exit 1+物证）/ SW_OUT=沙箱 /
//     --write-real=逃生门（diff 非纯增量拒,强推双旗 --force-full --overwrite-append-era）；
//     双旗互斥+非 1457 禁写+探测注入面 SW_TILECOLLISION_JSON 与 --write-real 混用拒（g1）;
//   ③ 锚 fail-loud：Platforms CreateBoolSet 字面量（原 if(m) 静默空集反模式已修）+基数护栏
//     （solid 324/solidTop 84/platforms 7）;④ 判别力自证：tests/extract-tables-era-guard.test.ts。
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';

// 仓库根 = game/tools/ 上两级（game/ 的父目录）
const ROOT = new URL('../../', import.meta.url).pathname;
const VER = process.env.SW_ITEM_VER ?? '1457';
const VER_ALLOWED = new Set(['1457', '1458']);
if (!VER_ALLOWED.has(VER) || !existsSync(`${ROOT}Terarria${VER}/Terraria/Main.cs`)) {
  console.error(`[extract-tile-collision] 拒绝运行：SW_ITEM_VER="${VER}" 非法（白名单 ${[...VER_ALLOWED].join('/')}，且需存在 Terarria${VER}/ 反编译目录）。`);
  if (VER === '1456') console.error('  1456 锚集已退役（1457 基准 BJ284 落闸）；1456 对拍读时代快照。');
  process.exit(1);
}
const WRITE_REAL = process.argv.includes('--write-real');
const FORCE_FULL = process.argv.includes('--force-full');
const OVERWRITE_APPEND_ERA = process.argv.includes('--overwrite-append-era');
const SW_OUT = process.env.SW_OUT;
if (SW_OUT !== undefined && SW_OUT !== '' && WRITE_REAL) {
  console.error('[extract-tile-collision] 拒绝运行：SW_OUT 与 --write-real 双旗互斥（输出通道必须唯一）。');
  process.exit(1);
}
if (WRITE_REAL && VER !== '1457') {
  console.error(`[extract-tile-collision] 拒绝写真库：SW_ITEM_VER=${VER}≠1457（旧基线重放禁写 vanilla-tilecollision.json）。`);
  process.exit(1);
}
if (WRITE_REAL && process.env.SW_TILECOLLISION_JSON !== undefined) {
  console.error('[extract-tile-collision] 拒绝运行：探测注入面（SW_TILECOLLISION_JSON）已设置而 --write-real 将写真实现库（fail-closed）。');
  process.exit(1);
}
// ★M1 变异锚:干跑臂 null（守卫测试把 null 换成假现库路径,证明缺省零写盘是唯一拦截面）
// （LIVE_JSON 由 import.meta.url 派生=cwd 免疫;守卫测试 mutant 以 ROOT_TRIGGER 前置重锚）
const LIVE_JSON = process.env.SW_TILECOLLISION_JSON ?? new URL('../src/data/vanilla-tilecollision.json', import.meta.url).pathname;
const OUT_JSON = WRITE_REAL ? LIVE_JSON : (SW_OUT ? `${SW_OUT.replace(/\/+$/, '')}/vanilla-tilecollision.json` : null);

const main = readFileSync(`${ROOT}Terarria${VER}/Terraria/Main.cs`, 'utf8');
const tileId = readFileSync(`${ROOT}Terarria${VER}/Terraria.ID/TileID.cs`, 'utf8');

// ---- TileID 名字表 ----
const names = {};
for (const m of tileId.matchAll(/public const ushort (\w+) = (\d+);/g)) {
  names[+m[2]] = m[1];
}

// ---- Platforms 集（Factory.CreateBoolSet）----
const platformIds = new Set();
{
  const m = tileId.match(/Platforms = Factory\.CreateBoolSet\(([^)]*)\)/);
  if (!m) throw new Error('[extract-tile-collision] 锚点失配: TileID.cs Platforms = Factory.CreateBoolSet 未找到（源码漂移,禁止静默空集）');
  for (const part of m[1].split(',')) {
    const id = +part.trim();
    if (Number.isFinite(id)) platformIds.add(id);
  }
}

// ---- 展开全部赋值（含 for 循环体）----
const solid = new Map();
const solidTop = new Map();
const setVal = (arr, id, v, where) => {
  const prev = arr.get(id);
  if (prev !== undefined && prev.v !== v) {
    console.warn(`! id ${id} 双写冲突 ${prev.v}(${prev.where}) → ${v}(${where})，取后值`);
  }
  arr.set(id, { v, where });
};
{
  // 0) 行化
  const lines = main.split('\n');
  // 1) 记录全部循环区间
  const loops = [];
  for (let ln = 0; ln < lines.length; ln++) {
    const fm = lines[ln].match(/for \((?:int|ushort) (\w+) = (\d+); \1 <= (\d+); \1\+\+\)/);
    if (!fm) continue;
    let bal = 0, started = false, end = ln;
    for (let k = ln; k < Math.min(lines.length, ln + 80); k++) {
      for (const ch of lines[k]) {
        if (ch === '{') { bal++; started = true; }
        else if (ch === '}') bal--;
      }
      if (started && bal <= 0) { end = k; break; }
    }
    loops.push({ varName: fm[1], from: +fm[2], to: +fm[3], start: ln, end });
  }
  // 2) 逐行赋值；变量下标 → 找覆盖该行的最内层同名循环展开
  for (let ln = 0; ln < lines.length; ln++) {
    const line = lines[ln];
    for (const arr of [solid, solidTop]) {
      const re = arr === solid ? /\btileSolid\[(\w+)\] = (true|false);/g : /\btileSolidTop\[(\w+)\] = (true|false);/g;
      for (const m of line.matchAll(re)) {
        const idTok = m[1], v = m[2] === 'true';
        if (/^\d+$/.test(idTok)) {
          setVal(arr, +idTok, v, `L${ln + 1}`);
        } else {
          const loop = loops.filter((l) => l.varName === idTok && ln >= l.start && ln <= l.end)
            .sort((a, b) => (b.start - a.start) || (a.end - b.end))[0];   // 最内层
          if (!loop) { console.warn(`! L${ln + 1} 循环变量 ${idTok} 无归属，跳过: ${line.trim()}`); continue; }
          for (let id = loop.from; id <= loop.to; id++) setVal(arr, id, v, `L${ln + 1} loop`);
        }
      }
    }
  }
}

// ---- 汇总输出 ----
const maxId = Math.max(...[...solid.keys(), ...solidTop.keys(), ...platformIds]);
const out = [];
for (let id = 0; id <= maxId; id++) {
  const s = solid.get(id)?.v ?? false;
  const st = solidTop.get(id)?.v ?? false;
  if (!s && !st && !platformIds.has(id)) continue;
  out.push({
    id, name: names[id] ?? `Tile_${id}`,
    solid: s, solidTop: st, platform: platformIds.has(id),
  });
}
const dest = OUT_JSON;
// ---- ③ 基数护栏（1457 实测:solid 324/solidTop 84/platforms 7;source 行号随版本锚走） ----
const solidN = [...solid.values()].filter((x) => x.v).length;
const solidTopN = [...solidTop.values()].filter((x) => x.v).length;
if (solidN < 300 || solidTopN < 70 || platformIds.size < 5) {
  throw new Error(`[extract-tile-collision] 锚点失配: 基数护栏 solid ${solidN}(<300)/solidTop ${solidTopN}(<70)/platforms ${platformIds.size}(<5)（解析面漂移,禁止静默半表）`);
}

// ================= ★BJ284 era guard：干跑对拍 / 沙箱 / 逃生门（头注见上） =================
const FRESH = JSON.stringify({
  // provenance 钉 1457 基线（tiles 数据面 1457↔1458 逐值全等,BJ284 定谳——静态串使 1458
  // 交叉重放与现库零差,动态串会在 provenance 字段假红）
  source: 'Terarria1457/Terraria/Main.cs + Terraria.ID/TileID.cs',
  note: 'solid=Main.tileSolid；solidTop=Main.tileSolidTop（frameY==0 顶行可站，Platforms 集合走 PlatformProperTopFrame(frameX)）；platform=TileID.Sets.Platforms',
  tiles: out,
}, null, 0);
/** 现库 vs 重产双向路径级 diff（对象键集+叶值;数组按位）。live-only=洗库预警面 /
 *  fresh-only=现库退化缺键型面（★G-1/S3 处方）/ drift=同路径值漂移。 */
function deepWash(live, fresh, prefix = '') {
  const out2 = { liveOnly: [], freshOnly: [], drift: [] };
  const base = prefix || '<root>';
  if (live === null || fresh === null || typeof live !== 'object' || typeof fresh !== 'object') {
    if (JSON.stringify(live) !== JSON.stringify(fresh)) out2.drift.push(`${base}: ${JSON.stringify(live)}→${JSON.stringify(fresh)}`);
    return out2;
  }
  if (Array.isArray(live) !== Array.isArray(fresh)) {
    out2.drift.push(`${base}: 类型漂移 ${Array.isArray(live) ? 'arr' : 'obj'}↔${Array.isArray(fresh) ? 'arr' : 'obj'}`);
    return out2;
  }
  const lk = new Set(Object.keys(live));
  const fk = new Set(Object.keys(fresh));
  for (const k of Object.keys(live)) {
    const p = `${prefix}.${k}`;
    if (!fk.has(k)) { out2.liveOnly.push(p); continue; }
    const w = deepWash(live[k], fresh[k], p);
    out2.liveOnly.push(...w.liveOnly); out2.freshOnly.push(...w.freshOnly); out2.drift.push(...w.drift);
  }
  for (const k of Object.keys(fresh)) if (!lk.has(k)) out2.freshOnly.push(`${prefix}.${k}`);
  return out2;
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
    console.error('[extract-tile-collision] 拒绝 --write-real：重产 diff 非纯增量（双向差异非空）——先逐值定谳（反编译为准）再回写。');
    washReport(wash);
    console.error('  确需原地强推：--force-full --overwrite-append-era 双旗（单旗仍拒）。');
    process.exit(1);
  }
  mkdirSync(OUT_JSON.slice(0, OUT_JSON.lastIndexOf('/')), { recursive: true });
  writeFileSync(OUT_JSON, FRESH);
  console.error(`[extract-tile-collision] 已写 ${OUT_JSON}（${WRITE_REAL ? '--write-real 真库' : 'SW_OUT 沙箱'}）`);
} else if (wash === null) {
  console.error('[extract-tile-collision] 干跑（零写盘）：现库缺 vanilla-tilecollision.json,跳过对拍。写盘须显式 SW_OUT=<dir> 或 --write-real。');
} else if (!washEmpty(wash)) {
  console.error('[extract-tile-collision] 干跑对拍：双向 diff 非空（live-only=洗库预警 / fresh-only=现库退化缺键型）——零写盘。');
  washReport(wash);
  console.error('  处置：逐值定谳（反编译为准）后 --write-real 定谳回写；沙箱试验用 SW_OUT=<dir>。');
  process.exit(1);
} else {
  console.error('[extract-tile-collision] 干跑对拍：重产盖住现库（双向零差,零写盘）。写盘须显式 SW_OUT=<dir> 或 --write-real。');
}
console.log(`solid=${solidN} solidTop=${solidTopN} platforms=${platformIds.size} → ${dest ?? '(干跑:零写盘)'}`);

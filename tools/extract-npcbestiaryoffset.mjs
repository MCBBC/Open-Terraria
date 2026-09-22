// 提取 NPCID.Sets.NPCBestiaryDrawOffset（1.4.5.7，NPCID.cs；★BJ183 基准对齐——
// GetGrox/Leinfors/Redigit 三段 1456↔1457 diff=0,对拍零漂移）全表 →
// src/data/vanilla-npcbestiaryoffset.json。
// 三段合并（NPCBestiaryDrawOffsetCreation :4955-4975）：GetGroxEntries → GetLeinforsEntries
// → GetRedigitEntries 依次覆盖（后写胜）。字段见 struct NPCBestiaryDrawModifiers（:15-41）。
// 消费语义（UnlockableNPCEntryIcon.Update :52-82）：scale=Scale（portrait 模式 PortraitScale
// 优先）+ Position 偏移 + Hide 不画本体 + CustomTexturePath 替换贴图 + Frame 选帧 +
// Rotation 旋转 + Velocity/Direction/SpriteDirection/IsWet 动画与朝向。
//
// ★BJ284 2026-09-22 era guard 落闸（四要素习语 docs/era-guard-family.md）：
//   ① SW_ITEM_VER 缺省 1457（白名单 {1457,1458}——BJ284 定谳 1458 交叉重放 fresh 与现库
//     逐字节零差；1456 显式拒+指引）;② 输出通道三分离：缺省=干跑对拍零写盘（双向路径级
//     diff,live-only=洗库预警/fresh-only=现库退化缺键型,任一非空 exit 1+物证）/ SW_OUT=沙箱 /
//     --write-real=逃生门（diff 非纯增量拒,强推双旗 --force-full --overwrite-append-era）；
//     双旗互斥+非 1457 禁写+探测注入面 SW_NPCBESTIARYOFFSET_JSON 与 --write-real 混用拒（g1）;
//   ③ 锚 fail-loud：三段签名（section() 原有 throw）+合并基数护栏 665;
//   ④ 判别力自证：tests/extract-tables-era-guard.test.ts（mutant ROOT_TRIGGER 前置重锚）。
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';

const ROOT = new URL('../../', import.meta.url).pathname;   // 仓库根（SandboxWorld/）
const VER = process.env.SW_ITEM_VER ?? '1457';
const VER_ALLOWED = new Set(['1457', '1458']);
if (!VER_ALLOWED.has(VER) || !existsSync(`${ROOT}Terarria${VER}/Terraria.ID/NPCID.cs`)) {
  console.error(`[extract-npcbestiaryoffset] 拒绝运行：SW_ITEM_VER="${VER}" 非法（白名单 ${[...VER_ALLOWED].join('/')}，且需存在 Terarria${VER}/ 反编译目录）。`);
  if (VER === '1456') console.error('  1456 锚集已退役（1457 基准 BJ284 落闸）；1456 对拍读时代快照。');
  process.exit(1);
}
const WRITE_REAL = process.argv.includes('--write-real');
const FORCE_FULL = process.argv.includes('--force-full');
const OVERWRITE_APPEND_ERA = process.argv.includes('--overwrite-append-era');
const SW_OUT = process.env.SW_OUT;
if (SW_OUT !== undefined && SW_OUT !== '' && WRITE_REAL) {
  console.error('[extract-npcbestiaryoffset] 拒绝运行：SW_OUT 与 --write-real 双旗互斥（输出通道必须唯一）。');
  process.exit(1);
}
if (WRITE_REAL && VER !== '1457') {
  console.error(`[extract-npcbestiaryoffset] 拒绝写真库：SW_ITEM_VER=${VER}≠1457（旧基线重放禁写 vanilla-npcbestiaryoffset.json）。`);
  process.exit(1);
}
if (WRITE_REAL && process.env.SW_NPCBESTIARYOFFSET_JSON !== undefined) {
  console.error('[extract-npcbestiaryoffset] 拒绝运行：探测注入面（SW_NPCBESTIARYOFFSET_JSON）已设置而 --write-real 将写真实现库（fail-closed）。');
  process.exit(1);
}
// ★M1 变异锚:干跑臂 null（守卫测试把 null 换成假现库路径,证明缺省零写盘是唯一拦截面）
const LIVE_JSON = process.env.SW_NPCBESTIARYOFFSET_JSON ?? new URL('../src/data/vanilla-npcbestiaryoffset.json', import.meta.url).pathname;
const OUT_JSON = WRITE_REAL ? LIVE_JSON : (SW_OUT ? `${SW_OUT.replace(/\/+$/, '')}/vanilla-npcbestiaryoffset.json` : null);

const SRC = `${ROOT}Terarria${VER}/Terraria.ID/NPCID.cs`;

const src = readFileSync(SRC, 'utf8');

function section(name) {
  const start = src.indexOf(`private static Dictionary<int, NPCBestiaryDrawModifiers> ${name}()`);
  if (start < 0) throw new Error(`找不到 ${name}`);
  const next = src.indexOf('private static Dictionary<int, NPCBestiaryDrawModifiers>', start + 60);
  return src.slice(start, next > 0 ? next : undefined);
}

function num(s) { return Number(s.replace(/f/g, '')); }

/** 单条目对象字面量 → 字段表 */
function parseEntry(body) {
  const o = {};
  let m;
  if ((m = body.match(/Position\s*=\s*new Vector2\(([^)]+)\)/))) {
    const [x, y] = m[1].split(',').map(num);
    o.position = [x, y];
  }
  if ((m = body.match(/PortraitPositionXOverride\s*=\s*([\d.]+)f?/))) o.portraitX = num(m[1]);
  if ((m = body.match(/PortraitPositionYOverride\s*=\s*([\d.]+)f?/))) o.portraitY = num(m[1]);
  if ((m = body.match(/Rotation\s*=\s*(-?[\d.]+)f?/))) o.rotation = num(m[1]);
  if ((m = body.match(/(?<!Portrait)Scale\s*=\s*(-?[\d.]+)f?/))) o.scale = num(m[1]);
  if ((m = body.match(/PortraitScale\s*=\s*(-?[\d.]+)f?/))) o.portraitScale = num(m[1]);
  if (/Hide\s*=\s*true/.test(body)) o.hide = true;
  if (/IsWet\s*=\s*true/.test(body)) o.wet = true;
  if ((m = body.match(/Frame\s*=\s*(\d+)/))) o.frame = Number(m[1]);
  if ((m = body.match(/Direction\s*=\s*(-?\d+)/))) o.direction = Number(m[1]);
  if ((m = body.match(/SpriteDirection\s*=\s*(-?\d+)/))) o.spriteDirection = Number(m[1]);
  if ((m = body.match(/Velocity\s*=\s*([\d.]+)f?/))) o.velocity = num(m[1]);
  if ((m = body.match(/CustomTexturePath\s*=\s*"([^"]+)"/))) {
    // Images/UI/Bestiary/NPCs/NPC_113 → 扁平化素材 basename
    o.customTexture = m[1].split('/').pop();
  }
  return o;
}

function parseSection(name) {
  const seg = section(name);
  const out = {};
  const re = /(-?\d+),\s*new NPCBestiaryDrawModifiers\((\d+)\)\s*\{/g;
  const opens = [];
  let m;
  while ((m = re.exec(seg))) opens.push({ id: Number(m[1]), braceAt: re.lastIndex });
  for (let i = 0; i < opens.length; i++) {
    const { id, braceAt } = opens[i];
    // 条目体 = 起始 { 到配对 }（体内容无嵌套花括号——已抽样核）
    const close = seg.indexOf('}', braceAt);
    const body = seg.slice(braceAt, close);
    const parsed = parseEntry(body);
    if (Object.keys(parsed).length) out[id] = parsed;
    else out[id] = {};   // 空修饰（如 new NPCBestiaryDrawModifiers(0) 无字段）——仍登记（语义=无覆盖）
  }
  return out;
}

// 覆盖序：grox 先铺 → leinfors 覆盖 → redigit 覆盖（Creation 循环序）
const merged = {};
for (const name of ['GetGroxEntries', 'GetLeinforsEntries', 'GetRedigitEntries']) {
  const sec = parseSection(name);
  let n = 0, s = 0;
  for (const [k, v] of Object.entries(sec)) {
    merged[k] = v;
    n++;
    if (v.scale != null || v.portraitScale != null) s++;
  }
  console.log(`${name}: ${n} 条（含 Scale ${s}）`);
}
// ---- ③ 基数护栏（1457 实测:合并 665 条——地板防静默半表） ----
const total = Object.keys(merged).length;
if (total < 600) throw new Error(`[extract-npcbestiaryoffset] 锚点失配: 合并基数 ${total} < 600（解析面漂移,禁止静默半表）`);

// ================= ★BJ284 era guard：干跑对拍 / 沙箱 / 逃生门（头注见上） =================
const FRESH = JSON.stringify(merged);
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
    console.error('[extract-npcbestiaryoffset] 拒绝 --write-real：重产 diff 非纯增量（双向差异非空）——先逐值定谳（反编译为准）再回写。');
    washReport(wash);
    console.error('  确需原地强推：--force-full --overwrite-append-era 双旗（单旗仍拒）。');
    process.exit(1);
  }
  mkdirSync(OUT_JSON.slice(0, OUT_JSON.lastIndexOf('/')), { recursive: true });
  writeFileSync(OUT_JSON, FRESH);
  console.error(`[extract-npcbestiaryoffset] 已写 ${OUT_JSON}（${WRITE_REAL ? '--write-real 真库' : 'SW_OUT 沙箱'}）`);
} else if (wash === null) {
  console.error('[extract-npcbestiaryoffset] 干跑（零写盘）：现库缺 vanilla-npcbestiaryoffset.json,跳过对拍。写盘须显式 SW_OUT=<dir> 或 --write-real。');
} else if (!washEmpty(wash)) {
  console.error('[extract-npcbestiaryoffset] 干跑对拍：双向 diff 非空（live-only=洗库预警 / fresh-only=现库退化缺键型）——零写盘。');
  washReport(wash);
  console.error('  处置：逐值定谳（反编译为准）后 --write-real 定谳回写；沙箱试验用 SW_OUT=<dir>。');
  process.exit(1);
} else {
  console.error('[extract-npcbestiaryoffset] 干跑对拍：重产盖住现库（双向零差,零写盘）。写盘须显式 SW_OUT=<dir> 或 --write-real。');
}
const withScale = Object.values(merged).filter(v => v.scale != null || v.portraitScale != null).length;
const hidden = Object.values(merged).filter(v => v.hide).length;
const custom = Object.values(merged).filter(v => v.customTexture).length;
console.log(`合并 ${total} 条 → ${OUT_JSON ?? '(干跑:零写盘)'}`);
console.log(`  Scale/PortraitScale ${withScale} / Hide ${hidden} / CustomTexture ${custom}`);
// 抽样核对（僵尸 3 仅 Velocity；50 KingSlime PortraitScale；113 骷髅商人 CustomTexture）
for (const probe of ['3', '50', '113', '4']) console.log(` ${probe}:`, JSON.stringify(merged[probe]));
